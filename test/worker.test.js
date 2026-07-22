import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSavePatch,
  buildExtractPrompt,
  buildStoryPrompt,
  buildRecent100Plan,
  normalizeExtract,
  normalizeImageCatalog,
  selectImageId
} from '../worker/game-proxy-v2.js';
import worker from '../worker/game-proxy-v2.js';

function apiRequest(path, body = {}) {
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('context image catalog accepts DB id and exposes API image_id', () => {
  const catalog = normalizeImageCatalog([
    { id: 42, character_id: 'heroine1', situation: '복도', is_sexual: false }
  ]);
  assert.equal(catalog.heroine1[0].image_id, 42);
});

test('extract normalization converts numeric image IDs', () => {
  const extract = normalizeExtract({ image_id: '42' });
  assert.equal(extract.image_id, 42);
  assert.deepEqual(extract.choices, []);
  assert.deepEqual(extract.player_patch, {});
  assert.equal(extract.npc_emotion.physical_reaction, '');
  assert.equal(extract.is_sexual, false);
  assert.equal(extract.turn_summary, '');
});

test('recent100 boundary is Worker-owned at turns 99, 100 and 101', () => {
  const save = { recent100_start_turn: 0, story_summary_recent100: 'earlier' };
  const at99 = buildRecent100Plan(save, 99, 't99');
  const at100 = buildRecent100Plan(save, 100, 't100');
  const at101 = buildRecent100Plan({ recent100_start_turn: 100, story_summary_recent100: 't100' }, 101, 't101');
  assert.equal(at99.isBoundary, false);
  assert.equal(at100.isBoundary, true);
  assert.equal(at100.recentStartTurn, 100);
  assert.equal(at100.recentSummary, 't100');
  assert.equal(at101.isBoundary, false);
  assert.equal(at101.recentSummary, 't100\nt101');
});

test('image selection accepts only matching character and sexuality, then falls back safely', () => {
  const catalog = [
    { id: 1, character_id: 'heroine1', is_sexual: false },
    { id: 2, character_id: 'heroine1', is_sexual: true },
    { id: 3, character_id: 'heroine2', is_sexual: false }
  ];
  assert.equal(selectImageId(catalog, 'heroine1', 2, 1, true), 2);
  assert.equal(selectImageId(catalog, 'heroine1', 2, 1, false), 1);
  assert.equal(selectImageId(catalog, 'heroine1', 3, 1, false), 1);
  assert.equal(selectImageId([], 'heroine1', 99, null, false), null);
});

test('extract prompt receives raw player input separately from the narrative', () => {
  const prompt = buildExtractPrompt(
    '진행자가 플레이어의 답을 되묻는다.',
    '민준 / 의사',
    { master: {}, save: {} },
    [],
    1
  );

  assert.match(prompt, /\[플레이어의 이번 원본 입력\]\n민준 \/ 의사/);
  assert.match(prompt, /서사에 다시 적혀 있지 않아도 반드시 player_patch/);
  assert.match(prompt, /\[방금 생성된 서사\]\n진행자가 플레이어의 답을 되묻는다/);
});

test('save patch nests NPC state under character ID', () => {
  const patch = buildSavePatch({
    character_id: 'heroine3',
    image_id: 9,
    npc_stats: { 호감도: 20 },
    npc_emotion: { surface: '침착', inner: '긴장' },
    player_patch: { name: '테스터' },
    story_summary_overall: '전체',
    story_summary_recent100: '최근',
    choices: ['계속한다']
  }, { opening_started: true });

  assert.deepEqual(patch.npc_stats, { heroine3: { 호감도: 20 } });
  assert.deepEqual(patch.npc_emotion, {
    heroine3: { surface: '침착', inner: '긴장' }
  });
  assert.deepEqual(patch.player, { name: '테스터' });
  assert.equal(patch.opening_started, true);
  assert.equal('player_patch' in patch, false);
  assert.equal('dialogue_lines' in patch, false);
});

test('save patch preserves player data and does not let extract control recent100 fields', () => {
  const patch = buildSavePatch({ character_id: 'heroine1', player_patch: { name: 'player', job: 'doctor' } }, {}, {
    isBoundary: false, recentSummary: 'turn summary', recentStartTurn: 0
  });
  assert.deepEqual(patch.player, { name: 'player', job: 'doctor' });
  assert.equal(patch.story_summary_recent100, 'turn summary');
  assert.equal(patch.recent100_start_turn, 0);
});

test('first generated turn receives rulebook while normal turn omits it', () => {
  const ctx = {
    master: {
      rulebook_game_system: '규칙 본문',
      characters: {}
    },
    save: { player: {} },
    recent_memories: []
  };
  const first = buildStoryPrompt(ctx, '시작', 0);
  const normal = buildStoryPrompt({
    ...ctx,
    save: { player: { name: '플레이어' }, opening_started: true }
  }, '행동', 1);

  assert.match(first.messages[0].content, /규칙 본문/);
  assert.doesNotMatch(normal.messages[0].content, /규칙 본문/);
});

test('story prompt excludes mind monitor and preserves full display format', () => {
  const displayFormat = '상황판 전체 항목을 유지한다. '.repeat(700);
  const prompt = buildStoryPrompt({
    master: { rulebook_display_format: displayFormat }, save: { player: {} }, recent_memories: []
  }, '시작', 0);
  assert.match(prompt.messages[0].content, /마인드 모니터는 본문에 절대 출력하지 않는다/);
  assert.equal(prompt.messages[0].content.includes(displayFormat), true);
});

test('opening mode remains explicit until opening is committed', () => {
  const prompt = buildStoryPrompt({
    master: { opening_scenario: '오프닝' },
    save: { player: { name: '플레이어' } },
    recent_memories: []
  }, '계속', 1);
  assert.equal(prompt.mode, 'opening');
});

test('legacy save APIs return 410 Gone', async () => {
  for (const path of ['/api/save-turn', '/api/set-save']) {
    const response = await worker.fetch(apiRequest(path), {});
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /commit-turn/);
  }
});

test('commit-turn rejects non-object extract before persistence', async () => {
  for (const extract of [null, [], 'not-an-object']) {
    const response = await worker.fetch(apiRequest('/api/commit-turn', {
      game_id: 'test-game', turn_number: 1, content: 'test', extract
    }), {});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'extract must be a non-null JSON object');
  }
});

test('version endpoint exposes Cloudflare version metadata', async () => {
  const response = await worker.fetch(apiRequest('/api/version'), {
    VERSION_METADATA: { id: 'version-id', tag: 'git-tag', message: 'git:commit' }
  });
  assert.deepEqual(await response.json(), {
    worker: 'game-proxy-v2', version_id: 'version-id', tag: 'git-tag'
  });
});
