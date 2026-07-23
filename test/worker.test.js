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
  validateNpcEmotion,
  resolveCsaScopeId,
  buildApplicableCsaSection,
  buildWorldStatePatch,
  normalizeFirstEncounterStats,
  normalizeLegacyActiveSuggestions,
  applySuggestionAction,
  buildActiveSuggestionSection,
  hasLegacyEncounterEvidence,
  resolveIsSexual,
  normalizeImagePool,
  normalizeTags,
  parseCurationRank,
  normalizeSceneRole,
  resolveSpecialSceneRole,
  selectSceneRoleImageId,
  detectRegisteredCharacterIds,
  parseJsonContent,
  buildStoryStateSnapshot,
  clipHeadTail,
  buildCurrentSceneSection
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

// ─────────────────────────────────────────────
// Curated image catalog metadata
// ─────────────────────────────────────────────

test('normalizeImageCatalog keeps curated metadata alongside legacy fields', () => {
  const catalog = normalizeImageCatalog([
    {
      id: 123, character_id: 'heroine9', situation: '기존 원본 설명',
      short_description: '면회실에서 긴장한 표정으로 앉아 있는 장면',
      tags: ['긴장', '착석', '면회실', '상반신'],
      image_pool: 'general', is_sexual: false, curation_rank: 1
    }
  ]);
  assert.deepEqual(catalog.heroine9[0], {
    image_id: 123, situation: '기존 원본 설명',
    short_description: '면회실에서 긴장한 표정으로 앉아 있는 장면',
    tags: ['긴장', '착석', '면회실', '상반신'],
    image_pool: 'general', is_sexual: false, curation_rank: 1, scene_role: null, image_url: null
  });
});

test('image_pool is authoritative: sex forces is_sexual true and general forces it false regardless of the legacy flag', () => {
  const sexPool = normalizeImageCatalog([{ id: 1, character_id: 'heroine1', image_pool: 'sex', is_sexual: false }]);
  assert.equal(sexPool.heroine1[0].is_sexual, true);
  const generalPool = normalizeImageCatalog([{ id: 2, character_id: 'heroine1', image_pool: 'general', is_sexual: true }]);
  assert.equal(generalPool.heroine1[0].is_sexual, false);
});

test('a missing or invalid image_pool falls back to the legacy is_sexual flag', () => {
  assert.equal(resolveIsSexual({ is_sexual: true }), true);
  assert.equal(resolveIsSexual({ image_pool: 'unknown', is_sexual: true }), true);
  assert.equal(normalizeImagePool('unknown'), null);
  assert.equal(normalizeImagePool(undefined), null);
});

test('tags normalize to an array of trimmed non-empty strings, and invalid tags become []', () => {
  assert.deepEqual(normalizeTags(['긴장', '  착석  ', '', '   ', 42, null]), ['긴장', '착석']);
  assert.deepEqual(normalizeTags('not-an-array'), []);
  assert.deepEqual(normalizeTags(undefined), []);
});

test('short_description and situation fall back to each other in either direction', () => {
  const onlySituation = normalizeImageCatalog([{ id: 1, character_id: 'heroine1', situation: '복도' }]);
  assert.equal(onlySituation.heroine1[0].situation, '복도');
  assert.equal(onlySituation.heroine1[0].short_description, '복도');
  const onlyShortDescription = normalizeImageCatalog([{ id: 2, character_id: 'heroine1', short_description: '면회실에서 대기 중' }]);
  assert.equal(onlyShortDescription.heroine1[0].situation, '면회실에서 대기 중');
  assert.equal(onlyShortDescription.heroine1[0].short_description, '면회실에서 대기 중');
  const neither = normalizeImageCatalog([{ id: 3, character_id: 'heroine1' }]);
  assert.equal(neither.heroine1[0].situation, '');
  assert.equal(neither.heroine1[0].short_description, '');
});

test('a curated image catalog entry never breaks normalization for a legacy entry in the same catalog', () => {
  const catalog = normalizeImageCatalog([
    { id: 1, character_id: 'heroine1', situation: '복도', is_sexual: false },
    { id: 2, character_id: 'heroine1', image_pool: 'sex', short_description: '침대 장면', tags: ['침대'], curation_rank: 2, is_sexual: false }
  ]);
  assert.equal(catalog.heroine1.length, 2);
  assert.equal(catalog.heroine1[0].image_pool, null);
  assert.equal(catalog.heroine1[0].is_sexual, false);
  assert.equal(catalog.heroine1[1].image_pool, 'sex');
  assert.equal(catalog.heroine1[1].is_sexual, true);
});

test('parseCurationRank keeps valid integers and treats anything else as unranked (null)', () => {
  assert.equal(parseCurationRank(1), 1);
  assert.equal(parseCurationRank('3'), 3);
  assert.equal(parseCurationRank(null), null);
  assert.equal(parseCurationRank(undefined), null);
  assert.equal(parseCurationRank('not-a-number'), null);
  assert.equal(parseCurationRank(1.5), null);
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

test('selectImageId prefers image_pool over the legacy is_sexual flag on both request and candidates', () => {
  const catalog = [
    { id: 1, character_id: 'heroine1', image_pool: 'general', is_sexual: true },
    { id: 2, character_id: 'heroine1', image_pool: 'sex', is_sexual: false }
  ];
  assert.equal(selectImageId(catalog, 'heroine1', 1, null, false), 1);
  assert.equal(selectImageId(catalog, 'heroine1', 2, null, true), 2);
});

test('a sex-pool request never resolves to a general-pool image and vice versa', () => {
  const catalog = [
    { id: 1, character_id: 'heroine1', image_pool: 'general' },
    { id: 2, character_id: 'heroine1', image_pool: 'sex' }
  ];
  assert.equal(selectImageId(catalog, 'heroine1', 2, null, false), 1);
  assert.notEqual(selectImageId(catalog, 'heroine1', 1, null, false), 2);
  const generalOnly = [{ id: 3, character_id: 'heroine1', image_pool: 'general' }];
  assert.equal(selectImageId(generalOnly, 'heroine1', 999, null, true), 3);
});

test('the default general fallback prefers the lowest curation_rank, and an unranked image sorts last', () => {
  const catalog = [
    { id: 1, character_id: 'heroine1', image_pool: 'general', curation_rank: 5 },
    { id: 2, character_id: 'heroine1', image_pool: 'general', curation_rank: 1 },
    { id: 3, character_id: 'heroine1', image_pool: 'general' }
  ];
  assert.equal(selectImageId(catalog, 'heroine1', 999, null, false), 2);
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

test('registered character is added once to npcs_present and no-previous invalid ID becomes narrator', () => {
  const characters = { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } };
  const registered = normalizeRegisteredNpcExtract({
    character_id: 'heroine9',
    npcs_present: ['heroine1', 'heroine1', 'unknown']
  }, characters, null);
  assert.deepEqual(registered.npcs_present, ['heroine9', 'heroine1']);
  const invalid = normalizeRegisteredNpcExtract({
    character_id: 'unknown', image_id: 9, is_sexual: true,
    npc_emotion: { surface: 'not kept' }, npc_stat_changes: { 호감도: { delta: 3, reason: 'not kept' } }
  }, characters, null);
  assert.equal(invalid.character_id, 'narrator');
  assert.deepEqual(invalid.npcs_present, []);
  assert.deepEqual(invalid.npc_emotion, {});
  assert.deepEqual(invalid.npc_stat_changes, {});
  assert.equal(invalid.image_id, null);
  assert.equal(invalid.is_sexual, false);
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

test('commit-turn re-sanitizes a manipulated unregistered character_id', async () => {
  const originalFetch = globalThis.fetch;
  let committedPatch;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_commit_context')) {
      return new Response(JSON.stringify({
        turn_count: 2,
        master: { characters: { heroine1: { name: '한소영' } } },
        save: { last_character_id: 'heroine1', npc_stats: { heroine1: { 호감도: 20 } } }
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/commit_turn')) {
      committedPatch = JSON.parse(init.body).p_patch;
      return new Response(JSON.stringify({ status: 'committed', turn_count: 3 }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/commit-turn', {
      game_id: 'test-game', turn_number: 3, content: 'test',
      extract: {
        character_id: 'manipulated_npc', npcs_present: ['manipulated_npc'], image_id: 99,
        npc_emotion: { surface: 'forged' }, npc_stat_changes: { 호감도: { delta: 5, reason: 'forged' } },
        npc_relationship_state: { player_ejaculation_count: 5 }
      }
    }), { SUPABASE_SECRET_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.equal(committedPatch.last_character_id, 'heroine1');
    assert.equal(committedPatch.last_image_id, null);
    assert.equal(committedPatch.npc_stats, undefined);
    assert.equal(committedPatch.npc_emotion, undefined);
    assert.equal(committedPatch.npc_relationship_state, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  const worldState = { building: 'seoul_central_hospital', floor: 'hospital_floor_3', ward: 'hospital_3ward' };
  const patch = applyCsaAction({ csa_active: [], csa_daily_used: 0 }, { action: 'activate', content: 'test rule', scope_type: 'ward' }, 1, 12, worldState);
  assert.equal(patch.csa_active[0].scope_id, 'hospital_3ward');
  assert.equal(patch.csa_active[0].scope_label, '서울중앙병원 3병동');
  assert.equal(patch.csa_daily_used, 1);
  assert.equal(isCsaApplicable(patch.csa_active[0], { ward: 'hospital_3ward' }), true);
  assert.equal(isCsaApplicable(patch.csa_active[0], { ward: 'hospital_6ward' }), false);
});

test('CSA activation ignores an attacker-supplied scope_id and rejects when world_state lacks the required scope', () => {
  const forged = applyCsaAction({ csa_active: [], csa_daily_used: 0 }, { action: 'activate', content: 'forged rule', scope_type: 'ward', scope_id: 'forged-ward' }, 1, 12, { ward: 'hospital_3ward' });
  assert.equal(forged.csa_active[0].scope_id, 'hospital_3ward');
  const rejected = applyCsaAction({ csa_active: [], csa_daily_used: 0 }, { action: 'activate', content: 'no location known', scope_type: 'ward' }, 1, 12, {});
  assert.equal(rejected, null);
});

test('CSA rejects duplicate content within the same resolved scope and ignores a deactivate for an unknown id', () => {
  const worldState = { ward: 'hospital_3ward' };
  const first = applyCsaAction({ csa_active: [], csa_daily_used: 0 }, { action: 'activate', content: 'same rule', scope_type: 'ward' }, 1, 10, worldState);
  const duplicate = applyCsaAction({ csa_active: first.csa_active, csa_daily_used: first.csa_daily_used }, { action: 'activate', content: 'same rule', scope_type: 'ward' }, 1, 11, worldState);
  assert.equal(duplicate, null);
  const missingDeactivate = applyCsaAction({ csa_active: first.csa_active, csa_daily_used: 0 }, { action: 'deactivate', id: 'csa_999' }, 1, 12, worldState);
  assert.equal(missingDeactivate, null);
  const realDeactivate = applyCsaAction({ csa_active: first.csa_active, csa_daily_used: 0 }, { action: 'deactivate', id: first.csa_active[0].id }, 1, 12, worldState);
  assert.equal(realDeactivate.csa_active[0].active, false);
  assert.equal(realDeactivate.csa_active.length, 1);
});

test('CSA scope resolution covers ward, floor, building, and world', () => {
  assert.equal(resolveCsaScopeId('ward', { ward: 'hospital_3ward' }), 'hospital_3ward');
  assert.equal(resolveCsaScopeId('floor', { floor: 'hospital_floor_3' }), 'hospital_floor_3');
  assert.equal(resolveCsaScopeId('building', { building: 'seoul_central_hospital' }), 'seoul_central_hospital');
  assert.equal(resolveCsaScopeId('world', {}), 'world');
  assert.equal(resolveCsaScopeId('floor', {}), null);
});

test('Story only injects currently-applicable, active CSAs with the player-unaffected rule', () => {
  const save = {
    world_state: { ward: 'hospital_3ward', location_label: '서울중앙병원 3병동 면회실' },
    csa_active: [
      { id: 'csa_1', content: '3병동 상식', scope_type: 'ward', scope_id: 'hospital_3ward', active: true },
      { id: 'csa_2', content: '6병동 상식', scope_type: 'ward', scope_id: 'hospital_6ward', active: true },
      { id: 'csa_3', content: '해제된 상식', scope_type: 'ward', scope_id: 'hospital_3ward', active: false }
    ]
  };
  const section = buildApplicableCsaSection(save);
  assert.match(section, /3병동 상식/);
  assert.doesNotMatch(section, /6병동 상식/);
  assert.doesNotMatch(section, /해제된 상식/);
  assert.match(section, /서울중앙병원 3병동 면회실/);
  assert.match(section, /플레이어만 원래 상식과 변경된 상식의 차이를 기억한다/);
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

test('extract prompt image library includes curated tags/short_description and excludes image_url and raw filenames', () => {
  const prompt = buildExtractPrompt(
    '서사', '입력',
    { master: {}, save: {} },
    [{
      id: 123, character_id: 'heroine9', situation: '기존 원본 설명',
      short_description: '면회실에서 긴장한 표정으로 앉아 있는 장면',
      tags: ['긴장', '착석', '면회실', '상반신'],
      image_pool: 'general', is_sexual: false, curation_rank: 1,
      scene_role: 'hypnosis_onset',
      image_url: 'https://example.com/should-not-leak/sujin_slender_malepov.png'
    }],
    1
  );
  assert.match(prompt, /면회실에서 긴장한 표정으로 앉아 있는 장면/);
  assert.match(prompt, /"긴장"/);
  assert.match(prompt, /"tags"/);
  assert.match(prompt, /"curation_rank":1/);
  assert.match(prompt, /"scene_role":"hypnosis_onset"/);
  assert.doesNotMatch(prompt, /image_url/);
  assert.doesNotMatch(prompt, /should-not-leak/);
  assert.doesNotMatch(prompt, /sujin_slender_malepov/);
});

test('extract image library keeps working with legacy entries that have no curated metadata', () => {
  const prompt = buildExtractPrompt(
    '서사', '입력',
    { master: {}, save: {} },
    [{ id: 5, character_id: 'heroine1', situation: '복도', is_sexual: false }],
    1
  );
  assert.match(prompt, /"situation":"복도"/);
  assert.match(prompt, /"short_description":""/);
  assert.match(prompt, /"tags":\[\]/);
  assert.match(prompt, /"image_pool":null/);
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
  assert.match(story.messages[0].content, /등록 상호작용 NPC/);
  assert.match(story.messages[0].content, /3병동 상호작용/);
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

// ─────────────────────────────────────────────
// First encounter
// ─────────────────────────────────────────────

test('first encounter sets absolute affinity/trust once and records npc_encounters', () => {
  const extract = {
    character_id: 'heroine9',
    first_encounter_stats: { 호감도: 40, 신뢰도: -5, reason: '단정한 외형에는 관심을 보였지만 거친 말투 때문에 신뢰는 낮게 형성됨' },
    npc_stat_changes: { 순응도: { delta: 1, reason: '자연스러운 대화' } }
  };
  const patch = buildSavePatch(extract, {}, null, {}, 33, '');
  assert.equal(patch.npc_stats.heroine9.호감도, 35);
  assert.equal(patch.npc_stats.heroine9.신뢰도, 0);
  assert.equal(patch.npc_stats.heroine9.순응도, 1);
  assert.deepEqual(patch.npc_encounters, {
    heroine9: { first_turn: 33, initial_affinity: 35, initial_trust: 0, reason: '단정한 외형에는 관심을 보였지만 거친 말투 때문에 신뢰는 낮게 형성됨' }
  });
});

test('first encounter stats round decimals and ignore same-turn affinity/trust deltas to avoid double counting', () => {
  const extract = {
    character_id: 'heroine9',
    first_encounter_stats: { 호감도: 17.4, 신뢰도: 8.6, reason: 'reason text' },
    npc_stat_changes: { 호감도: { delta: 2, reason: 'ignored' }, 신뢰도: { delta: 2, reason: 'ignored' } }
  };
  const patch = buildSavePatch(extract, {}, null, {}, 5, '');
  assert.equal(patch.npc_stats.heroine9.호감도, 17);
  assert.equal(patch.npc_stats.heroine9.신뢰도, 9);
});

test('obedience and hypnosis-depth deltas still apply normally on a first-encounter turn', () => {
  const extract = {
    character_id: 'heroine9',
    first_encounter_stats: { 호감도: 10, 신뢰도: 10, reason: 'r' },
    npc_stat_changes: { 순응도: { delta: 2, reason: '자연스러운 수용' }, 최면깊이: { delta: 2, reason: '명확한 최면 성공' } }
  };
  const patch = buildSavePatch(extract, {}, null, {}, 1, '');
  assert.equal(patch.npc_stats.heroine9.순응도, 2);
  assert.equal(patch.npc_stats.heroine9.최면깊이, 2);
});

test('a second encounter with the same NPC never reapplies first_encounter_stats', () => {
  const previousSave = { npc_encounters: { heroine9: { first_turn: 5, initial_affinity: 17, initial_trust: 8, reason: 'x' } }, npc_stats: { heroine9: { 호감도: 17, 신뢰도: 8 } } };
  const extract = {
    character_id: 'heroine9',
    first_encounter_stats: { 호감도: 30, 신뢰도: 30, reason: 'should be ignored' },
    npc_stat_changes: { 호감도: { delta: 1, reason: '호의' } }
  };
  const patch = buildSavePatch(extract, {}, null, previousSave, 20, '');
  assert.equal(patch.npc_stats.heroine9.호감도, 18);
  assert.equal('npc_encounters' in patch, false);
});

test('first_encounter_stats never applies to narrator or an unregistered NPC', () => {
  const characters = { heroine9: { name: '박소현' } };
  const rejected = normalizeRegisteredNpcExtract({
    character_id: 'unknown_nurse', first_encounter_stats: { 호감도: 20, 신뢰도: 20 }
  }, characters, null);
  assert.equal(rejected.character_id, 'narrator');
  assert.equal(rejected.first_encounter_stats, null);
  const patch = buildSavePatch({ character_id: 'narrator', first_encounter_stats: { 호감도: 20, 신뢰도: 20 } }, {}, null, {}, 1, '');
  assert.equal(patch.npc_encounters, undefined);
});

test('Worker never invents first-encounter numbers itself: identical inputs always produce identical output', () => {
  const extract = { character_id: 'heroine9', first_encounter_stats: { 호감도: 12, 신뢰도: 22, reason: 'r' } };
  const a = buildSavePatch(extract, {}, null, {}, 10, '');
  const b = buildSavePatch(extract, {}, null, {}, 10, '');
  assert.deepEqual(a.npc_encounters, b.npc_encounters);
  assert.deepEqual(a.npc_stats, b.npc_stats);
});

// ─────────────────────────────────────────────
// Legacy encounter compatibility
// ─────────────────────────────────────────────

test('legacy save evidence marks an NPC as already encountered and backfills npc_encounters without reapplying stats', () => {
  const previousSave = { last_character_id: 'heroine9', npc_stats: { heroine9: { 호감도: 40 } } };
  const extract = { character_id: 'heroine9', first_encounter_stats: { 호감도: 5, 신뢰도: 5, reason: 'should not apply' }, npc_stat_changes: { 호감도: { delta: 1, reason: '호의' } } };
  const patch = buildSavePatch(extract, {}, null, previousSave, 40, '');
  assert.equal(patch.npc_stats.heroine9.호감도, 41);
  assert.deepEqual(patch.npc_encounters, { heroine9: { first_turn: 0, initial_affinity: 0, initial_trust: 0, reason: 'legacy encounter inferred from existing save state' } });
});

test('legacy evidence is recognized via last_character_id, npc_emotion, npc_stat_changes, or npc_relationship_state, never from npc_stats alone', () => {
  assert.equal(hasLegacyEncounterEvidence({ last_character_id: 'heroine1' }, 'heroine1'), true);
  assert.equal(hasLegacyEncounterEvidence({ npc_emotion: { heroine1: { surface: 'x' } } }, 'heroine1'), true);
  assert.equal(hasLegacyEncounterEvidence({ npc_stat_changes: { heroine1: {} } }, 'heroine1'), true);
  assert.equal(hasLegacyEncounterEvidence({ npc_relationship_state: { heroine1: {} } }, 'heroine1'), true);
  assert.equal(hasLegacyEncounterEvidence({ npc_stats: { heroine1: { 호감도: 10 } } }, 'heroine1'), false);
});

test('a fresh game does not treat every registered heroine as already encountered just because turn_count is positive', () => {
  const previousSave = { turn_count: 5, npc_stats: { heroine1: { 호감도: 0 }, heroine2: { 호감도: 0 } } };
  const extract = { character_id: 'heroine1', first_encounter_stats: { 호감도: 10, 신뢰도: 5, reason: 'r' } };
  const patch = buildSavePatch(extract, {}, null, previousSave, 6, '');
  assert.deepEqual(patch.npc_encounters, { heroine1: { first_turn: 6, initial_affinity: 10, initial_trust: 5, reason: 'r' } });
  assert.equal(Object.keys(patch.npc_encounters).length, 1);
});

// ─────────────────────────────────────────────
// Active suggestions
// ─────────────────────────────────────────────

test('extract.choices no longer leaks into active_suggestions', () => {
  const patch = buildSavePatch({ character_id: 'heroine1', choices: ['① 선택1', '② 선택2'] }, {}, null, {}, 5, '');
  assert.equal('active_suggestions' in patch, false);
});

test('suggestion_action activates a new suggestion for the current NPC with a deterministic ID', () => {
  const extract = { character_id: 'heroine9', suggestion_action: { action: 'activate', character_id: 'heroine9', content: '금태양의 도움 요청에 최선을 다해야 한다', strength: 'surface', reason: 'r' } };
  const patch = buildSavePatch(extract, {}, null, {}, 32, '');
  assert.deepEqual(patch.active_suggestions, {
    heroine9: [{ id: 'suggestion_32_1', content: '금태양의 도움 요청에 최선을 다해야 한다', strength: 'surface', created_turn: 32, active: true }]
  });
});

test('duplicate active suggestions for the same NPC (ignoring whitespace) are not added twice', () => {
  const previousSave = { active_suggestions: { heroine9: [{ id: 'suggestion_30_1', content: '금태양 도움', strength: 'surface', created_turn: 30, active: true }] } };
  const extract = { character_id: 'heroine9', suggestion_action: { action: 'activate', content: '금태양   도움', strength: 'surface' } };
  const patch = buildSavePatch(extract, {}, null, previousSave, 31, '');
  assert.equal('active_suggestions' in patch, false);
});

test("activating a suggestion for one NPC never touches another NPC's suggestion list", () => {
  const previousSave = { active_suggestions: { heroine1: [{ id: 'suggestion_1_1', content: 'other npc suggestion', strength: 'surface', created_turn: 1, active: true }] } };
  const extract = { character_id: 'heroine9', suggestion_action: { action: 'activate', content: 'new suggestion', strength: 'surface' } };
  const patch = buildSavePatch(extract, {}, null, previousSave, 2, '');
  assert.deepEqual(Object.keys(patch.active_suggestions), ['heroine9']);
});

test('deactivate flips active to false without deleting the suggestion entry', () => {
  const previousSave = { active_suggestions: { heroine9: [{ id: 'suggestion_5_1', content: '금태양 도움', strength: 'surface', created_turn: 5, active: true }] } };
  const extract = { character_id: 'heroine9', suggestion_action: { action: 'deactivate', content: '금태양 도움', reason: '각성' } };
  const patch = buildSavePatch(extract, {}, null, previousSave, 6, '');
  assert.deepEqual(patch.active_suggestions.heroine9, [{ id: 'suggestion_5_1', content: '금태양 도움', strength: 'surface', created_turn: 5, active: false }]);
});

test('deactivating a suggestion that cannot be found is ignored rather than failing the whole commit', () => {
  const previousSave = { active_suggestions: { heroine9: [] } };
  const patch = buildSavePatch({ character_id: 'heroine9', suggestion_action: { action: 'deactivate', content: 'never activated' } }, {}, null, previousSave, 6, '');
  assert.equal('active_suggestions' in patch, false);
});

test('suggestion_action is blocked for narrator, an unregistered NPC, and a mismatched target NPC', () => {
  const characters = { heroine9: { name: '박소현' } };
  const narratorPatch = buildSavePatch({ character_id: 'narrator', suggestion_action: { action: 'activate', content: 'x' } }, {}, null, {}, 1, '');
  assert.equal('active_suggestions' in narratorPatch, false);
  const rejected = normalizeRegisteredNpcExtract({ character_id: 'unknown_nurse', suggestion_action: { action: 'activate', content: 'x' } }, characters, null);
  assert.equal(rejected.suggestion_action, null);
  const mismatched = applySuggestionAction({}, { action: 'activate', character_id: 'heroine1', content: 'x' }, 'heroine9', 1);
  assert.equal(mismatched, null);
});

test('legacy array-shaped active_suggestions normalizes to an empty map instead of being read as suggestions', () => {
  assert.deepEqual(normalizeLegacyActiveSuggestions(['병원 구경을 부탁한다', '커피를 제안한다']), {});
  assert.deepEqual(normalizeLegacyActiveSuggestions({ heroine1: [] }), { heroine1: [] });
  assert.deepEqual(normalizeLegacyActiveSuggestions(undefined), {});
});

test('Story prompt injects every registered NPC\'s active suggestions, each clearly labeled', () => {
  const characters = { heroine9: { name: '박소현' }, heroine1: { name: '한소영' } };
  const save = {
    last_character_id: 'heroine9',
    active_suggestions: {
      heroine9: [{ id: 'suggestion_32_1', content: '금태양의 도움 요청에 최선을 다해야 한다', strength: 'surface', created_turn: 32, active: true }],
      heroine1: [
        { id: 'suggestion_10_1', content: '다른 NPC 암시', strength: 'surface', created_turn: 10, active: true },
        { id: 'suggestion_5_1', content: '해제된 암시', strength: 'surface', created_turn: 5, active: false }
      ]
    }
  };
  const prompt = buildStoryPrompt({ master: { characters }, save, recent_memories: [] }, '계속', 32);
  const content = prompt.messages[0].content;
  assert.match(content, /ACTIVE PERSONAL SUGGESTIONS/);
  const section = content.slice(content.indexOf('[ACTIVE PERSONAL SUGGESTIONS'), content.indexOf('[게임 설정]'));
  assert.match(section, /박소현\(heroine9\)/);
  assert.match(section, /금태양의 도움 요청에 최선을 다해야 한다/);
  assert.match(section, /한소영\(heroine1\)/);
  assert.match(section, /다른 NPC 암시/);
  assert.doesNotMatch(section, /해제된 암시/);
  assert.match(section, /암시가 먹힌 것 같다/);
});

test('Story prompt omits the active-suggestion section when there is no current NPC', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '시작', 0);
  assert.doesNotMatch(prompt.messages[0].content, /CURRENT NPC ACTIVE SUGGESTIONS/);
});

// ─────────────────────────────────────────────
// Structured place state (world_state)
// ─────────────────────────────────────────────

test('world_state_patch normalizes known Korean place names to standard IDs', () => {
  assert.deepEqual(buildWorldStatePatch({ building: '서울중앙병원', floor: '3층', ward: '3병동', location_label: '서울중앙병원 3병동 면회실' }), {
    building: 'seoul_central_hospital', floor: 'hospital_floor_3', ward: 'hospital_3ward', location_label: '서울중앙병원 3병동 면회실'
  });
  assert.deepEqual(buildWorldStatePatch({ ward: '6병동' }), { ward: 'hospital_6ward' });
});

test('world_state_patch ignores unrecognized place names and never clears existing fields with empty strings', () => {
  assert.equal(buildWorldStatePatch({ building: '알 수 없는 건물', floor: '', ward: '', location_label: '' }), null);
  assert.equal(buildWorldStatePatch({}), null);
  const patch = buildSavePatch({ character_id: 'narrator', world_state_patch: { building: '', floor: '', ward: '', location_label: '' } }, {}, null, { world_state: { ward: 'hospital_3ward' } }, 1, '');
  assert.equal('world_state' in patch, false);
});

test('world_state_patch merges without requiring a registered NPC in the scene', () => {
  const patch = buildSavePatch({ character_id: 'narrator', world_state_patch: { ward: '6병동' } }, {}, null, {}, 1, '');
  assert.deepEqual(patch.world_state, { ward: 'hospital_6ward' });
});

// ─────────────────────────────────────────────
// Full commit-turn integration
// ─────────────────────────────────────────────

test('commit-turn persists first_encounter_stats, suggestion_action, and world_state_patch through the full request pipeline', async () => {
  const originalFetch = globalThis.fetch;
  let committedPatch;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_commit_context')) {
      return new Response(JSON.stringify({
        turn_count: 32,
        master: { characters: { heroine9: { name: '박소현' } } },
        save: {}
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/commit_turn')) {
      committedPatch = JSON.parse(init.body).p_patch;
      return new Response(JSON.stringify({ status: 'committed', turn_count: 33 }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/commit-turn', {
      game_id: 'test-game', turn_number: 33, content: 'test',
      extract: {
        character_id: 'heroine9', npcs_present: ['heroine9'],
        first_encounter_stats: { 호감도: 17, 신뢰도: 8, reason: '단정한 외형과 거친 말투' },
        suggestion_action: { action: 'activate', character_id: 'heroine9', content: '금태양의 도움 요청에 최선을 다해야 한다', strength: 'surface' },
        world_state_patch: { building: '서울중앙병원', floor: '3층', ward: '3병동', location_label: '서울중앙병원 3병동 면회실' },
        npc_emotion: {
          surface: '"괜찮은 척은 하지만 낯선 사람이라 마음이 놓이지 않는다."',
          inner: '"도와주고 싶은데 왜 이렇게 경계하게 되는지 모르겠다."',
          physical_reaction: '그녀는 차트를 고쳐 잡고 시선을 피한다. 짧게 숨을 고른다.'
        }
      }
    }), { SUPABASE_SECRET_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.deepEqual(committedPatch.npc_encounters, { heroine9: { first_turn: 33, initial_affinity: 17, initial_trust: 8, reason: '단정한 외형과 거친 말투' } });
    assert.equal(committedPatch.npc_stats.heroine9.호감도, 17);
    assert.equal(committedPatch.active_suggestions.heroine9[0].content, '금태양의 도움 요청에 최선을 다해야 한다');
    assert.deepEqual(committedPatch.world_state, { building: 'seoul_central_hospital', floor: 'hospital_floor_3', ward: 'hospital_3ward', location_label: '서울중앙병원 3병동 면회실' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


// ─────────────────────────────────────────────
// Special image scene roles
// ─────────────────────────────────────────────

test('scene_role accepts only hypnosis_onset and heart_eyes', () => {
  assert.equal(normalizeSceneRole('hypnosis_onset'), 'hypnosis_onset');
  assert.equal(normalizeSceneRole('heart_eyes'), 'heart_eyes');
  assert.equal(normalizeSceneRole('other'), null);
  assert.equal(normalizeSceneRole(undefined), null);
});

test('normalizeImageCatalog preserves a valid scene_role and drops an invalid one', () => {
  const catalog = normalizeImageCatalog([
    { id: 1, character_id: 'heroine1', scene_role: 'hypnosis_onset' },
    { id: 2, character_id: 'heroine1', scene_role: 'unknown' }
  ]);
  assert.equal(catalog.heroine1[0].scene_role, 'hypnosis_onset');
  assert.equal(catalog.heroine1[1].scene_role, null);
});

test('actual suggestion activation or applied hypnosis-depth increase forces hypnosis_onset', () => {
  const suggestion = resolveSpecialSceneRole({}, {
    character_id: 'heroine1', is_sexual: false,
    suggestion_action: { action: 'activate', character_id: 'heroine1' }
  }, {}, {});
  assert.equal(suggestion, 'hypnosis_onset');

  const depth = resolveSpecialSceneRole({}, { character_id: 'heroine1', is_sexual: false }, {}, {
    최면깊이: { delta: 2 }
  });
  assert.equal(depth, 'hypnosis_onset');
});

test('sexual scenes never get replaced by a general special-role image', () => {
  const role = resolveSpecialSceneRole({}, {
    character_id: 'heroine1', is_sexual: true,
    suggestion_action: { action: 'activate', character_id: 'heroine1' }
  }, {}, { 최면깊이: { delta: 2 } });
  assert.equal(role, null);
});

test('heart_eyes is forced only when affinity or deep hypnosis crosses the threshold', () => {
  const affinity = resolveSpecialSceneRole(
    { npc_stats: { heroine1: { 호감도: 69, 최면깊이: 10, 순응도: 10 } } },
    { character_id: 'heroine1', is_sexual: false },
    { 호감도: 70, 최면깊이: 10, 순응도: 10 },
    {}
  );
  assert.equal(affinity, 'heart_eyes');

  const deep = resolveSpecialSceneRole(
    { npc_stats: { heroine1: { 호감도: 20, 최면깊이: 69, 순응도: 72 } } },
    { character_id: 'heroine1', is_sexual: false },
    { 호감도: 20, 최면깊이: 70, 순응도: 72 },
    {}
  );
  assert.equal(deep, 'heart_eyes');

  const alreadyHigh = resolveSpecialSceneRole(
    { npc_stats: { heroine1: { 호감도: 75, 최면깊이: 80, 순응도: 80 } } },
    { character_id: 'heroine1', is_sexual: false },
    { 호감도: 76, 최면깊이: 81, 순응도: 81 },
    {}
  );
  assert.equal(alreadyHigh, null);
});

test('selectSceneRoleImageId keeps character and general-pool boundaries and prefers curation rank', () => {
  const catalog = [
    { id: 1, character_id: 'heroine1', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 5 },
    { id: 2, character_id: 'heroine1', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 1 },
    { id: 3, character_id: 'heroine2', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 0 },
    { id: 4, character_id: 'heroine1', image_pool: 'sex', scene_role: 'hypnosis_onset', curation_rank: 0 }
  ];
  assert.equal(selectSceneRoleImageId(catalog, 'heroine1', 'hypnosis_onset'), 2);
  assert.equal(selectSceneRoleImageId(catalog, 'heroine1', 'heart_eyes'), null);
});

// ─────────────────────────────────────────────
// Turn speed, Extract stability, and Story continuity (3rd stage)
// ─────────────────────────────────────────────

test('buildSavePatch stores UI choice strings in last_choices, fully separate from active_suggestions', () => {
  const patch = buildSavePatch({ character_id: 'heroine1', choices: ['① 선택1', '② 선택2', '', 42, null] }, {}, null, {}, 5, '');
  assert.deepEqual(patch.last_choices, ['① 선택1', '② 선택2']);
  assert.equal('active_suggestions' in patch, false);
});

test('clipHeadTail preserves both the start and the end of long text instead of only keeping the head', () => {
  const text = 'A'.repeat(3000) + 'MIDDLE' + 'B'.repeat(3000);
  const clipped = clipHeadTail(text, 100);
  assert.equal(clipped.startsWith('AAAA'), true);
  assert.equal(clipped.endsWith('BBBB'), true);
  assert.match(clipped, /\[중간 생략\]/);
  assert.ok(clipped.length < text.length);
  assert.equal(clipHeadTail('short text', 100), 'short text');
  assert.equal(clipHeadTail(undefined, 100), '');
});

test('buildCurrentSceneSection injects the saved location and current NPC as an established fact, and is empty with no state', () => {
  const characters = { heroine9: { name: '박소현' } };
  const save = { world_state: { location_label: '서울중앙병원 3병동 면회실' }, last_character_id: 'heroine9' };
  const section = buildCurrentSceneSection(save, characters);
  assert.match(section, /CURRENT SCENE — ESTABLISHED FACT/);
  assert.match(section, /서울중앙병원 3병동 면회실/);
  assert.match(section, /박소현\(heroine9\)/);
  assert.equal(buildCurrentSceneSection({}, {}), '');
});

test('buildStoryStateSnapshot narrows npc_stats/npc_emotion to the current NPC only, never dumping all ten heroines', () => {
  const save = {
    npc_stats: { heroine1: { 호감도: 1 }, heroine9: { 호감도: 20 } },
    npc_emotion: { heroine1: { surface: 'x' }, heroine9: { surface: 'y' } },
    last_character_id: 'heroine9',
    world_state: { ward: 'hospital_3ward' },
    active_suggestions: ['legacy array']
  };
  const snapshot = buildStoryStateSnapshot(save, {});
  assert.deepEqual(snapshot.current_npc_stats, { 호감도: 20 });
  assert.deepEqual(snapshot.current_npc_emotion, { surface: 'y' });
  assert.equal('heroine1' in snapshot, false);
  assert.deepEqual(snapshot.active_suggestions, {});
  assert.deepEqual(snapshot.world_state, { ward: 'hospital_3ward' });
});

test('Story prompt injects the current scene and a turn-continuity contract forbidding repeated actions', () => {
  const save = { world_state: { location_label: '서울중앙병원 3병동 면회실' }, last_character_id: 'heroine9' };
  const prompt = buildStoryPrompt({ master: { characters: { heroine9: { name: '박소현' } } }, save, recent_memories: [] }, '계속', 32);
  const content = prompt.messages[0].content;
  assert.match(content, /CURRENT SCENE — ESTABLISHED FACT/);
  assert.match(content, /TURN CONTINUITY CONTRACT/);
  assert.match(content, /직전 턴에서 완료된 행동을 다시 실행하지 않는다/);
  assert.match(content, /이미 성공한 암시를 다시 시도하지 않는다/);
});

test('Story prompt no longer truncates the save state with a raw character slice', () => {
  const save = {
    last_character_id: 'heroine9',
    world_state: { location_label: '아주 긴 위치 설명'.repeat(50) },
    active_suggestions: { heroine9: [{ id: 's1', content: '숨겨지면 안 되는 암시 내용', strength: 'surface', created_turn: 1, active: true }] }
  };
  const prompt = buildStoryPrompt({ master: { characters: { heroine9: { name: '박소현' } } }, save, recent_memories: [] }, '계속', 1);
  assert.match(prompt.messages[0].content, /숨겨지면 안 되는 암시 내용/);
});

test('detectRegisteredCharacterIds finds only registered heroines named in the text, caps at three, and falls back to last_character_id', () => {
  const characters = { heroine1: { name: '한소영' }, heroine2: { name: '강세라' }, heroine3: { name: '최유리' }, heroine4: { name: '배수진' } };
  assert.equal(detectRegisteredCharacterIds('한소영이 강세라와 함께 최유리, 배수진을 불렀다', '', characters, null).length, 3);
  assert.deepEqual(detectRegisteredCharacterIds('아무도 없는 조용한 복도', '', characters, 'heroine2'), ['heroine2']);
  assert.deepEqual(detectRegisteredCharacterIds('', '', characters, null), []);
  assert.deepEqual(detectRegisteredCharacterIds('알 수 없는 사람이 지나갔다', '한소영에게 말을 건다', characters, null), ['heroine1']);
});

test('parseJsonContent reads plain JSON first and falls back to a legacy code-fenced block', () => {
  assert.deepEqual(parseJsonContent('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonContent('```json\n{"a":2}\n```'), { a: 2 });
  assert.throws(() => parseJsonContent('not json at all'));
});

test('/api/context requests get_ui_context', async () => {
  const originalFetch = globalThis.fetch;
  let calledFn = null;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_ui_context')) {
      calledFn = 'get_ui_context';
      return new Response(JSON.stringify({ turn_count: 5, master: {}, save: {}, recent_memories: [] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/context', { game_id: 'test-game' }), {});
    assert.equal(response.status, 200);
    assert.equal(calledFn, 'get_ui_context');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('/api/image calls get_character_image directly and never fetches get_context or a full catalog', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.includes('/rpc/get_character_image')) {
      return new Response(JSON.stringify('https://example.com/image.jpg'), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/image', { game_id: 'test-game', character_id: 'heroine1', image_id: 5 }), {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.image_url, 'https://example.com/image.jpg');
    assert.equal(calls.some(url => url.includes('/rpc/get_context')), false);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('/api/story requests get_story_context, disables DeepSeek thinking, and returns request/timing headers', async () => {
  const originalFetch = globalThis.fetch;
  let deepseekBody;
  let calledStoryContext = false;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_story_context')) {
      calledStoryContext = true;
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: {} }, save: { player: {} }, recent_memories: [] }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      deepseekBody = JSON.parse(init.body);
      return new Response(new ReadableStream({ start(controller) { controller.close(); } }), { status: 200 });
    }
    if (requestUrl.includes('/rpc/get_context')) throw new Error('must not call get_context');
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/story', { game_id: 'test-game', player_input: '계속' }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.equal(calledStoryContext, true);
    assert.deepEqual(deepseekBody.thinking, { type: 'disabled' });
    assert.equal(deepseekBody.stream, true);
    assert.equal(deepseekBody.max_tokens, 5000);
    assert.equal(typeof response.headers.get('X-Request-ID'), 'string');
    assert.match(response.headers.get('Server-Timing') || '', /context;dur=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('/api/extract requests get_extract_context, fetches images only for detected registered NPCs, and uses disabled thinking + JSON response_format', async () => {
  const originalFetch = globalThis.fetch;
  let deepseekBody;
  let imageCatalogParams;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({
        turn_count: 1,
        master: { characters: { heroine9: { name: '박소현' }, heroine1: { name: '한소영' } } },
        save: {}
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      imageCatalogParams = JSON.parse(init.body).p_character_ids;
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      deepseekBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ character_id: 'heroine9', npcs_present: ['heroine9'] }) }, finish_reason: 'stop' }]
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_context')) throw new Error('must not call get_context');
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', {
      game_id: 'test-game', narrative_text: '박소현이 대답했다.', player_input: '박소현에게 말을 건다'
    }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.request_id, 'string');
    assert.ok(body.timing);
    assert.deepEqual(deepseekBody.thinking, { type: 'disabled' });
    assert.deepEqual(deepseekBody.response_format, { type: 'json_object' });
    assert.deepEqual(imageCatalogParams, ['heroine9']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Extract retries once on a retryable HTTP status (502) then succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let deepseekCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: {} }, save: {} }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      deepseekCalls += 1;
      if (deepseekCalls === 1) return new Response('upstream error', { status: 502 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ character_id: 'narrator' }) }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', { game_id: 'test-game', narrative_text: '텍스트' }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.equal(deepseekCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Extract does not retry a non-retryable HTTP status (400) and reports the upstream status', async () => {
  const originalFetch = globalThis.fetch;
  let deepseekCalls = 0;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: {} }, save: {} }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      deepseekCalls += 1;
      return new Response('bad request', { status: 400 });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', { game_id: 'test-game', narrative_text: '텍스트' }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.upstream_status, 400);
    assert.equal(deepseekCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Extract retries once on empty model content then succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let deepseekCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: {} }, save: {} }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      deepseekCalls += 1;
      const content = deepseekCalls === 1 ? '' : JSON.stringify({ character_id: 'narrator' });
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', { game_id: 'test-game', narrative_text: '텍스트' }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.equal(deepseekCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Extract retries once on JSON parse failure then succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let deepseekCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: {} }, save: {} }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      deepseekCalls += 1;
      const content = deepseekCalls === 1 ? 'not valid json at all' : JSON.stringify({ character_id: 'narrator' });
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', { game_id: 'test-game', narrative_text: '텍스트' }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.equal(deepseekCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Extract reports EXTRACT_JSON_PARSE_FAILED with a request_id when both attempts fail, without leaking raw model output', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: {} }, save: {} }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'still not json — secret leak check' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', { game_id: 'test-game', narrative_text: '텍스트' }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error_code, 'EXTRACT_JSON_PARSE_FAILED');
    assert.equal(typeof body.request_id, 'string');
    assert.doesNotMatch(JSON.stringify(body), /still not json — secret leak check/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mind monitor validation failure triggers a small repair call instead of regenerating the full extract', async () => {
  const originalFetch = globalThis.fetch;
  const deepseekCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({
        turn_count: 1,
        master: { characters: { heroine1: { name: '한소영', '말투': '부드러운 말투' } } },
        save: {}
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      const body = JSON.parse(init.body);
      deepseekCalls.push(body);
      if (deepseekCalls.length === 1) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            character_id: 'heroine1', npcs_present: ['heroine1'],
            npc_emotion: { surface: 'too short', inner: 'too short', physical_reaction: 'one sentence only' }
          }) }, finish_reason: 'stop' }]
        }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          npc_emotion: {
            surface: '“낯선 사람이라 조금 긴장되지만 티를 내지 말자. 우선 평소처럼 침착하게 내 할 일부터 하며 신분을 확인하자.”',
            inner: '“왜 이렇게 자꾸 신경이 쓰이는지 나도 모르겠다. 경계해야 하는데 자꾸 시선이 가고 마음이 흔들린다.”',
            physical_reaction: '그녀는 옷깃을 매만지며 시선을 살짝 피한다. 짧게 숨을 고른 뒤 낮은 목소리로 대답한다.'
          }
        }) }, finish_reason: 'stop' }]
      }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', {
      game_id: 'test-game', narrative_text: '한소영이 응대했다.', player_input: '한소영에게 말을 건다'
    }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mind_monitor_retried, true);
    assert.equal(deepseekCalls.length, 2);
    assert.equal(deepseekCalls[1].max_tokens, 1200);
    assert.deepEqual(deepseekCalls[1].response_format, { type: 'json_object' });
    assert.ok(deepseekCalls[1].messages[0].content.length < deepseekCalls[0].messages[0].content.length);
    assert.doesNotMatch(deepseekCalls[1].messages[0].content, /NPC STAT DELTA CONTRACT/);
    assert.equal(body.extract.npc_emotion.surface.includes('내 할 일부터'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('/api/commit-turn requests get_commit_context and get_image_catalog_for_characters, and reports timing/request_id', async () => {
  const originalFetch = globalThis.fetch;
  let calledCommitContext = false;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_commit_context')) {
      calledCommitContext = true;
      return new Response(JSON.stringify({ turn_count: 1, master: { characters: { heroine1: { name: '한소영' } } }, save: {} }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/commit_turn')) {
      return new Response(JSON.stringify({ status: 'committed', turn_count: 2 }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_context')) throw new Error('must not call get_context');
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/commit-turn', {
      game_id: 'test-game', turn_number: 2, content: 'test', extract: { character_id: 'heroine1', npcs_present: ['heroine1'] }
    }), { SUPABASE_SECRET_KEY: 'test' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(calledCommitContext, true);
    assert.equal(typeof body.request_id, 'string');
    assert.ok(body.timing);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
