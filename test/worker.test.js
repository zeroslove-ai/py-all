import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSavePatch,
  buildExtractPrompt,
  buildStoryPrompt,
  buildRecent100Plan,
  calculateProgress,
  normalizeExtract,
  normalizeImageCatalog,
  selectImageId,
  applyNpcStatChanges,
  getCsaLimits,
  applyCsaAction,
  isCsaApplicable,
  filterMainNpcDialogue,
  normalizeRelationshipState,
  isSetupComplete,
  isApprovalInput,
  mergeRecommendation,
  normalizeRegisteredNpcExtract,
  mindMonologueLength,
  validateMindMonologue,
  validateNpcEmotion
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

test('mind monitor requires quoted first-person monologues and two observable sentences', () => {
  const valid = {
    surface: '“갑자기 나타나 당황스럽지만 티를 내지 말자. 우선 침착하게 신분부터 확인하고 내 역할을 지키면 된다.”',
    inner: '“나는 처음 보는 사람인데 시선이 자꾸 신경 쓰인다. 경계해야 하는데 왜 조금 더 말을 들어 보고 싶은 걸까.”',
    physical_reaction: '그녀는 차트를 가슴 쪽으로 끌어안고 시선을 한 번 피한다. 숨을 고른 뒤 낮은 목소리로 신분을 묻는다.'
  };
  assert.equal(mindMonologueLength(valid.surface) >= 40, true);
  assert.deepEqual(validateMindMonologue(valid.surface, 'surface'), []);
  assert.deepEqual(validateNpcEmotion(valid, 'heroine1'), { ok: true, errors: [] });
  const invalid = validateNpcEmotion({
    surface: '약간 당황하고 의심스러운 상태다.',
    inner: '낯선 남자에게 호기심과 경계심을 느끼고 있다.',
    physical_reaction: '손을 움켜쥔다.'
  }, 'heroine1');
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /surface: .*minimum 40/);
  assert.match(invalid.errors.join('\n'), /physical_reaction: 1 sentences/);
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

test('Extract keeps all unique dialogue from the main NPC only', () => {
  const lines = filterMainNpcDialogue({ character_id: 'heroine1', dialogue_lines: [
    { speaker: 'Main', text: 'first', direction: 'softly' },
    { speaker: 'Player', text: 'excluded' },
    { speaker: 'Main', text: 'first', direction: 'duplicate' },
    { speaker: 'Main', text: 'second', direction: 'firmly' }
  ] }, { heroine1: { name: 'Main' } });
  assert.deepEqual(lines, [{ speaker: 'Main', text: 'first', direction: 'softly' }, { speaker: 'Main', text: 'second', direction: 'firmly' }]);
});

test('Extract TTS dialogue keeps order and supplies a non-empty direction', () => {
  const lines = filterMainNpcDialogue({ character_id: 'heroine1', dialogue_lines: [
    { speaker: 'Main', text: 'first line', direction: '' },
    { speaker: 'Other NPC', text: 'excluded', direction: 'calmly' },
    { speaker: 'Main', text: 'second line', direction: 'softly' },
    { speaker: 'Player', text: 'excluded', direction: 'firmly' }
  ] }, { heroine1: { name: 'Main' } });
  assert.deepEqual(lines, [
    { speaker: 'Main', text: 'first line', direction: 'neutral' },
    { speaker: 'Main', text: 'second line', direction: 'softly' }
  ]);
});

test('NPC relationship state uses non-negative cumulative counters', () => {
  assert.deepEqual(normalizeRelationshipState({}, {}), { player_ejaculation_count: 0, npc_orgasm_count: 0 });
  assert.deepEqual(
    normalizeRelationshipState(
      { player_ejaculation_count: 2, npc_orgasm_count: 1 },
      { player_ejaculation_count: 1, npc_orgasm_count: 3 }
    ),
    { player_ejaculation_count: 2, npc_orgasm_count: 3 }
  );
});

test('relationship counters are saved for the current character only', () => {
  const patch = buildSavePatch(
    { character_id: 'heroine1', npc_relationship_state: { player_ejaculation_count: 1, npc_orgasm_count: 4 } },
    {},
    null,
    { npc_relationship_state: { heroine1: { player_ejaculation_count: 2, npc_orgasm_count: 3 } } }
  );
  assert.deepEqual(patch.npc_relationship_state, {
    heroine1: { player_ejaculation_count: 2, npc_orgasm_count: 4 }
  });
});

test('Worker owns experience and level progression', () => {
  assert.deepEqual(calculateProgress({ level: 1, exp: 9 }, 'minor'), { level: 2, exp: 0, leveled_up: true, next_level_exp: 20 });
  assert.deepEqual(calculateProgress({ level: 10, exp: 8 }, 'major'), { level: 10, exp: 13, leveled_up: false, next_level_exp: 0 });
});

test('NPC stat deltas are Worker-calculated, bounded, and preserve hypnosis resistance', () => {
  const update = applyNpcStatChanges(
    { 호감도: 50, 신뢰도: 2, 최면깊이: 10, 순응도: 20, 최면저항력: 77 },
    {
      호감도: { delta: 3, reason: '친절한 도움' },
      신뢰도: { delta: -8, reason: '거짓말 발각' },
      최면깊이: { delta: 2, reason: '명확한 최면 성공' },
      순응도: { delta: 4, reason: '최면 후 자연스럽게 따름' },
      최면저항력: { delta: 2, reason: '무시되어야 함' }
    }
  );
  assert.equal(update.stats.호감도, 53);
  assert.equal(update.stats.신뢰도, 2);
  assert.equal(update.stats.최면깊이, 12);
  assert.equal(update.stats.순응도, 24);
  assert.equal(update.stats.최면저항력, 77);
  assert.equal(update.changes.호감도.delta, 3);
  assert.equal(update.changes.신뢰도.delta, 0);
  assert.match(update.errors.join('\n'), /신뢰도: delta -8 exceeds allowed ±5/);
  assert.match(update.errors.join('\n'), /최면저항력: non-zero delta ignored/);
});

test('NPC obedience is capped at three without a hypnosis-depth event', () => {
  const update = applyNpcStatChanges({ 순응도: 20 }, {
    순응도: { delta: 4, reason: '평범한 대화' },
    최면깊이: { delta: 0, reason: '일반 대화' }
  });
  assert.equal(update.stats.순응도, 20);
  assert.match(update.errors.join('\n'), /순응도: delta 4 exceeds allowed ±3/);
});

test('unregistered NPC IDs, present lists, and dialogue cannot become a save target', () => {
  const characters = { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } };
  const extract = normalizeRegisteredNpcExtract({
    character_id: 'new_nurse',
    npcs_present: ['heroine1', 'new_nurse', 'heroine9'],
    dialogue_lines: [{ speaker: '새 간호사', text: '안녕하세요' }, { speaker: '한소영', text: '등록 대사' }],
    npc_emotion: { surface: 'bad' },
    npc_stat_changes: { 호감도: { delta: 5, reason: 'bad' } },
    npc_relationship_state: { player_ejaculation_count: 99 },
    image_id: 99
  }, characters, 'heroine1');
  assert.equal(extract.character_id, 'heroine1');
  assert.equal(extract._npc_registration_rejected, true);
  assert.deepEqual(extract.npcs_present, ['heroine1', 'heroine9']);
  assert.deepEqual(extract.dialogue_lines, [{ speaker: '한소영', text: '등록 대사' }]);
  assert.deepEqual(extract.npc_stat_changes, {});
  assert.equal(extract.image_id, null);
  const patch = buildSavePatch(extract, {}, null, { npc_stats: { heroine1: { 호감도: 20 } } });
  assert.equal(patch.npc_stats, undefined);
  assert.equal(patch.npc_emotion, undefined);
  assert.equal(patch.npc_relationship_state, undefined);
});

test('narrator stores no NPC state while registered location characters remain valid', () => {
  const characters = { heroine5: { name: '윤아름' }, heroine6: { name: '서지아' }, heroine9: { name: '박소현' } };
  const sixWard = normalizeRegisteredNpcExtract({ character_id: 'six_ward_new_nurse' }, characters, 'heroine5');
  assert.equal(sixWard.character_id, 'heroine5');
  assert.equal(sixWard._npc_registration_rejected, true);
  const parkSohyun = normalizeRegisteredNpcExtract({ character_id: 'heroine9', npcs_present: ['heroine9'] }, characters, null);
  assert.equal(parkSohyun.character_id, 'heroine9');
  assert.equal(parkSohyun._npc_registration_rejected, false);
  const narratorPatch = buildSavePatch(normalizeRegisteredNpcExtract({
    character_id: 'narrator', npc_stat_changes: { 호감도: { delta: 5, reason: 'ignored' } }, npc_emotion: { surface: 'ignored' }
  }, characters), {});
  assert.equal(narratorPatch.npc_stats, undefined);
  assert.equal(narratorPatch.npc_emotion, undefined);
  assert.equal(narratorPatch.npc_relationship_state, undefined);
});

test('ordinary favorable, trust, and voluntary acceptance reactions apply plus-one deltas', () => {
  const cases = [
    ['호감도', '호의와 편안함', { 호감도: 10 }, { 호감도: 11 }],
    ['신뢰도', '의심 완화와 도움 수용', { 신뢰도: 10 }, { 신뢰도: 11 }],
    ['순응도', '부탁을 자발적으로 수용', { 순응도: 10 }, { 순응도: 11 }]
  ];
  for (const [key, reason, previous, expected] of cases) {
    const update = applyNpcStatChanges(previous, { [key]: { delta: 1, reason } });
    assert.equal(update.stats[key], expected[key]);
    assert.deepEqual(update.changes[key], { delta: 1, reason });
  }
});

test('no-change dialogue preserves all NPC stats at zero delta', () => {
  const previous = { 호감도: 3, 신뢰도: 4, 최면깊이: 5, 순응도: 6, 최면저항력: 70 };
  const update = applyNpcStatChanges(previous, {});
  assert.deepEqual(update.stats, previous);
  assert.deepEqual(Object.values(update.changes).map(change => change.delta), [0, 0, 0, 0, 0]);
});

test('CSA uses level limits, stores spatial scope, and filters current scene only', () => {
  assert.deepEqual(getCsaLimits(1), { scope_type: 'ward', max_active: 1, daily_limit: 1 });
  assert.deepEqual(getCsaLimits(9), { scope_type: 'building', max_active: 3, daily_limit: 5 });
  const patch = applyCsaAction({ csa_active: [], csa_daily_used: 0 }, { action: 'activate', content: 'test rule', scope_type: 'ward', scope_id: 'ward-3', scope_label: 'Ward 3' }, 1, 12);
  assert.equal(patch.csa_active[0].scope_id, 'ward-3');
  assert.equal(patch.csa_daily_used, 1);
  assert.equal(isCsaApplicable(patch.csa_active[0], { ward: 'ward-3' }), true);
  assert.equal(isCsaApplicable(patch.csa_active[0], { ward: 'ward-2' }), false);
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
  assert.match(prompt, /NPC STAT DELTA CONTRACT/);
  assert.match(prompt, /npc_stat_changes만 반환한다/);
  assert.doesNotMatch(prompt, /절대값으로 환산/);
  assert.match(prompt, /\[방금 생성된 서사\]\n진행자가 플레이어의 답을 되묻는다/);
});

test('save patch nests NPC state under character ID', () => {
  const patch = buildSavePatch({
    character_id: 'heroine3',
    image_id: 9,
    npc_stat_changes: { 호감도: { delta: 2, reason: '도움에 안도함' } },
    npc_emotion: { surface: '침착', inner: '긴장' },
    player_patch: { name: '테스터' },
    story_summary_overall: '전체',
    story_summary_recent100: '최근',
    choices: ['계속한다']
  }, { opening_started: true }, null, { npc_stats: { heroine3: { 호감도: 20, 최면저항력: 65 } } });

  assert.equal(patch.npc_stats.heroine3.호감도, 22);
  assert.equal(patch.npc_stats.heroine3.최면저항력, 65);
  assert.deepEqual(patch.npc_stat_changes.heroine3.호감도, { delta: 2, reason: '도움에 안도함' });
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

test('story prompt uses the V1-style player status panel contract and excludes monitor details', () => {
  const displayFormat = '상황판 전체 항목을 유지한다. '.repeat(700);
  const prompt = buildStoryPrompt({
    master: { rulebook_display_format: displayFormat }, save: { player: {} }, recent_memories: []
  }, '시작', 0);
  assert.match(prompt.messages[0].content, /마인드 모니터는 본문에 절대 출력하지 않는다/);
  assert.match(prompt.messages[0].content, /PLAYER STATUS PANEL CONTRACT/);
  assert.match(prompt.messages[0].content, /💭 플레이어 상황 독백/);
  assert.match(prompt.messages[0].content, /실질 길이 40자 이상/);
  assert.match(prompt.messages[0].content, /사정·오르가즘 누적값은 절대 출력하지 않는다/);
  assert.equal(prompt.messages[0].content.includes(displayFormat), false);
  assert.match(prompt.messages[0].content, /FINAL OUTPUT CONTRACT/);
  assert.match(prompt.messages[0].content, /exactly four in-world action choices/);
  assert.match(prompt.messages[0].content, /Never include a mind monitor/);
});

test('Story and Extract prompt lengths are logged and NPC delta rules stay Extract-only', () => {
  const ctx = { master: { characters: {} }, save: { player: {} }, recent_memories: [] };
  const story = buildStoryPrompt(ctx, '테스트 행동', 1);
  const extract = buildExtractPrompt('테스트 서사', '테스트 행동', ctx, [], 2);
  console.log(`[prompt-length] story=${story.messages[0].content.length} extract=${extract.length}`);
  assert.doesNotMatch(story.messages[0].content, /NPC STAT DELTA CONTRACT|npc_stat_changes/);
  assert.match(extract, /NPC STAT DELTA CONTRACT/);
  assert.equal(story.messages[0].content.length > 0, true);
  assert.equal(extract.length > 0, true);
});

test('opening mode remains explicit until opening is committed', () => {
  const prompt = buildStoryPrompt({
    master: { opening_scenario: '오프닝' },
    save: { player: { name: '플레이어', job: '의사' } },
    recent_memories: []
  }, '계속', 1);
  assert.equal(prompt.mode, 'opening');
});

test('player setup has one recommendation contract and defers the hospital until setup completes', () => {
  const setup = buildStoryPrompt({ master: {}, save: { player: {} }, recent_memories: [] }, 'start', 0);
  const opening = buildStoryPrompt({ master: {}, save: { player_setup: { status: 'complete' }, player: { name: 'A', job: 'doctor' } }, recent_memories: [] }, 'start', 0);
  assert.equal(setup.mode, 'player_setup');
  assert.match(setup.messages[0].content, /\[PLAYER SETUP PHASE\]/);
  assert.match(setup.messages[0].content, /병원 장면이나 NPC는 아직 등장시키지 않는다/);
  assert.match(setup.messages[0].content, /① 추천 설정으로 시작한다/);
  assert.equal((setup.messages[0].content.match(/\[PLAYER SETUP PHASE\]/g) || []).length, 1);
  assert.equal(opening.mode, 'opening');
  assert.match(opening.messages[0].content, /병원 첫 장면과 첫 NPC 조우만/);
  assert.match(opening.messages[0].content, /어플 발견, 기능 설명, 설정 질문, 추천안은 다시 출력하지 않는다/);
});

test('approval stores the existing recommendation deterministically', () => {
  const recommendation = {
    name: '민준', age: 29, gender: '남성', job: '의사', major: '내과', rank: '전공의',
    height_cm: 178, weight_kg: 70, style: '차분함', background: '병원 근무 중'
  };
  assert.equal(isApprovalInput('①'), true);
  assert.equal(isApprovalInput('1'), true);
  assert.equal(isApprovalInput('추천 설정으로 시작'), true);
  assert.equal(isApprovalInput('승인'), true);
  assert.equal(isApprovalInput('일부 변경'), false);
  const patch = buildSavePatch({}, {}, null, { player_setup: { status: 'recommended', recommendation } }, 1, '승인');
  assert.deepEqual(patch.player, recommendation);
  assert.deepEqual(patch.player_setup, { status: 'complete', recommendation });
});

test('setup recommendation merges only supplied edits before approval', () => {
  const previous = { name: '민준', age: 29, job: '의사', height_cm: 178 };
  assert.deepEqual(mergeRecommendation(previous, { job: '간호사', weight_kg: 62 }), {
    name: '민준', age: 29, job: '간호사', height_cm: 178, weight_kg: 62
  });
  const patch = buildSavePatch({ player_recommendation: { job: '간호사' } }, {}, null, {
    player_setup: { status: 'recommended', recommendation: previous }
  }, 2, '직업만 간호사로 바꿔줘');
  assert.equal(patch.player, undefined);
  assert.deepEqual(patch.player_setup, {
    status: 'recommended', recommendation: { name: '민준', age: 29, job: '간호사', height_cm: 178 }
  });
});

test('setup completion requires status, name, and job', () => {
  assert.equal(isSetupComplete({ player_setup: { status: 'complete' }, player: { name: 'A', job: 'B' } }), true);
  assert.equal(isSetupComplete({ player_setup: { status: 'recommended' }, player: { name: 'A', job: 'B' } }), false);
  assert.equal(isSetupComplete({ player_setup: { status: 'complete' }, player: { name: 'A' } }), false);
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
