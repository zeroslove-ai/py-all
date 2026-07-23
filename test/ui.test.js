import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebarSource = await readFile(new URL('../pages/sidebar.js', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../pages/index.html', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../pages/ui.js', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../pages/api.js', import.meta.url), 'utf8');
const streamSource = await readFile(new URL('../pages/stream.js', import.meta.url), 'utf8');

test('NPC status is rendered as one inline status sentence, not five rows', () => {
  const renderStats = sidebarSource.match(/renderStats\(stats[\s\S]*?\n  signal\(/)?.[0] || '';
  assert.match(renderStats, /npc-status-inline/);
  assert.match(renderStats, /document\.createTextNode\(' · '\)/);
  assert.doesNotMatch(renderStats, /this\.row\(/);
  assert.doesNotMatch(renderStats, /stat-row/);
  assert.match(pageSource, /max-height: 2\.6em/);
  assert.match(sidebarSource, /storedChanges/);
  assert.match(sidebarSource, /storedDelta/);
});

test('sidebar resume button and slash command share resumeGame without turn APIs', () => {
  assert.match(sidebarSource, /id="app-info-side-button"/);
  assert.match(sidebarSource, /id="resume-game-button"/);
  assert.match(sidebarSource, /window\.showAppInfo/);
  assert.match(sidebarSource, /window\.resumeGame/);
  assert.match(pageSource, /command === '\/플레이'[\s\S]*?await resumeGame\(\)/);
  const resume = pageSource.match(/async function resumeGame\(\)[\s\S]*?\n    }\n\n    async function startPlayerSetup/)?.[0] || '';
  assert.match(resume, /loadGameContext\(\)/);
  assert.match(resume, /restoreLastTurn\(\)/);
  assert.doesNotMatch(resume, /stream\.story|api\.extract|api\.commitTurn/);
});

test('sidebar uses compact character facts and relationship counters, not choice app-info UI', () => {
  assert.match(sidebarSource, /renderCharacterInfo/);
  assert.match(sidebarSource, /💦 사정/);
  assert.match(sidebarSource, /✨ 오르가즘/);
  assert.doesNotMatch(sidebarSource, /캐릭터명/);
  assert.match(pageSource, /side-action-row/);
  assert.match(pageSource, /width: calc\(50% - 4px\)/);
  assert.doesNotMatch(uiSource, /choice-btn app-info|className = 'choice-btn app-info'/);
  assert.doesNotMatch(pageSource, /어플 정보 보기/);
});

test('reset clears the view and starts only the player setup prologue', () => {
  assert.match(pageSource, /await api\.reset\(state\.gameId\); close\(\); ui\.clearGameView\(\); await loadGameContext\(\); await startPlayerSetup\(\);/);
  const startSetup = pageSource.match(/async function startPlayerSetup\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(startSetup, /__START_PLAYER_SETUP__/);
});

test('mind monitor preserves quoted monologues and separates observable reactions', () => {
  assert.match(sidebarSource, /id="mind-surface"/);
  assert.match(sidebarSource, /id="mind-inner"/);
  assert.match(sidebarSource, /id="mind-physical"/);
  assert.match(pageSource, /white-space: pre-wrap/);
  assert.match(pageSource, /font-style: italic/);
});

test('loading status follows the narrative and stays above the bottom controls', () => {
  assert.match(pageSource, /<div class="story-stream" id="story-stream"><\/div>\s*<div class="loading story-loading" id="loading" role="status" aria-live="polite">/);
  assert.doesNotMatch(pageSource, /<div class="story-stream" id="story-stream">\s*<div class="loading"/);
  assert.match(pageSource, /\.story-loading\s*{[\s\S]*?flex-shrink: 0;/);
  assert.match(pageSource, /\.story-loading\s*{[\s\S]*?scroll-margin-bottom: 76px;/);
  assert.match(uiSource, /setLoading\(active, label = '처리 중'\)[\s\S]*?if \(active\)[\s\S]*?this\.scrollToBottom\(\)/);
});

// ─────────────────────────────────────────────
// Turn speed, Extract stability, and Story continuity (3rd stage)
// ─────────────────────────────────────────────

test('extract failure surfaces error_code and request_id to the user without leaking raw output or keys', () => {
  const retryExtract = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryExtract, /error\.details\?\.error_code/);
  assert.match(retryExtract, /error\.details\?\.request_id/);
  assert.match(retryExtract, /showRetryNotice/);
  assert.doesNotMatch(retryExtract, /DEEPSEEK_API_KEY|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(retryExtract, /\braw\b/);

  const retryCommit = pageSource.match(/async function retryCommit\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryCommit, /error\.details\?\.error_code/);
  assert.match(retryCommit, /error\.details\?\.request_id/);

  const retryStory = pageSource.match(/async function retryStory\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryStory, /error\.status/);
  assert.match(retryStory, /error\.requestId/);
});

test('api.js routes context/extract/image/reset through readApiResponse so ApiError carries error_code and request_id', () => {
  assert.match(apiSource, /class ApiError extends Error/);
  assert.match(apiSource, /async function readApiResponse\(res, label\)/);
  const contextFn = apiSource.match(/async context\(gameId\)[\s\S]*?\n  },/)?.[0] || '';
  assert.match(contextFn, /readApiResponse\(res, 'context'\)/);
  const extractFn = apiSource.match(/async extract\([\s\S]*?\n  },/)?.[0] || '';
  assert.match(extractFn, /readApiResponse\(res, 'extract'\)/);
  assert.doesNotMatch(extractFn, /return data\.extract;/);
  const imageFn = apiSource.match(/async image\([\s\S]*?\n  },/)?.[0] || '';
  assert.match(imageFn, /readApiResponse\(res, 'image'\)/);
  const resetFn = apiSource.match(/async reset\(gameId\)[\s\S]*?\n  }/)?.[0] || '';
  assert.match(resetFn, /readApiResponse\(res, 'reset'\)/);
});

test('resumeGame uses save.last_choices, not active_suggestions, for the restored choice list', () => {
  const resume = pageSource.match(/async function resumeGame\(\)[\s\S]*?\n    }\n\n    async function startPlayerSetup/)?.[0] || '';
  assert.match(resume, /state\.context\?\.save\?\.last_choices/);
  assert.doesNotMatch(resume, /state\.context\?\.save\?\.active_suggestions/);
  assert.match(resume, /ui\.parseChoices/);
});

test('showAppInfo renders active_suggestions as a per-NPC structured map, not a flat array', () => {
  const showAppInfo = pageSource.match(/function showAppInfo\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(showAppInfo, /!Array\.isArray\(save\.active_suggestions\)/);
  assert.match(showAppInfo, /Object\.entries\(suggestionMap\)/);
  assert.match(showAppInfo, /characters\[characterId\]/);
});

test('the frontend never duplicates the Worker\'s own DeepSeek retry loop', () => {
  assert.doesNotMatch(pageSource, /async function retryRequest\(/);
});

test('stream.story measures fetch_headers_ms, first_content_ms, and stream_total_ms separately, and forwards X-Request-ID', () => {
  assert.match(streamSource, /fetch_headers_ms/);
  assert.match(streamSource, /first_content_ms/);
  assert.match(streamSource, /stream_total_ms/);
  assert.match(streamSource, /X-Request-ID/);
  assert.match(streamSource, /recordFirstContent/);
});

test('the frontend logs per-stage turn timing without exposing a permanent on-screen dev timer', () => {
  const retryCommit = pageSource.match(/async function retryCommit\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryCommit, /console\.info\('\[turn-timing\]'/);
  assert.match(retryCommit, /story_first_content_ms/);
  assert.match(retryCommit, /extract_total_ms/);
  assert.match(retryCommit, /commit_total_ms/);
  assert.doesNotMatch(pageSource, /id="turn-timing-display"/);
});
