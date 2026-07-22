import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebarSource = await readFile(new URL('../pages/sidebar.js', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../pages/index.html', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../pages/ui.js', import.meta.url), 'utf8');

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
