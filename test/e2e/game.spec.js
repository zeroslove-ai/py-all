import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BASE_URL = trimSlash(process.env.E2E_BASE_URL || 'https://gamebuilder-v2.zeroslove.workers.dev');
const API_BASE = trimSlash(process.env.E2E_API_BASE || 'https://game-proxy-v2.zeroslove.workers.dev');
const MODE = process.env.E2E_MODE || 'smoke';
const SMOKE_GAME_ID = process.env.E2E_SMOKE_GAME_ID || '9ed5b835-9948-4cad-ac25-3ebff7348574';
const TEST_GAME_ID = (process.env.E2E_TEST_GAME_ID || '').trim();
const PLAYER_INPUT = process.env.E2E_PLAYER_INPUT || '현재 상황을 확인하고 차분하게 대화를 이어간다.';
const EXPECTED_VERSION_ID = (process.env.E2E_EXPECTED_VERSION_ID || '').trim();
const VERSION_WAIT_MINUTES = Math.max(0, Number(process.env.E2E_VERSION_WAIT_MINUTES) || 0);
const RESULT_DIR = path.resolve('test-results/game-e2e');

fs.mkdirSync(RESULT_DIR, { recursive: true });

test.describe.configure({ mode: 'serial' });

const report = {
  generated_at: new Date().toISOString(),
  mode: MODE,
  base_url: BASE_URL,
  api_base: API_BASE,
  smoke_game_id: SMOKE_GAME_ID,
  test_game_id: TEST_GAME_ID || null,
  smoke: null,
  one_turn: null
};

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function resultPath(name) {
  return path.join(RESULT_DIR, name);
}

function writeJson(name, value) {
  fs.writeFileSync(resultPath(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseTurnCount(text) {
  const match = String(text || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function startDiagnostics(page) {
  const data = { console: [], page_errors: [], api_responses: [] };

  page.on('console', message => {
    const entry = {
      at: new Date().toISOString(),
      type: message.type(),
      text: message.text(),
      values: []
    };
    data.console.push(entry);
    Promise.all(message.args().map(async argument => {
      try { return await argument.jsonValue(); }
      catch { return '[unserializable]'; }
    })).then(values => { entry.values = values; }).catch(() => {});
  });

  page.on('pageerror', error => {
    data.page_errors.push({
      at: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: error.stack || null
    });
  });

  page.on('response', response => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const entry = {
      at: new Date().toISOString(),
      url,
      method: response.request().method(),
      status: response.status(),
      request_id: response.headers()['x-request-id'] || null,
      server_timing: response.headers()['server-timing'] || null
    };
    data.api_responses.push(entry);
  });

  return data;
}

async function waitForVersion(request) {
  const deadline = Date.now() + VERSION_WAIT_MINUTES * 60 * 1000;
  let latest = null;

  do {
    const response = await request.get(`${API_BASE}/api/version`);
    expect(response.ok(), `GET /api/version returned ${response.status()}`).toBeTruthy();
    latest = await responseJson(response);
    if (!EXPECTED_VERSION_ID || latest?.version_id === EXPECTED_VERSION_ID) return latest;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 30_000));
  } while (true);

  throw new Error(`Worker version mismatch: expected=${EXPECTED_VERSION_ID}, actual=${latest?.version_id || 'null'}`);
}

async function fetchContext(request, gameId) {
  const response = await request.post(`${API_BASE}/api/context`, {
    data: { game_id: gameId }
  });
  const body = await responseJson(response);
  expect(response.ok(), `POST /api/context returned ${response.status()}: ${JSON.stringify(body)}`).toBeTruthy();
  expect(typeof body?.turn_count).toBe('number');
  expect(body?.context).toBeTruthy();
  return body;
}

async function openGame(page, gameId) {
  await page.addInitScript(({ id }) => {
    localStorage.setItem('autoTts', 'false');
    localStorage.setItem('gameId', id);
    sessionStorage.clear();
  }, { id: gameId });

  await page.goto(`${BASE_URL}/?game=${encodeURIComponent(gameId)}`, {
    waitUntil: 'domcontentloaded'
  });

  await expect(page.locator('h1')).toContainText('게임빌더 v2');
  await expect(page.locator('#loading')).not.toHaveClass(/active/, { timeout: 45_000 });
  await expect.poll(async () => (await page.locator('#game-title').textContent())?.trim(), {
    timeout: 45_000,
    message: 'game title did not load from /api/context'
  }).not.toBe('게임 제목');

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('컨텍스트 로드 실패');
  await expect(page.locator('#tts-toggle')).toHaveText(/음성 OFF/);
}

function extractConsoleTiming(diagnostics, marker) {
  const entry = [...diagnostics.console].reverse().find(item => item.text.includes(marker));
  if (!entry) return null;
  const objectValue = entry.values.find(value => value && typeof value === 'object' && !Array.isArray(value));
  return objectValue || { text: entry.text };
}

function buildMarkdown(value) {
  const lines = [
    '# Game E2E 결과',
    '',
    `- 생성: ${value.generated_at}`,
    `- 모드: ${value.mode}`,
    `- 페이지: ${value.base_url}`,
    `- API: ${value.api_base}`,
    ''
  ];

  if (value.smoke) {
    lines.push('## 읽기 전용 Smoke', '');
    lines.push(`- Worker version_id: ${value.smoke.worker_version_id || 'null'}`);
    lines.push(`- API turn_count: ${value.smoke.api_turn_count}`);
    lines.push(`- UI turn_count: ${value.smoke.ui_turn_count}`);
    lines.push(`- Page errors: ${value.smoke.page_error_count}`);
    lines.push(`- API responses observed: ${value.smoke.api_response_count}`);
    lines.push('');
  }

  if (value.one_turn) {
    lines.push('## 실제 1턴', '');
    lines.push(`- game_id: ${value.one_turn.game_id}`);
    lines.push(`- turn: ${value.one_turn.initial_turn} → ${value.one_turn.final_turn}`);
    lines.push(`- browser elapsed: ${value.one_turn.browser_elapsed_ms} ms`);
    lines.push(`- character_id: ${value.one_turn.character_id || 'null'}`);
    lines.push(`- image_id: ${value.one_turn.image_id ?? 'null'}`);
    lines.push(`- Story request_id: ${value.one_turn.story_request_id || 'null'}`);
    lines.push(`- Extract request_id: ${value.one_turn.extract_request_id || 'null'}`);
    lines.push(`- Commit request_id: ${value.one_turn.commit_request_id || 'null'}`);
    lines.push(`- Story first content: ${value.one_turn.turn_timing?.story_first_content_ms ?? 'null'} ms`);
    lines.push(`- Story total: ${value.one_turn.turn_timing?.story_total_ms ?? 'null'} ms`);
    lines.push(`- Extract DeepSeek: ${value.one_turn.turn_timing?.extract_total_ms ?? 'null'} ms`);
    lines.push(`- Commit total: ${value.one_turn.turn_timing?.commit_total_ms ?? 'null'} ms`);
    lines.push(`- Turn total: ${value.one_turn.turn_timing?.total_ms ?? 'null'} ms`);
    lines.push(`- Page errors: ${value.one_turn.page_error_count}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

test.afterAll(async () => {
  report.generated_at = new Date().toISOString();
  writeJson('summary.json', report);
  fs.writeFileSync(resultPath('summary.md'), buildMarkdown(report), 'utf8');
});

test('read-only production smoke: version, context and browser load', async ({ page, request }) => {
  const diagnostics = startDiagnostics(page);
  const version = await waitForVersion(request);
  const context = await fetchContext(request, SMOKE_GAME_ID);

  await openGame(page, SMOKE_GAME_ID);
  const uiTurn = parseTurnCount(await page.locator('#turn-count').textContent());
  expect(uiTurn).toBe(context.turn_count);
  expect(diagnostics.page_errors).toHaveLength(0);

  await page.screenshot({ path: resultPath('smoke.png'), fullPage: true });
  await page.waitForTimeout(300);
  writeJson('smoke-diagnostics.json', diagnostics);

  report.smoke = {
    worker_version_id: version?.version_id || null,
    worker_tag: version?.tag || null,
    api_turn_count: context.turn_count,
    ui_turn_count: uiTurn,
    game_title: (await page.locator('#game-title').textContent())?.trim() || null,
    page_error_count: diagnostics.page_errors.length,
    api_response_count: diagnostics.api_responses.length
  };
});

test('manual one-turn flow on a dedicated test game', async ({ page, request }) => {
  test.skip(MODE !== 'one_turn', 'workflow mode is smoke');
  expect(TEST_GAME_ID, 'one_turn mode requires a dedicated test_game_id').not.toBe('');
  expect(TEST_GAME_ID, 'production game_id is blocked for mutating E2E tests').not.toBe(SMOKE_GAME_ID);

  const before = await fetchContext(request, TEST_GAME_ID);
  const diagnostics = startDiagnostics(page);
  await openGame(page, TEST_GAME_ID);

  const storyPromise = page.waitForResponse(response =>
    response.url().startsWith(API_BASE) && new URL(response.url()).pathname === '/api/story' && response.request().method() === 'POST',
  { timeout: 3 * 60 * 1000 });
  const extractPromise = page.waitForResponse(response =>
    response.url().startsWith(API_BASE) && new URL(response.url()).pathname === '/api/extract' && response.request().method() === 'POST',
  { timeout: 5 * 60 * 1000 });
  const commitPromise = page.waitForResponse(response =>
    response.url().startsWith(API_BASE) && new URL(response.url()).pathname === '/api/commit-turn' && response.request().method() === 'POST',
  { timeout: 7 * 60 * 1000 });

  const startedAt = Date.now();
  await expect(page.locator('#chat-input')).toBeEnabled();
  await page.locator('#chat-input').fill(PLAYER_INPUT);
  await page.locator('#chat-send').click();

  const storyResponse = await storyPromise;
  expect(storyResponse.ok(), `Story returned ${storyResponse.status()}`).toBeTruthy();

  const extractResponse = await extractPromise;
  const extractBody = await responseJson(extractResponse);
  expect(extractResponse.ok(), `Extract returned ${extractResponse.status()}: ${JSON.stringify(extractBody)}`).toBeTruthy();

  const commitResponse = await commitPromise;
  const commitBody = await responseJson(commitResponse);
  expect(commitResponse.ok(), `Commit returned ${commitResponse.status()}: ${JSON.stringify(commitBody)}`).toBeTruthy();

  const expectedTurn = before.turn_count + 1;
  await expect.poll(async () => parseTurnCount(await page.locator('#turn-count').textContent()), {
    timeout: 60_000,
    message: 'UI turn count did not advance after commit'
  }).toBe(expectedTurn);
  await expect(page.locator('#loading')).not.toHaveClass(/active/, { timeout: 60_000 });

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('서사 생성에 실패했습니다');
  expect(bodyText).not.toContain('상태 분석에 실패했습니다');
  expect(bodyText).not.toContain('저장에 실패했습니다');
  expect(commitBody?.turn_count).toBe(expectedTurn);
  expect(diagnostics.page_errors).toHaveLength(0);

  await page.waitForTimeout(500);
  const turnTiming = extractConsoleTiming(diagnostics, '[turn-timing]');
  const extractTiming = extractConsoleTiming(diagnostics, '[extract-timing]');

  await page.screenshot({ path: resultPath('one-turn.png'), fullPage: true });
  writeJson('one-turn-diagnostics.json', diagnostics);
  writeJson('one-turn-extract-response.json', extractBody);
  writeJson('one-turn-commit-response.json', commitBody);

  report.one_turn = {
    game_id: TEST_GAME_ID,
    player_input: PLAYER_INPUT,
    initial_turn: before.turn_count,
    final_turn: commitBody.turn_count,
    browser_elapsed_ms: Date.now() - startedAt,
    character_id: extractBody?.extract?.character_id || null,
    image_id: commitBody?.image_id ?? null,
    image_scene_role: commitBody?.image_scene_role || null,
    story_request_id: storyResponse.headers()['x-request-id'] || null,
    extract_request_id: extractBody?.request_id || null,
    commit_request_id: commitBody?.request_id || null,
    story_server_timing: storyResponse.headers()['server-timing'] || null,
    extract_timing: extractBody?.timing || extractTiming,
    commit_timing: commitBody?.timing || null,
    turn_timing: turnTiming,
    page_error_count: diagnostics.page_errors.length,
    api_responses: diagnostics.api_responses
  };
});
