import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebarSource = await readFile(new URL('../pages/sidebar.js', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../pages/index.html', import.meta.url), 'utf8');

test('NPC status is rendered as one inline status sentence, not five rows', () => {
  const renderStats = sidebarSource.match(/renderStats\(stats[\s\S]*?\n  signal\(/)?.[0] || '';
  assert.match(renderStats, /npc-status-inline/);
  assert.match(renderStats, /document\.createTextNode\(' · '\)/);
  assert.doesNotMatch(renderStats, /this\.row\(/);
  assert.doesNotMatch(renderStats, /stat-row/);
  assert.match(pageSource, /max-height: 2\.6em/);
});

test('sidebar resume button and slash command share resumeGame without turn APIs', () => {
  assert.match(sidebarSource, /id="resume-game-button"/);
  assert.match(sidebarSource, /window\.resumeGame/);
  assert.match(pageSource, /command === '\/플레이'[\s\S]*?await resumeGame\(\)/);
  const resume = pageSource.match(/async function resumeGame\(\)[\s\S]*?\n    }\n\n    async function startPlayerSetup/)?.[0] || '';
  assert.match(resume, /loadGameContext\(\)/);
  assert.match(resume, /restoreLastTurn\(\)/);
  assert.doesNotMatch(resume, /stream\.story|api\.extract|api\.commitTurn/);
});
