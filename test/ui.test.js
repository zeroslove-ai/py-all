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
  // resumeGame delegates the actual load+restore logic to a shared helper
  // (also used by discardFailedTurn) rather than duplicating it.
  const restore = pageSource.match(/async function restoreToLastCommittedTurn\(message\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(restore, /loadGameContext\(\)/);
  assert.match(restore, /restoreLastTurn\(\)/);
  assert.doesNotMatch(restore, /stream\.story|api\.extract|api\.commitTurn/);
  const resume = pageSource.match(/async function resumeGame\(\)[\s\S]*?\n    }/)?.[0] || '';
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
  assert.match(pageSource, /close\(\); await resetAndStartNewGame\(\);/);
  const startSetup = pageSource.match(/async function startPlayerSetup\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(startSetup, /__START_PLAYER_SETUP__/);
});

test('resetAndStartNewGame resets state then immediately calls startPlayerSetup — no user input required to see recommendations', () => {
  const resetFn = pageSource.match(/async function resetAndStartNewGame\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(resetFn, /await api\.reset\(state\.gameId\)/);
  assert.match(resetFn, /ui\.clearGameView\(\)/);
  assert.match(resetFn, /state\.turnCount = 0/);
  assert.match(resetFn, /await startPlayerSetup\(\)/);
});

test('loadGameContext auto-starts player setup on a fresh/empty game (turn 0, incomplete setup, no memories) without requiring user input', () => {
  const loadFn = pageSource.match(/async function loadGameContext\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(loadFn, /state\.turnCount === 0/);
  assert.match(loadFn, /player_setup\?\.status !== 'complete'/);
  assert.match(loadFn, /recent_memories \|\| \[\]\)\.length/);
  assert.match(loadFn, /await startPlayerSetup\(\)/);
});

test('startPlayerSetup guards against duplicate concurrent Story requests with a startupRequested flag', () => {
  const startSetup = pageSource.match(/async function startPlayerSetup\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(startSetup, /state\.startupRequested/);
});

test('a failed auto-start (systemStart) shows a distinct "새 게임 다시 시작" retry button instead of demanding input', () => {
  const retryStoryFn = pageSource.match(/async function retryStory\(pending, extraFeedback = \[\]\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryStoryFn, /pending\.systemStart/);
  assert.match(retryStoryFn, /새 게임 다시 시작/);
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
  assert.match(retryExtract, /showPendingTurnActions/);
  assert.doesNotMatch(retryExtract, /DEEPSEEK_API_KEY|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(retryExtract, /\braw\b/);

  const retryCommit = pageSource.match(/async function retryCommit\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryCommit, /error\.details\?\.error_code/);
  assert.match(retryCommit, /error\.details\?\.request_id/);

  const retryStory = pageSource.match(/async function retryStory\(pending, extraFeedback = \[\]\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryStory, /error\.status/);
  assert.match(retryStory, /error\.requestId/);
});

test('an Extract failure locks the choice buttons and chat input, offers retry and discard, and flags the narrative as uncommitted', () => {
  const retryExtract = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryExtract, /ui\.markLastNarrativeUncommitted\(\)/);
  assert.match(retryExtract, /상태 분석 다시 시도/);
  assert.match(retryExtract, /이번 서사 버리고 이전 턴으로 돌아가기/);
  assert.match(retryExtract, /discardFailedTurn\(\)/);
  assert.match(retryExtract, /ui\.setChoicesEnabled\(false\)/);
  assert.match(retryExtract, /state\.inputLocked = true/);
  assert.match(retryExtract, /아직 저장되지 않았습니다/);

  const discardFn = pageSource.match(/async function discardFailedTurn\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(discardFn, /restoreToLastCommittedTurn/);
  assert.match(discardFn, /state\.inputLocked = false/);
  assert.match(discardFn, /ui\.setChatInputEnabled/);

  assert.match(uiSource, /showPendingTurnActions\(text, actions\)/);
  assert.match(uiSource, /markLastNarrativeUncommitted\(\)/);
  assert.match(uiSource, /setChatInputEnabled\(enabled\)/);
  // setLoading(false) must not silently override the failure lock —
  // this is what actually keeps retryStory's own redundant setLoading(false)
  // (called right after retryExtract returns) from re-enabling input.
  assert.match(uiSource, /setLoading\(active, label = '처리 중'\)[\s\S]*?state\.inputLocked/);
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
  // resumeGame and discardFailedTurn both delegate to this shared helper —
  // the actual last_choices/parseChoices logic lives there now, not
  // duplicated in either caller.
  const restore = pageSource.match(/async function restoreToLastCommittedTurn\(message\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(restore, /state\.context\?\.save\?\.last_choices/);
  assert.doesNotMatch(restore, /state\.context\?\.save\?\.active_suggestions/);
  assert.match(restore, /ui\.parseChoices/);

  const resume = pageSource.match(/async function resumeGame\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(resume, /restoreToLastCommittedTurn/);
  assert.doesNotMatch(resume, /stream\.story|api\.extract|api\.commitTurn/);
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

// ─────────────────────────────────────────────
// Pending-turn-action notice lifecycle, Story/Extract error split,
// narrative_replacement, ** stripping, post-commit state sync (4th stage)
// ─────────────────────────────────────────────

test('showPendingTurnActions/clearPendingTurnActions use a dedicated class, never .narrative, and disable both buttons the instant either is clicked', () => {
  const showFn = uiSource.match(/showPendingTurnActions\(text, actions\)[\s\S]*?\n  },/)?.[0] || '';
  assert.match(showFn, /className = 'pending-turn-action-notice'/);
  assert.match(showFn, /this\.clearPendingTurnActions\(\)/);
  // Every button in the notice must be disabled when ANY one of them is
  // clicked, not just the one the user pressed — a slow async action must
  // not leave a second button clickable in the meantime.
  assert.match(showFn, /buttons\.forEach\(b => \{ b\.disabled = true; \}\)/);

  const clearFn = uiSource.match(/clearPendingTurnActions\(\) \{[\s\S]*?\n  \},/)?.[0] || '';
  assert.match(clearFn, /querySelectorAll\('\.pending-turn-action-notice'\)/);

  assert.match(pageSource, /\.pending-turn-action-notice/);
});

test('retryStory/retryExtract/retryCommit/regenerateStoryAfterContractFailure all clear the pending-turn notice as their first act, so a stale notice never survives a retry, regenerate, or successful commit', () => {
  const retryStoryFn = pageSource.match(/async function retryStory\(pending, extraFeedback = \[\]\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryStoryFn, /ui\.clearPendingTurnActions\(\)/);

  const retryExtractFn = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryExtractFn, /ui\.clearPendingTurnActions\(\)/);
  assert.match(retryExtractFn, /ui\.clearUncommittedNarrativeBadges\(\)/);

  const retryCommitFn = pageSource.match(/async function retryCommit\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryCommitFn, /ui\.clearPendingTurnActions\(\)/);
  // Only on the success path — the uncommitted badge should disappear once
  // the turn is actually saved, not merely attempted.
  assert.match(retryCommitFn, /ui\.clearUncommittedNarrativeBadges\(\)[\s\S]*?saveFeedback\(\[\]\)/);

  const regenerateFn = pageSource.match(/async function regenerateStoryAfterContractFailure\(pending, validationErrors\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(regenerateFn, /ui\.clearPendingTurnActions\(\)/);
  assert.match(regenerateFn, /ui\.clearUncommittedNarrativeBadges\(\)/);
});

test('discarding a failed turn reloads server truth and restoreNarrative clears any leftover pending-turn notice/badge', () => {
  const discardFn = pageSource.match(/async function discardFailedTurn\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(discardFn, /restoreToLastCommittedTurn/);

  const restoreFn = pageSource.match(/async function restoreToLastCommittedTurn\(message\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(restoreFn, /restoreLastTurn\(\)/);

  const restoreLastTurnFn = pageSource.match(/function restoreLastTurn\(\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(restoreLastTurnFn, /ui\.restoreNarrative\(narrative\)/);

  // restoreNarrative is the single place that actually removes stale
  // .narrative/.divider nodes AND the pending-turn notice together, so
  // discard can't leave one without the other.
  const restoreNarrativeFn = uiSource.match(/restoreNarrative\(text\)[\s\S]*?\n  },/)?.[0] || '';
  assert.match(restoreNarrativeFn, /querySelectorAll\('\.narrative, \.divider'\)/);
  assert.match(restoreNarrativeFn, /this\.clearPendingTurnActions\(\)/);
});

test('STORY_NPC_CONTRACT_FAILED offers "같은 입력으로 서사 다시 생성", never the Extract-retry button, since retrying Extract alone cannot fix a Story-side contract violation', () => {
  const retryExtractFn = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  const contractBranch = retryExtractFn.match(/if \(code === 'STORY_NPC_CONTRACT_FAILED'\) \{[\s\S]*?\n        \} else \{/)?.[0] || '';
  assert.notEqual(contractBranch, '');
  assert.match(contractBranch, /같은 입력으로 서사 다시 생성/);
  assert.match(contractBranch, /regenerateStoryAfterContractFailure\(pending, validationErrors\)/);
  assert.doesNotMatch(contractBranch, /상태 분석 다시 시도/);
  assert.doesNotMatch(contractBranch, /retryExtract\(pending\)/);

  const extractFailBranch = retryExtractFn.slice(retryExtractFn.indexOf('} else {')) ;
  assert.match(extractFailBranch, /상태 분석 다시 시도/);
  assert.match(extractFailBranch, /onClick: \(\) => retryExtract\(pending\)/);
});

test('regenerateStoryAfterContractFailure discards the old narrative element by direct reference and forwards the Worker\'s validation_errors as one-shot Story feedback, never as in-world narration', () => {
  const regenerateFn = pageSource.match(/async function regenerateStoryAfterContractFailure\(pending, validationErrors\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(regenerateFn, /ui\.removeNarrativeElement\(pending\.narrativeElement\)/);
  assert.match(regenerateFn, /pending\.narrativeElement = null/);
  assert.match(regenerateFn, /pending\.narrative = null/);
  // The reasons text is passed into retryStory's extraFeedback array param,
  // which stream.story forwards as the Worker's own
  // "[USER FEEDBACK — APPLY TO THIS NEXT RESPONSE ONLY]" contract — never
  // rendered as a system/notice message and never narrated as the player's
  // own words.
  assert.match(regenerateFn, /await retryStory\(pending, \[`.*`\]\)/);
  assert.doesNotMatch(regenerateFn, /ui\.showSystemMessage/);
  assert.doesNotMatch(regenerateFn, /ui\.showPendingTurnActions/);

  // A defensive reset: if the regenerated Story attempt itself fails before
  // ever reaching retryExtract, this stops state.inputLocked from being
  // stuck at true (set by the FIRST failed attempt) while retryStory's own
  // catch block simultaneously re-enables choices.
  assert.match(regenerateFn, /state\.inputLocked = false/);
});

test('a CSA narrative_replacement overwrites this turn\'s exact Story element via its stored DOM reference, never appended to a notice or guessed from the last .narrative', () => {
  const retryExtractFn = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  const replacementBranch = retryExtractFn.match(/if \(result\.narrative_replacement\) \{[\s\S]*?\n        \} else if/)?.[0] || '';
  assert.notEqual(replacementBranch, '');
  assert.match(replacementBranch, /pending\.narrative = result\.narrative_replacement/);
  assert.match(replacementBranch, /pending\.narrativeElement\.textContent = ui\.stripBoldMarkers\(result\.narrative_replacement\)/);
  // Must be a direct assignment (overwrite), not string concatenation onto
  // whatever the element already held.
  assert.doesNotMatch(replacementBranch, /pending\.narrativeElement\.textContent \+=/);
  assert.doesNotMatch(replacementBranch, /appendToLastNarrative/);
  assert.doesNotMatch(pageSource, /function appendToLastNarrative/);

  // pending.narrativeElement itself is only ever populated from
  // finalizeNarrative()'s own return value — the exact node finalized for
  // THIS turn — never re-queried by scanning for "the last .narrative".
  const retryStoryFn = pageSource.match(/async function retryStory\(pending, extraFeedback = \[\]\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryStoryFn, /pending\.narrativeElement = ui\.finalizeNarrative\(\)/);
});

test('finalizeNarrative returns the exact DOM node it just finalized so later CSA/regeneration steps never have to re-query for it', () => {
  const finalizeFn = uiSource.match(/finalizeNarrative\(\)[\s\S]*?\n  },/)?.[0] || '';
  assert.match(finalizeFn, /return current \|\| null;/);
});

test('the Worker\'s STORY_NPC_CONTRACT_FAILED validation_errors are embedded only in the retryStory feedback array, never appended to a system notice or the on-screen narrative text', () => {
  const retryExtractFn = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  const contractBranch = retryExtractFn.match(/if \(code === 'STORY_NPC_CONTRACT_FAILED'\) \{[\s\S]*?\n        \} else \{/)?.[0] || '';
  // The notice text shown to the user is a fixed, generic sentence — the
  // raw validation_errors array is only threaded through to
  // regenerateStoryAfterContractFailure(pending, validationErrors), never
  // interpolated into showPendingTurnActions' own displayed text.
  assert.match(contractBranch, /서사가 등록 NPC 규칙을 위반했습니다\. \[\$\{code\}\]\$\{suffix\} 이 서사는 아직 저장되지 않았습니다\./);
  assert.doesNotMatch(contractBranch, /validationErrors\.join/);

  const regenerateFn = pageSource.match(/async function regenerateStoryAfterContractFailure\(pending, validationErrors\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(regenerateFn, /validationErrors\.join/);
  assert.doesNotMatch(regenerateFn, /ui\.showSystemMessage|ui\.showPendingTurnActions|ui\.showRetryNotice/);
});

test('** is stripped from on-screen narrative in finalizeNarrative, restoreNarrative, and choice text, without a full Markdown renderer', () => {
  assert.match(uiSource, /stripBoldMarkers\(text\)[\s\S]*?replace\(\/\\\*\\\*\/g, ''\)/);

  const finalizeFn = uiSource.match(/finalizeNarrative\(\)[\s\S]*?\n  },/)?.[0] || '';
  assert.match(finalizeFn, /current\.textContent = this\.stripBoldMarkers\(current\.textContent\)/);

  const restoreNarrativeFn = uiSource.match(/restoreNarrative\(text\)[\s\S]*?\n  },/)?.[0] || '';
  assert.match(restoreNarrativeFn, /div\.textContent = this\.stripBoldMarkers\(text\)/);

  const normalizeChoiceFn = uiSource.match(/normalizeChoice\(value\)[\s\S]*?\n  \},/)?.[0] || '';
  assert.match(normalizeChoiceFn, /this\.stripBoldMarkers\(String\(value \|\| ''\)\)/);

  // Defensive, display-only cleanup — not a Markdown renderer for headers,
  // italics, links, etc.
  assert.doesNotMatch(uiSource, /marked\.parse|markdown-it|DOMPurify/);
});

test('retryCommit deep-merges the Worker\'s state_patch into state.context.save right after commit, so 어플 정보 never shows a stale pre-commit snapshot', () => {
  const retryCommitFn = pageSource.match(/async function retryCommit\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryCommitFn, /if \(saved\.state_patch\) \{/);
  assert.match(retryCommitFn, /state\.context\.save = deepMergeStatePatch\(state\.context\.save, saved\.state_patch\)/);

  const deepMergeFn = pageSource.match(/function deepMergeStatePatch\(target, patch\)[\s\S]*?\n    }/)?.[0] || '';
  // Object-valued keys merge one level deep (so an untouched NPC's own
  // active_suggestions entry survives a patch that only carries another
  // NPC's array); everything else — arrays, primitives — overwrites
  // wholesale, matching the Worker's own JSONB patch semantics.
  assert.match(deepMergeFn, /isPlainObject\(value\) && isPlainObject\(merged\[key\]\) \? \{ \.\.\.merged\[key\], \.\.\.value \} : value/);

  assert.match(pageSource, /function showAppInfo\(\)[\s\S]*?state\.context\?\.save \|\| \{\}/);
});

test('input lock is re-synchronized at the top of retryExtract/retryCommit/regenerateStoryAfterContractFailure, so an outer caller\'s own setLoading(false) in a later finally can never silently re-enable input while a failure notice is still unresolved', () => {
  const retryExtractFn = pageSource.match(/async function retryExtract\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  // Set false at entry, then forced back to true in the finally IF this
  // specific attempt failed — never left dangling from a PREVIOUS attempt.
  assert.match(retryExtractFn, /state\.inputLocked = false;\s*\n\s*ui\.setLoading\(true, '상태 분석 중'\)/);
  assert.match(retryExtractFn, /if \(failed\) state\.inputLocked = true;/);

  const retryCommitFn = pageSource.match(/async function retryCommit\(pending\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(retryCommitFn, /state\.inputLocked = false;\s*\n\s*ui\.setLoading\(true, '턴 저장 중'\)/);

  const regenerateFn = pageSource.match(/async function regenerateStoryAfterContractFailure\(pending, validationErrors\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(regenerateFn, /validationErrors\) \{\s*\n\s*state\.inputLocked = false;/);

  // The actual guard: setLoading(false) must consult state.inputLocked
  // before touching the input, so a nested finally's own setLoading(false)
  // (running AFTER an inner function's finally already decided the lock)
  // can't clear it out from under a still-unresolved notice.
  const setLoadingFn = uiSource.match(/setLoading\(active, label = '처리 중'\)[\s\S]*?\n  \},/)?.[0] || '';
  assert.match(setLoadingFn, /state\.inputLocked/);
});

// ─────────────────────────────────────────────
// Choice-click integrity (5th stage) — a click must submit the choice's full
// sentence, never a bare index/marker, since only the Story prompt (not the
// UI) knows the choice's actual content, and a bare "2" is ambiguous once
// echoed back into the narrative continuity.
// ─────────────────────────────────────────────

test('renderChoices/renderGameplayChoices pass the full normalized choice sentence to onClick, never the loop index or a bare marker', () => {
  const renderChoicesFn = uiSource.match(/renderChoices\(choices, onClick\)[\s\S]*?\n  \},/)?.[0] || '';
  assert.match(renderChoicesFn, /const text = this\.normalizeChoice\(/);
  assert.match(renderChoicesFn, /onClick\(text\)/);
  assert.doesNotMatch(renderChoicesFn, /onClick\(index\)/);
  assert.doesNotMatch(renderChoicesFn, /onClick\(marker\)/);

  const renderGameplayFn = uiSource.match(/renderGameplayChoices\(choices, onClick, \{ setup = false \} = \{\}\)[\s\S]*?\n  \},/)?.[0] || '';
  assert.match(renderGameplayFn, /const all = \(choices \|\| \[\]\)\.map\(choice => this\.normalizeChoice\(/);
  assert.match(renderGameplayFn, /onClick\(text\)/);
  assert.doesNotMatch(renderGameplayFn, /onClick\(index\)/);

  // Every button in the group is disabled synchronously, before onClick
  // fires — a second/rapid click on a sibling button can never also fire,
  // so only one Story request is ever triggered per choice selection.
  assert.match(renderChoicesFn, /querySelectorAll\('button'\)\.forEach\(button => \{ button\.disabled = true;/);
  assert.match(renderGameplayFn, /querySelectorAll\('button'\)\.forEach\(item => \{ item\.disabled = true;/);
  assert.match(renderChoicesFn, /\{ once: true \}/);
  assert.match(renderGameplayFn, /\{ once: true \}/);
});

test('submitChoice forwards the full choice text into the same input path as free-typed text, and the user-facing message echoes that full text, not a number', () => {
  const submitChoiceFn = pageSource.match(/function submitChoice\(choiceText\)[\s\S]*?\n    }/)?.[0] || '';
  assert.match(submitChoiceFn, /document\.getElementById\('chat-input'\)\.value = choiceText/);
  assert.match(submitChoiceFn, /handleTurnInput\(\)/);

  const handleTurnInputFn = pageSource.match(/async function handleTurnInput\(\)[\s\S]*?\n    }/)?.[0] || '';
  // Reads the input box verbatim and sends it on, unmodified — no
  // marker/index substitution happens (or is needed) on the client, since
  // submitChoice already placed the full sentence there.
  assert.match(handleTurnInputFn, /const input = document\.getElementById\('chat-input'\)\.value\.trim\(\)/);
  assert.match(handleTurnInputFn, /ui\.addUserMessage\(input\)/);
  assert.match(handleTurnInputFn, /retryStory\(\{ input, nextTurn: state\.turnCount \+ 1/);

  const addUserMessageFn = uiSource.match(/addUserMessage\(text\)[\s\S]*?\n  \},/)?.[0] || '';
  assert.match(addUserMessageFn, /div\.textContent = `> \$\{text\}`/);
});
