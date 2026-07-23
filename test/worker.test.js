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
  normalizeRecommendation,
  normalizeRecommendationCandidate,
  normalizeRecommendations,
  resolveRecommendationSelection,
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
  buildActiveSuggestionPanelText,
  buildCsaPanelText,
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
  buildCurrentSceneSection,
  buildCurrentNpcProfileSection,
  buildNarrativeLengthSection,
  buildNpcDialogueMinimumSection,
  buildAntiRepetitionSection,
  detectExplicitRegisteredNpcMentions,
  buildExplicitNpcMentionSection,
  buildImageSceneText,
  hasObviousSexualSceneSignals,
  scoreImageCandidate,
  hasMismatchedRegisteredCharacterName,
  allocateImageCandidateSlots,
  allocateImagePoolSlots,
  selectCharacterImageCandidates,
  selectTopImageCandidates,
  selectValidatedShortlistImageId
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
  assert.deepEqual(validateNpcEmotion(valid, 'heroine1'), {
    ok: true, errors: [], fieldErrors: { surface: [], inner: [], physical_reaction: [] }
  });
  const invalid = validateNpcEmotion({
    surface: '약간 당황하고 의심스러운 상태다.',
    inner: '낯선 남자에게 호기심과 경계심을 느끼고 있다.',
    physical_reaction: '손을 움켜쥔다.'
  }, 'heroine1');
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /surface: .*minimum 40/);
  assert.match(invalid.errors.join('\n'), /physical_reaction: 1 sentences/);
});

// ─────────────────────────────────────────────
// Mind monitor: Korean pro-drop first person, per-field independence
// ─────────────────────────────────────────────

const NATURAL_DROPPED_SUBJECT_MONOLOGUES = [
  '“믿긴 하는데, 무슨 일 있는 건 아닌지 걱정되네요. 평소보다 대답이 느리고 눈빛도 약간 흐릿해서 계속 신경이 쓰인다.”',
  '“갑자기 왜 저러지? 조금 신경 쓰이네. 아까까지는 멀쩡했는데 갑자기 표정이 굳어서 무슨 일인가 싶다.”',
  '“괜히 신경 쓰이잖아. 그냥 지나가면 될 텐데, 자꾸 눈이 가는 걸 보면 어쩔 수 없나 보다 싶고 마음이 쓰인다.”',
  '“조금 이상했지만 별일 아니겠지. 요즘 다들 피곤하니까 그런 걸로 예민하게 굴 필요는 없을 것 같다.”'
];

const THIRD_PERSON_NARRATIONS = [
  '한소영은 그를 의심하고 있다. 표정에서 그 경계심이 뚜렷하게 드러난다.',
  '그녀는 잠시 불안함을 느꼈다. 이유는 스스로도 명확히 알지 못했다.',
  'NPC의 잠재의식이 흔들리기 시작했다. 겉으로는 침착함을 유지하려 애썼다.',
  '그를 처음 본 순간부터 뭔가 이상하다고 생각했다. 하지만 티는 내지 않았다.'
];

test('validateMindMonologue accepts natural Korean monologues with a dropped subject (no explicit 나/저 needed)', () => {
  for (const line of NATURAL_DROPPED_SUBJECT_MONOLOGUES) {
    assert.deepEqual(validateMindMonologue(line, 'surface'), [], `should pass: ${line}`);
  }
});

test('validateMindMonologue still accepts an explicit first-person monologue (나/저 present)', () => {
  const line = '“나는 이 상황이 낯설지만 침착하게 대응해야 한다고 계속 스스로에게 정말 다짐하듯 되뇌는 중이다.”';
  assert.deepEqual(validateMindMonologue(line, 'surface'), []);
});

test('validateMindMonologue rejects narrator/third-person prose even without the old analysis-phrase wording', () => {
  for (const line of THIRD_PERSON_NARRATIONS) {
    const errors = validateMindMonologue(line, 'surface');
    assert.notDeepEqual(errors, [], `should fail: ${line}`);
    assert.ok(errors.some(e => /third-person|analysis-only/.test(e)), `should reject as third-person/analysis: ${line} -> ${errors}`);
  }
});

test('validateMindMonologue normalizes surrounding quotes without requiring or deleting content', () => {
  const unquoted = NATURAL_DROPPED_SUBJECT_MONOLOGUES[0].replace(/^"|"$/g, '');
  assert.deepEqual(validateMindMonologue(unquoted, 'surface'), []);
});

test('validateNpcEmotion keeps surface/inner independent: a bad inner does not fail a valid surface, and vice versa', () => {
  const surfaceOnly = validateNpcEmotion({
    surface: NATURAL_DROPPED_SUBJECT_MONOLOGUES[0],
    inner: '그녀는 잠시 불안함을 느꼈다.',
    physical_reaction: '그녀가 손을 살짝 움켜쥐었다. 시선을 피하며 옅은 한숨을 내쉬었다.'
  }, 'heroine1');
  assert.equal(surfaceOnly.ok, false);
  assert.deepEqual(surfaceOnly.fieldErrors.surface, []);
  assert.notDeepEqual(surfaceOnly.fieldErrors.inner, []);

  const innerOnly = validateNpcEmotion({
    surface: '한소영은 그를 의심하고 있다.',
    inner: NATURAL_DROPPED_SUBJECT_MONOLOGUES[1],
    physical_reaction: '그녀가 손을 살짝 움켜쥐었다. 시선을 피하며 옅은 한숨을 내쉬었다.'
  }, 'heroine1');
  assert.equal(innerOnly.ok, false);
  assert.notDeepEqual(innerOnly.fieldErrors.surface, []);
  assert.deepEqual(innerOnly.fieldErrors.inner, []);
});

test('handleExtract preserves a validly-generated field when only its sibling field fails validation, instead of blanking both', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({
        turn_count: 1,
        master: { characters: { heroine1: { name: '한소영', '말투': '차분함' } } },
        save: {}
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      // Extract's own attempt: surface is a naturally-dropped-subject
      // monologue (must pass), inner is third-person narration (must fail
      // and fall back), so the repair call fires — return an equally
      // "surface-good, inner-bad" body from the repair endpoint too, to
      // confirm the repair path also preserves the already-good field.
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              character_id: 'heroine1', npcs_present: ['heroine1'],
              npc_emotion: {
                surface: NATURAL_DROPPED_SUBJECT_MONOLOGUES[0],
                inner: '그녀는 잠시 불안함을 느꼈다.',
                physical_reaction: '그녀가 손을 살짝 움켜쥐었다. 시선을 피하며 옅은 한숨을 내쉬었다.'
              }
            })
          },
          finish_reason: 'stop'
        }]
      }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', {
      game_id: 'test-game', narrative_text: '한소영이 대답했다.', player_input: '한소영에게 말을 건다'
    }), { DEEPSEEK_API_KEY: 'test' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.extract.npc_emotion.surface, NATURAL_DROPPED_SUBJECT_MONOLOGUES[0]);
    assert.equal(body.extract.npc_emotion.inner, '');
    assert.ok(Array.isArray(body.mind_monitor_errors) && body.mind_monitor_errors.some(e => e.startsWith('inner:')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an active-suggestion-free registered NPC turn still keeps all three npc_emotion fields (no active suggestions required)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({
        turn_count: 1,
        master: { characters: { heroine1: { name: '한소영', '말투': '차분함' } } },
        save: {} // no active_suggestions at all
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              character_id: 'heroine1', npcs_present: ['heroine1'],
              npc_emotion: {
                surface: NATURAL_DROPPED_SUBJECT_MONOLOGUES[2],
                inner: NATURAL_DROPPED_SUBJECT_MONOLOGUES[3],
                physical_reaction: '그녀가 손을 살짝 움켜쥐었다. 시선을 피하며 옅은 한숨을 내쉬었다.'
              }
            })
          },
          finish_reason: 'stop'
        }]
      }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', {
      game_id: 'test-game', narrative_text: '한소영이 대답했다.', player_input: '한소영에게 말을 건다'
    }), { DEEPSEEK_API_KEY: 'test' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.extract.npc_emotion.surface, NATURAL_DROPPED_SUBJECT_MONOLOGUES[2]);
    assert.equal(body.extract.npc_emotion.inner, NATURAL_DROPPED_SUBJECT_MONOLOGUES[3]);
    assert.ok(body.extract.npc_emotion.physical_reaction.length > 0);
    assert.deepEqual(body.mind_monitor_errors, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('player setup phase (no candidates saved yet) asks for exactly 4 role-locked adult candidates, and defers the hospital until setup completes', () => {
  const setup = buildStoryPrompt({ master: {}, save: { player: {} }, recent_memories: [] }, 'start', 0);
  const opening = buildStoryPrompt({ master: {}, save: { player_setup: { status: 'complete' }, player: { name: 'A', job: 'doctor' } }, recent_memories: [] }, 'start', 0);
  assert.equal(setup.mode, 'player_setup');
  assert.match(setup.messages[0].content, /\[PLAYER SETUP PHASE — GENERATE 4 CANDIDATES — HIGHEST PRIORITY, NO QUESTIONS\]/);
  assert.match(setup.messages[0].content, /사용자에게 "어떤 캐릭터를 원하시나요\?", "어떤 세계에서 시작하고 싶나요\?" 같은 열린 질문을 절대 하지 않는다/);
  assert.match(setup.messages[0].content, /병원 장면이나 등록 NPC는 아직 등장시키지 않는다/);
  assert.match(setup.messages[0].content, /플레이어 캐릭터 후보 4개를 전부 확정해서 만든다/);
  assert.match(setup.messages[0].content, /네 후보 모두 성인 남성이다/);
  assert.match(setup.messages[0].content, /\[REMINDER — PLAYER SETUP PHASE\]/);
  assert.match(setup.messages[0].content, /"대기 중"처럼 결정을 미루는 표현이나 사용자에게 방향을 먼저 묻는 질문형 선택지를 만들지 않는다/);
  assert.match(setup.messages[0].content, /\[3\. 선택지\]는 반드시 방금 만든 4개 플레이어 후보를 "이름 · 직업" 형태로 짧게 적은 것이어야 하며, 등록 NPC를 고르는 선택지나 긴 설명문이 되어서는 안 된다/);
  assert.match(setup.messages[0].content, /1번\(hospital_worker\): 병원에서 근무하는 성인 남성/);
  assert.match(setup.messages[0].content, /2번\(patient\): 현재 입원 중이거나 외래 진료를 받는 성인 남성 환자/);
  assert.match(setup.messages[0].content, /의식불명이나 심각한 인지장애 등 플레이가 어려운 설정은 금지한다/);
  assert.match(setup.messages[0].content, /3번\(hospital_adjacent\): 병원과 연결된 성인 남성 외부인/);
  assert.match(setup.messages[0].content, /4번\(wildcard\): 앞의 세 역할과 플레이 방식이 겹치지 않으면서 병원 세계관에서 자연스럽게 시작할 수 있는 성인 남성/);
  assert.match(setup.messages[0].content, /모든 후보는 성인\(만 19세 이상\)이며 성별은 남성으로 고정한다/);
  assert.match(setup.messages[0].content, /키\(cm\)·몸무게\(kg\)·성기 크기\(cm\)를 현실적인 성인 범위 안에서 반드시 정하고/);
  assert.match(setup.messages[0].content, /"이름 · 직업" 형태로만 짧게 적는다\(공백 포함 24자 이하 목표\)/);
  assert.equal((setup.messages[0].content.match(/\[PLAYER SETUP PHASE/g) || []).length, 1);
  assert.equal(opening.mode, 'opening');
  assert.match(opening.messages[0].content, /병원 첫 장면과 첫 NPC 조우만/);
  assert.match(opening.messages[0].content, /어플 발견, 기능 설명, 설정 질문, 추천안은 다시 출력하지 않는다/);
});

const FOUR_SETUP_PRESETS = [
  {
    id: 'preset_1', slot: 'hospital_worker', name: '김준호', age: 27, gender: '남성',
    job: '정신건강의학과 전공의', major: '정신건강의학과', rank: '전공의',
    height_cm: 178, weight_kg: 70, penis_length_cm: 15,
    style: '단정한 흰 가운, 피곤해 보이지만 깔끔한 인상', speech_style: '차분하고 정중한 존댓말',
    personality: '꼼꼼하고 책임감이 강하지만 속으로는 지쳐 있다',
    background: '입사 2년차로 야간 당직이 잦다. 최근 업무 스트레스가 누적되어 있다.',
    starting_location: '정신건강의학과 당직실', short_feature: '병원 내부 접근성이 높지만 행동이 기록에 남기 쉽다.',
    choice_label: '김준호 · 정신과 전공의'
  },
  {
    id: 'preset_2', slot: 'patient', name: '박재훈', age: 24, gender: '남성',
    job: '외래 환자', height_cm: 175, weight_kg: 68, penis_length_cm: 14,
    style: '환자복 차림, 손목에 깁스를 한 마른 체형', speech_style: '무뚝뚝하지만 예의는 지키는 말투',
    personality: '지루함을 잘 견디지 못하고 호기심이 많다',
    background: '경미한 손목 골절로 통원 치료 중이다. 대기 시간이 길어 지루해하고 있다.',
    starting_location: '정형외과 외래 대기실', short_feature: '환자 신분이라 병원 곳곳을 자유롭게 오가긴 어렵다.',
    choice_label: '박재훈 · 입원 환자'
  },
  {
    id: 'preset_3', slot: 'hospital_adjacent', name: '이현우', age: 31, gender: '남성',
    job: '의료기기 납품업자', height_cm: 180, weight_kg: 78, penis_length_cm: 16,
    style: '캐주얼한 정장 차림, 서류 가방을 든 건장한 체격', speech_style: '사교적이고 붙임성 좋은 영업용 말투',
    personality: '눈치가 빠르고 사람을 잘 구슬린다',
    background: '매주 병원에 납품하러 방문한다. 병원 직원들과 안면이 넓다.',
    starting_location: '1층 물류 하역장', short_feature: '병원 출입은 자유롭지만 체류 시간이 제한적이다.',
    choice_label: '이현우 · 환자 보호자'
  },
  {
    id: 'preset_4', slot: 'wildcard', name: '서강민', age: 26, gender: '남성',
    job: '병원 보안요원', height_cm: 183, weight_kg: 82, penis_length_cm: 17,
    style: '검정 보안 제복, 다부진 체격', speech_style: '짧고 절도 있는 말투',
    personality: '원칙주의자지만 의외로 허술한 구석이 있다',
    background: '입사한 지 얼마 안 된 신입 보안요원이다. 야간 순찰을 자주 돈다.',
    starting_location: '1층 보안실', short_feature: '병원 전역 출입이 자유롭지만 상급자 감시를 받는다.',
    choice_label: '서강민 · 병원 보안요원'
  }
];

test('normalizeRecommendations accepts exactly 4 valid, role-covering, adult candidates with unique ids/labels', () => {
  const normalized = normalizeRecommendations(FOUR_SETUP_PRESETS);
  assert.equal(normalized.length, 4);
  assert.deepEqual(normalized.map(c => c.slot), ['hospital_worker', 'patient', 'hospital_adjacent', 'wildcard']);
});

test('all 4 candidates carry height_cm/weight_kg/penis_length_cm as positive integers', () => {
  const normalized = normalizeRecommendations(FOUR_SETUP_PRESETS);
  for (const c of normalized) {
    assert.equal(Number.isInteger(c.height_cm) && c.height_cm > 0, true, `${c.id} height_cm`);
    assert.equal(Number.isInteger(c.weight_kg) && c.weight_kg > 0, true, `${c.id} weight_kg`);
    assert.equal(Number.isInteger(c.penis_length_cm) && c.penis_length_cm > 0, true, `${c.id} penis_length_cm`);
  }
});

test('all 4 candidates carry non-empty style/speech_style/personality', () => {
  const normalized = normalizeRecommendations(FOUR_SETUP_PRESETS);
  for (const c of normalized) {
    assert.equal(typeof c.style === 'string' && c.style.length > 0, true, `${c.id} style`);
    assert.equal(typeof c.speech_style === 'string' && c.speech_style.length > 0, true, `${c.id} speech_style`);
    assert.equal(typeof c.personality === 'string' && c.personality.length > 0, true, `${c.id} personality`);
  }
});

test('a zero or missing body-measurement field rejects that candidate, which rejects the whole 4-candidate set', () => {
  for (const field of ['height_cm', 'weight_kg', 'penis_length_cm']) {
    const zeroed = FOUR_SETUP_PRESETS.map((c, i) => i === 2 ? { ...c, [field]: 0 } : c);
    assert.equal(normalizeRecommendations(zeroed), null, `zero ${field} should reject the set`);
    const missing = FOUR_SETUP_PRESETS.map((c, i) => {
      if (i !== 2) return c;
      const clone = { ...c };
      delete clone[field];
      return clone;
    });
    assert.equal(normalizeRecommendations(missing), null, `missing ${field} should reject the set`);
  }
});

test('a body-measurement value outside the realistic adult range rejects the candidate set (no absurd extremes)', () => {
  const tooTall = FOUR_SETUP_PRESETS.map((c, i) => i === 0 ? { ...c, height_cm: 400 } : c);
  assert.equal(normalizeRecommendations(tooTall), null);
  const tooLight = FOUR_SETUP_PRESETS.map((c, i) => i === 0 ? { ...c, weight_kg: 5 } : c);
  assert.equal(normalizeRecommendations(tooLight), null);
  const absurdLength = FOUR_SETUP_PRESETS.map((c, i) => i === 0 ? { ...c, penis_length_cm: 90 } : c);
  assert.equal(normalizeRecommendations(absurdLength), null);
});

test('normalizeRecommendationCandidate requires gender to be exactly "남성" — all 4 candidates are adult men', () => {
  assert.equal(normalizeRecommendationCandidate({ ...FOUR_SETUP_PRESETS[0], gender: '여성' }, 'preset_1'), null);
  assert.equal(normalizeRecommendationCandidate(FOUR_SETUP_PRESETS[0], 'preset_1')?.gender, '남성');
});

test('all 4 choice_label values are short (target <=24 chars including spaces), unique, and free of long explanations', () => {
  const normalized = normalizeRecommendations(FOUR_SETUP_PRESETS);
  const labels = normalized.map(c => c.choice_label);
  assert.equal(new Set(labels).size, 4);
  for (const label of labels) {
    assert.ok(label.length <= 24, `"${label}" should be <=24 chars, got ${label.length}`);
    assert.doesNotMatch(label, /시작한다|접근|계획|배경/, `"${label}" should not contain a long explanatory clause`);
  }
});

test('normalizeRecommendations rejects a wrong array size', () => {
  assert.equal(normalizeRecommendations(FOUR_SETUP_PRESETS.slice(0, 3)), null);
  assert.equal(normalizeRecommendations([...FOUR_SETUP_PRESETS, { ...FOUR_SETUP_PRESETS[3], id: 'preset_5', choice_label: '다섯 번째' }]), null);
  assert.equal(normalizeRecommendations(null), null);
  assert.equal(normalizeRecommendations('not-an-array'), null);
});

test('normalizeRecommendations requires at least one hospital_worker and one patient slot', () => {
  const noWorker = FOUR_SETUP_PRESETS.map(c => c.slot === 'hospital_worker' ? { ...c, slot: 'wildcard' } : c);
  assert.equal(normalizeRecommendations(noWorker), null);
  const noPatient = FOUR_SETUP_PRESETS.map(c => c.slot === 'patient' ? { ...c, slot: 'wildcard' } : c);
  assert.equal(normalizeRecommendations(noPatient), null);
});

test('normalizeRecommendations rejects duplicate ids or duplicate choice_labels', () => {
  const dupeIds = FOUR_SETUP_PRESETS.map((c, i) => i === 1 ? { ...c, id: 'preset_1' } : c);
  assert.equal(normalizeRecommendations(dupeIds), null);
  const dupeLabels = FOUR_SETUP_PRESETS.map((c, i) => i === 1 ? { ...c, choice_label: FOUR_SETUP_PRESETS[0].choice_label } : c);
  assert.equal(normalizeRecommendations(dupeLabels), null);
});

test('normalizeRecommendationCandidate rejects a candidate younger than 19', () => {
  assert.equal(normalizeRecommendationCandidate({ ...FOUR_SETUP_PRESETS[1], age: 17 }, 'preset_2'), null);
  assert.equal(normalizeRecommendationCandidate({ ...FOUR_SETUP_PRESETS[1], age: 19 }, 'preset_2')?.age, 19);
});

test('resolveRecommendationSelection maps ①-④, 1-4, and the stored choice_label (with or without a leading marker) to the right preset', () => {
  const playerSetup = { recommendations: FOUR_SETUP_PRESETS };
  assert.equal(resolveRecommendationSelection('1', playerSetup).id, 'preset_1');
  assert.equal(resolveRecommendationSelection('①', playerSetup).id, 'preset_1');
  assert.equal(resolveRecommendationSelection('2.', playerSetup).id, 'preset_2');
  assert.equal(resolveRecommendationSelection(FOUR_SETUP_PRESETS[2].choice_label, playerSetup).id, 'preset_3');
  assert.equal(resolveRecommendationSelection(`4. ${FOUR_SETUP_PRESETS[3].choice_label}`, playerSetup).id, 'preset_4');
  assert.equal(resolveRecommendationSelection('전혀 다른 말', playerSetup), null);
  assert.equal(resolveRecommendationSelection('', playerSetup), null);
  assert.equal(resolveRecommendationSelection('1', { recommendations: [] }), null);
  assert.equal(resolveRecommendationSelection('1', null), null);
});

test('buildSavePatch writes the selected preset directly to player, marks setup complete, and starts the opening — independent of Extract', () => {
  const previousSave = { player_setup: { status: 'recommended', recommendations: FOUR_SETUP_PRESETS } };
  const patch = buildSavePatch({ character_id: 'narrator', player_recommendation: { name: '엉뚱한값' } }, {}, null, previousSave, 1, '2');
  assert.deepEqual(patch.player, normalizeRecommendation(FOUR_SETUP_PRESETS[1]));
  assert.equal(patch.player_setup.status, 'complete');
  assert.equal(patch.player_setup.selected_id, 'preset_2');
  assert.equal(patch.opening_started, true);
  // Body measurements land on game_save.player directly — no DB migration,
  // reusing the existing player JSONB fields.
  assert.equal(patch.player.height_cm, FOUR_SETUP_PRESETS[1].height_cm);
  assert.equal(patch.player.weight_kg, FOUR_SETUP_PRESETS[1].weight_kg);
  assert.equal(patch.player.penis_length_cm, FOUR_SETUP_PRESETS[1].penis_length_cm);
  assert.equal(patch.player.location, FOUR_SETUP_PRESETS[1].starting_location);
  // speech_style/personality never land on player (no schema field for them)
  // — they're preserved only in player_setup.selected_profile.
  assert.equal('speech_style' in patch.player, false);
  assert.equal('personality' in patch.player, false);
  assert.deepEqual(patch.player_setup.selected_profile, {
    speech_style: FOUR_SETUP_PRESETS[1].speech_style,
    personality: FOUR_SETUP_PRESETS[1].personality
  });
});

test('buildSavePatch saves exactly 4 normalized recommendations from Extract while no selection has been made yet', () => {
  const patch = buildSavePatch({ character_id: 'narrator', player_recommendations: FOUR_SETUP_PRESETS }, {}, null, {}, 1, '__START_PLAYER_SETUP__');
  assert.equal(patch.player_setup.status, 'recommended');
  assert.equal(patch.player_setup.recommendations.length, 4);
  assert.equal(patch.player, undefined);
});

test('a malformed 4-candidate set from Extract is not saved at all (setup stays pending rather than half-broken)', () => {
  const patch = buildSavePatch({ character_id: 'narrator', player_recommendations: FOUR_SETUP_PRESETS.slice(0, 2) }, {}, null, {}, 1, '__START_PLAYER_SETUP__');
  assert.equal('player_setup' in patch, false);
});

test('legacy single-recommendation saves still work: old data with a single "recommendation" is read as before', () => {
  const previousSave = { player_setup: { status: 'recommended', recommendation: { name: '민준', age: 29, job: '의사' } } };
  // No recommendations array exists, so structural selection can't match; the
  // approval must fall through to the legacy phrase-matching path.
  const patch = buildSavePatch({ character_id: 'narrator' }, {}, null, previousSave, 1, '추천 설정으로 시작한다');
  assert.deepEqual(patch.player, { name: '민준', age: 29, job: '의사' });
  assert.equal(patch.player_setup.status, 'complete');
  assert.equal(patch.opening_started, true);
});

test('isApprovalInput recognizes the literal button sentence "추천 설정으로 시작한다", not just the truncated phrase', () => {
  assert.equal(isApprovalInput('추천 설정으로 시작한다'), true);
  assert.equal(isApprovalInput('이 설정으로 시작한다'), true);
  assert.equal(isApprovalInput('추천 설정으로 시작'), true);
});

test('CONFIRMED PLAYER SETUP is injected into the opening turn using the just-resolved selection, and instructs the model to start the hospital opening immediately without re-asking', () => {
  const previousSave = { player_setup: { status: 'recommended', recommendations: FOUR_SETUP_PRESETS } };
  const prompt = buildStoryPrompt({ master: {}, save: previousSave, recent_memories: [] }, '1', 0);
  assert.equal(prompt.mode, 'opening');
  const content = prompt.messages[0].content;
  assert.match(content, /\[CONFIRMED PLAYER SETUP — ESTABLISHED FACT\]/);
  assert.match(content, /이름: 김준호/);
  assert.match(content, /직업: 정신건강의학과 전공의/);
  assert.match(content, /시작 장소: 정신건강의학과 당직실/);
  // Body/appearance/speech fields must be injected as established fact, not
  // left for the opening LLM to invent or drop.
  assert.match(content, /키: 178cm/);
  assert.match(content, /몸무게: 70kg/);
  assert.match(content, /성기 크기: 15cm/);
  assert.match(content, /외형: 단정한 흰 가운, 피곤해 보이지만 깔끔한 인상/);
  assert.match(content, /성격: 꼼꼼하고 책임감이 강하지만 속으로는 지쳐 있다/);
  assert.match(content, /말투: 차분하고 정중한 존댓말/);
  assert.match(content, /이 설정을 다시 추천하거나 질문하지 않는다/);
  assert.match(content, /선택한 캐릭터로 병원 오프닝을 즉시 시작한다/);
});

test('when 4 candidates are already saved but the input does not match any of them, Story re-shows the same 4 without regenerating new ones', () => {
  const previousSave = { player_setup: { status: 'recommended', recommendations: FOUR_SETUP_PRESETS } };
  const prompt = buildStoryPrompt({ master: {}, save: previousSave, recent_memories: [] }, '__START_PLAYER_SETUP__', 0);
  assert.equal(prompt.mode, 'player_setup');
  const content = prompt.messages[0].content;
  assert.match(content, /\[PLAYER SETUP PHASE — CANDIDATES ALREADY GENERATED\]/);
  assert.match(content, /새 후보를 만들지 않는다/);
  assert.match(content, /김준호/);
  assert.match(content, /박재훈/);
  assert.match(content, /이현우/);
  assert.match(content, /서강민/);
});

test('the hypnosis app contract bans fake scan/registration/level-lock systems and confines all suggestion mutation to app usage', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  assert.match(content, /\[HYPNOSIS APP CONTRACT — HIGH PRIORITY\]/);
  assert.match(content, /별도 스캔이나 대상자 등록은 필요 없다/);
  assert.match(content, /테스트 대상 검색, 생체 신호 스캔, 대상자 등록, 스캔 완료, 초기 스캔 안정도, 데모 모드, 암시 라이브러리 잠금, Lv\.3 암시 해제, Lv\.5 상식 개변 해제/);
  assert.match(content, /플레이어는 선천적인 최면술사나 언어 암시 전문가가 아니다/);
  assert.match(content, /일반 대화, 설득, 반복 발언, 눈맞춤, 목소리, 분위기 조성만으로는 활성 암시를 생성·변경하지 않고/);
});

test('Extract mind-monitor contract requires npc_emotion for any registered NPC on screen even with zero active suggestions', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /활성 암시가 하나도 없어도, character_id가 narrator가 아닌 등록 NPC이고 그 NPC가 방금 서사에 실제로 등장한 정상 턴이면 npc_emotion\(표면의식\/잠재의식\/신체적·행동적 반응\)을 반드시 모두 생성한다/);
});

test('Extract suggestion_action contract only fires on completed app usage, never on ordinary persuasion', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /플레이어가 최면 어플을 실제로 사용해 암시를 생성·변경·강화·삭제한 것이 명확히 완료됐을 때만/);
  assert.match(prompt, /일반 대화·설득·반복 발언·분위기 조성만으로 암시를 활용하거나 암시 효과를 체감한 턴에는 suggestion_action을 반환하지 않는다/);
});

test('Extract PLAYER SETUP RECOMMENDATION contract requires exactly-4 structured recommendations for new cards, and never lets Extract guess the selection', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /player_recommendations에 정확히 4개를 반환한다/);
  assert.match(prompt, /height_cm\/weight_kg\/penis_length_cm\(서사의 "신체" 줄에서 가져온 현실적인 성인 범위의 정수, 빠짐없이 채운다\)/);
  assert.match(prompt, /speech_style·personality\(서사의 "성격·말투"에서 분리\)/);
  assert.match(prompt, /choice_label\(서사의 \[선택지\]에 실제로 적은 "이름 · 직업" 문구와 완전히 동일한 문자열\)/);
  assert.match(prompt, /후보 선택\(번호, ①~④, 선택 문장, "추천 설정으로 시작한다" 등\)은 Worker가 저장된 recommendations에서 직접 판정하므로/);
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

test('the Extract world state contract requires all four fields once a move completes, forbids blanking with empty strings, and never asks the Worker to regex-parse Story text', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /world_state_patch에 building, floor, ward, location_label을 모두 채워서 반환한다/);
  assert.match(prompt, /바뀌지 않은 필드는 이전 저장값의 기존 명칭을 그대로 다시 적고/);
  assert.match(prompt, /이동을 제안하거나 준비만 했을 뿐 아직 도착하지 않았다면 world_state_patch를 채우지 말고 비워둔다/);
  assert.match(prompt, /빈 문자열로 기존 값을 덮어쓰지 마라/);
});

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

test('buildSavePatch deep-merges a partial world_state_patch with the previous world_state instead of sending only the changed field', () => {
  const previousSave = {
    world_state: {
      building: 'seoul_central_hospital', floor: 'hospital_floor_3', ward: 'hospital_3ward',
      location_label: '서울중앙병원 3병동 면회실'
    }
  };
  // Model only sends the changed field — building/floor/ward are left out.
  const patch = buildSavePatch({ character_id: 'narrator', world_state_patch: { location_label: '서울중앙병원 3병동 복도' } }, {}, null, previousSave, 2, '');
  assert.deepEqual(patch.world_state, {
    building: 'seoul_central_hospital', floor: 'hospital_floor_3', ward: 'hospital_3ward',
    location_label: '서울중앙병원 3병동 복도'
  });
});

test('buildSavePatch omits world_state entirely (preserving the existing saved value) when world_state_patch has no recognizable fields', () => {
  const previousSave = { world_state: { ward: 'hospital_3ward', location_label: '서울중앙병원 3병동 면회실' } };
  const patch = buildSavePatch({ character_id: 'narrator', world_state_patch: {} }, {}, null, previousSave, 2, '');
  assert.equal('world_state' in patch, false);
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
  const deepseekBodies = [];
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
      deepseekBodies.push(JSON.parse(init.body));
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
    const deepseekBody = deepseekBodies[0];
    assert.deepEqual(deepseekBody.thinking, { type: 'disabled' });
    assert.deepEqual(deepseekBody.response_format, { type: 'json_object' });
    assert.equal(deepseekBody.max_tokens, 3000);
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

// ─────────────────────────────────────────────
// Minimal multi-NPC target switching
// ─────────────────────────────────────────────

test('detectExplicitRegisteredNpcMentions finds only exact full registered names, in text order, once each', () => {
  const characters = { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } };
  assert.deepEqual(
    detectExplicitRegisteredNpcMentions('한소영 수간호사님, 잠깐 이야기하시죠.', characters).map(m => m.character_id),
    ['heroine1']
  );
  assert.deepEqual(
    detectExplicitRegisteredNpcMentions('박소현 씨와 한소영 수간호사님 두 분께 묻는다.', characters).map(m => m.character_id),
    ['heroine9', 'heroine1']
  );
  assert.deepEqual(
    detectExplicitRegisteredNpcMentions('한소영, 한소영, 한소영에게 다시 묻는다.', characters).map(m => m.character_id),
    ['heroine1']
  );
});

test('detectExplicitRegisteredNpcMentions rejects titles, surnames, partial names, pronouns, and unregistered names', () => {
  const characters = { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } };
  for (const text of ['수간호사님', '소영 씨', '박 간호사', '옆의 간호사', '그 여자', '송미영 간호사를 불러 주세요.']) {
    assert.deepEqual(detectExplicitRegisteredNpcMentions(text, characters), []);
  }
});

test('detectExplicitRegisteredNpcMentions returns [] for empty input or no registered characters', () => {
  assert.deepEqual(detectExplicitRegisteredNpcMentions('', { heroine1: { name: '한소영' } }), []);
  assert.deepEqual(detectExplicitRegisteredNpcMentions('한소영이 있다', {}), []);
  assert.deepEqual(detectExplicitRegisteredNpcMentions(undefined, { heroine1: { name: '한소영' } }), []);
});

test('detectRegisteredCharacterIds prioritizes an exact name in the player input over the narrative, regardless of characters object order', () => {
  const characters = { heroine9: { name: '박소현' }, heroine1: { name: '한소영' } };
  assert.deepEqual(
    detectRegisteredCharacterIds('박소현과 한소영이 함께 있다.', '한소영 수간호사님께 묻는다.', characters, 'heroine9'),
    ['heroine1', 'heroine9']
  );
});

test('Story prompt includes an explicit-mention hint section only when the player input names a registered NPC exactly, listed in input order', () => {
  const characters = { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } };
  const withMention = buildStoryPrompt(
    { master: { characters }, save: { last_character_id: 'heroine9' }, recent_memories: [] },
    '박소현 씨와 한소영 수간호사님, 두 분 모두 잠깐 이야기하시죠.',
    5
  );
  const content = withMention.messages[0].content;
  assert.match(content, /EXPLICIT REGISTERED NPC MENTIONS IN PLAYER INPUT/);
  const mentionIndex = content.indexOf('[EXPLICIT REGISTERED NPC MENTIONS');
  const mentionSection = content.slice(mentionIndex, content.indexOf('[게임 설정]'));
  assert.match(mentionSection, /박소현\(heroine9\)/);
  assert.match(mentionSection, /한소영\(heroine1\)/);
  assert.ok(mentionSection.indexOf('박소현') < mentionSection.indexOf('한소영'));
  assert.match(mentionSection, /Worker가 응답 대상을 강제한 것이 아니다/);
  assert.match(mentionSection, /자동 전환하지 않는다/);
  assert.match(mentionSection, /순간이동시키지 말고/);

  const withoutMention = buildStoryPrompt(
    { master: { characters }, save: { last_character_id: 'heroine9' }, recent_memories: [] },
    '계속 말씀해 주세요.',
    5
  );
  assert.doesNotMatch(withoutMention.messages[0].content, /EXPLICIT REGISTERED NPC MENTIONS/);
});

test('the explicit-mention section is placed right after CURRENT SCENE and before ACTIVE PERSONAL SUGGESTIONS / CSA', () => {
  const characters = { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } };
  const save = {
    last_character_id: 'heroine9',
    world_state: { location_label: '서울중앙병원 3병동 면회실' },
    active_suggestions: { heroine9: [{ id: 's1', content: '암시', strength: 'surface', created_turn: 1, active: true }] }
  };
  const prompt = buildStoryPrompt({ master: { characters }, save, recent_memories: [] }, '한소영 수간호사님, 잠깐 말씀 좀 나눌 수 있을까요?', 5);
  const content = prompt.messages[0].content;
  const sceneIndex = content.indexOf('[CURRENT SCENE');
  const mentionIndex = content.indexOf('[EXPLICIT REGISTERED NPC MENTIONS');
  const suggestionIndex = content.indexOf('[ACTIVE PERSONAL SUGGESTIONS');
  assert.ok(sceneIndex >= 0 && mentionIndex > sceneIndex && suggestionIndex > mentionIndex);
});

test('Extract prompt carries the MAIN NPC / MULTI NPC CONTRACT ahead of the image selection rules', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /MAIN NPC \/ MULTI NPC CONTRACT/);
  assert.match(prompt, /이름만 대화 주제로 언급됐고 실제 장면에 등장하지 않은 NPC는 npcs_present에 넣지 않는다/);
  assert.match(prompt, /플레이어가 이번 입력에서 직접 말을 걸거나 행동 대상으로 삼은 NPC/);
  assert.match(prompt, /다른 NPC가 짧게 한마디 했다는 이유만으로 자동 전환하지 않는다/);
  assert.match(prompt, /캐릭터 매핑 목록 순서, 이미지 후보 순서, master 객체 순서로 character_id를 고르지 않는다/);
  assert.match(prompt, /메인 NPC는 한 명만 고른다/);
  assert.ok(prompt.indexOf('MAIN NPC / MULTI NPC CONTRACT') < prompt.indexOf('[이미지 선택]'));
});

// ─────────────────────────────────────────────
// Extract image candidate shortlist (max 12)
// ─────────────────────────────────────────────

function makeShortlistImages(characterId, count, startId, overrides = {}) {
  const images = [];
  for (let i = 0; i < count; i++) {
    images.push({
      image_id: startId + i,
      character_id: characterId,
      image_pool: 'general',
      tags: [],
      curation_rank: i,
      short_description: '',
      situation: '',
      ...overrides
    });
  }
  return images;
}

test('allocateImageCandidateSlots splits totalLimit 12 across 0/1/2/3 candidates per the spec table', () => {
  assert.deepEqual(allocateImageCandidateSlots([], 12), []);
  assert.deepEqual(allocateImageCandidateSlots(['heroine1'], 12), [{ characterId: 'heroine1', slots: 12 }]);
  assert.deepEqual(allocateImageCandidateSlots(['heroine1', 'heroine9'], 12), [
    { characterId: 'heroine1', slots: 8 },
    { characterId: 'heroine9', slots: 4 }
  ]);
  assert.deepEqual(allocateImageCandidateSlots(['heroine1', 'heroine9', 'heroine4'], 12), [
    { characterId: 'heroine1', slots: 6 },
    { characterId: 'heroine9', slots: 3 },
    { characterId: 'heroine4', slots: 3 }
  ]);
});

test('allocateImagePoolSlots matches the spec general/sex ratio table for default and obvious-sexual-signal scenes', () => {
  assert.deepEqual(allocateImagePoolSlots(12, false), { generalSlots: 8, sexSlots: 4 });
  assert.deepEqual(allocateImagePoolSlots(8, false), { generalSlots: 5, sexSlots: 3 });
  assert.deepEqual(allocateImagePoolSlots(6, false), { generalSlots: 4, sexSlots: 2 });
  assert.deepEqual(allocateImagePoolSlots(4, false), { generalSlots: 3, sexSlots: 1 });
  assert.deepEqual(allocateImagePoolSlots(3, false), { generalSlots: 2, sexSlots: 1 });
  assert.deepEqual(allocateImagePoolSlots(12, true), { generalSlots: 4, sexSlots: 8 });
  assert.deepEqual(allocateImagePoolSlots(8, true), { generalSlots: 3, sexSlots: 5 });
  assert.deepEqual(allocateImagePoolSlots(6, true), { generalSlots: 2, sexSlots: 4 });
  assert.deepEqual(allocateImagePoolSlots(4, true), { generalSlots: 1, sexSlots: 3 });
  assert.deepEqual(allocateImagePoolSlots(3, true), { generalSlots: 1, sexSlots: 2 });
});

test('buildImageSceneText lowercases, strips punctuation to spaces, and collapses whitespace', () => {
  const text = buildImageSceneText('그녀는 "정말?!" 하고 웃었다.', 'Hello, World!');
  assert.equal(text, text.toLowerCase());
  assert.doesNotMatch(text, /[!?".,]/);
  assert.doesNotMatch(text, /\s{2,}/);
  assert.match(text, /hello/);
});

test('hasObviousSexualSceneSignals is true only for explicit sexual-action words, never for affection/blush/smile/closeness alone', () => {
  assert.equal(hasObviousSexualSceneSignals('그가 그녀의 몸에 삽입했다', ''), true);
  assert.equal(hasObviousSexualSceneSignals('그녀가 오르가즘을 느꼈다', ''), true);
  assert.equal(hasObviousSexualSceneSignals('', '자위를 시작한다'), true);
  assert.equal(hasObviousSexualSceneSignals('그녀는 얼굴을 붉히며 미소지었다', '가까이 다가가 끌어안는다'), false);
  assert.equal(hasObviousSexualSceneSignals('', ''), false);
  assert.equal(hasObviousSexualSceneSignals(undefined, undefined), false);
});

test('selectCharacterImageCandidates ranks an exact tag match above a low curation_rank image with no relevance', () => {
  const sceneText = buildImageSceneText('그녀가 활짝 웃었다', '');
  const catalog = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'general', tags: ['기쁨'], curation_rank: 5, short_description: '', situation: '' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general', tags: [], curation_rank: 1, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText, characters: {}, lastImageId: null });
  assert.equal(result.selected[0].image_id, 1);
});

test('selectCharacterImageCandidates treats description-token matches as a weaker secondary signal than tags', () => {
  const sceneText = buildImageSceneText('복도에서 조용히 서있는 장면', '');
  const catalog = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'general', tags: ['기쁨'], curation_rank: 9, short_description: '', situation: '' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general', tags: [], curation_rank: 9, short_description: '복도에서 조용히 서있는 모습', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText, characters: {}, lastImageId: null });
  assert.equal(result.selected[0].image_id, 2);
});

test('selectCharacterImageCandidates breaks equal-relevance ties by the lower curation_rank', () => {
  const catalog = [
    { image_id: 10, character_id: 'heroine9', image_pool: 'general', tags: [], curation_rank: 5, short_description: '', situation: '' },
    { image_id: 11, character_id: 'heroine9', image_pool: 'general', tags: [], curation_rank: 2, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText: '', characters: {}, lastImageId: null });
  assert.equal(result.selected[0].image_id, 11);
});

test('selectCharacterImageCandidates prefers a competing image over the last-shown image at equal tag relevance', () => {
  const sceneText = buildImageSceneText('그녀가 활짝 웃었다', '');
  const catalog = [
    { image_id: 20, character_id: 'heroine9', image_pool: 'general', tags: ['기쁨'], curation_rank: 3, short_description: '', situation: '' },
    { image_id: 21, character_id: 'heroine9', image_pool: 'general', tags: ['기쁨'], curation_rank: 3, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText, characters: {}, lastImageId: 20 });
  assert.equal(result.selected[0].image_id, 21);
});

test('selectCharacterImageCandidates can still pick the last-shown image when no competitor exists', () => {
  const sceneText = buildImageSceneText('그녀가 활짝 웃었다', '');
  const catalog = [
    { image_id: 30, character_id: 'heroine9', image_pool: 'general', tags: ['기쁨'], curation_rank: 1, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText, characters: {}, lastImageId: 30 });
  assert.equal(result.selected[0].image_id, 30);
});

test('selectTopImageCandidates never exceeds totalLimit, has no duplicate image_id, and only includes candidate characters', () => {
  const catalog = [
    ...makeShortlistImages('heroine1', 40, 1000),
    ...makeShortlistImages('heroine9', 40, 2000),
    ...makeShortlistImages('heroine4', 40, 3000),
    ...makeShortlistImages('heroine2', 10, 4000)
  ];
  const result = selectTopImageCandidates(catalog, {
    candidateCharacterIds: ['heroine1', 'heroine9', 'heroine4'],
    narrativeText: '평범한 하루였다', playerInput: '', lastImageId: null, characters: {}, totalLimit: 12
  });
  assert.ok(result.length <= 12);
  const ids = result.map(img => img.image_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(result.every(img => ['heroine1', 'heroine9', 'heroine4'].includes(img.character_id)));
});

test('selectTopImageCandidates is deterministic for identical input', () => {
  const catalog = [...makeShortlistImages('heroine1', 40, 1000), ...makeShortlistImages('heroine9', 40, 2000)];
  const options = { candidateCharacterIds: ['heroine1', 'heroine9'], narrativeText: '평범한 하루였다', playerInput: '', lastImageId: null, characters: {}, totalLimit: 12 };
  assert.deepEqual(selectTopImageCandidates(catalog, options), selectTopImageCandidates(catalog, options));
});

test('selectCharacterImageCandidates guarantees at least one general image for slots=1 even under an obvious sexual signal', () => {
  const catalog = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'general', tags: [], curation_rank: 1, short_description: '', situation: '' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'sex', tags: [], curation_rank: 1, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: true, sceneText: '', characters: {}, lastImageId: null });
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].image_pool, 'general');
});

test('image_pool is the source of truth over legacy is_sexual when bucketing general vs sex candidates', () => {
  const catalog = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'sex', is_sexual: false, tags: [], curation_rank: 1, short_description: '', situation: '' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general', is_sexual: true, tags: [], curation_rank: 1, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText: '', characters: {}, lastImageId: null });
  assert.equal(result.selected[0].image_id, 2);
});

test('selectCharacterImageCandidates excludes hypnosis_onset/heart_eyes scene_role images even when they would otherwise score highest', () => {
  const sceneText = buildImageSceneText('그녀가 최면에 빠져들며 활짝 웃었다', '');
  const catalog = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'general', tags: ['기쁨'], curation_rank: 1, scene_role: 'hypnosis_onset', short_description: '', situation: '' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general', tags: [], curation_rank: 9, scene_role: null, short_description: '', situation: '' }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine9', slots: 1, sexualSignal: false, sceneText, characters: {}, lastImageId: null });
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].image_id, 2);
});

test('hasMismatchedRegisteredCharacterName flags a row whose description contains a different registered NPC\'s full name', () => {
  const characters = { heroine1: { name: '한소영' }, heroine4: { name: '배수진' } };
  const badRow = { character_id: 'heroine1', short_description: '배수진과 함께 있는 모습', situation: '' };
  assert.equal(hasMismatchedRegisteredCharacterName(badRow, characters), true);
});

test('hasMismatchedRegisteredCharacterName keeps a row that only mentions its own character name', () => {
  const characters = { heroine1: { name: '한소영' }, heroine4: { name: '배수진' } };
  const ownRow = { character_id: 'heroine1', short_description: '한소영이 웃고 있는 모습', situation: '' };
  assert.equal(hasMismatchedRegisteredCharacterName(ownRow, characters), false);
});

test('hasMismatchedRegisteredCharacterName does not exclude unregistered plain-person mentions', () => {
  const characters = { heroine1: { name: '한소영' } };
  const row = { character_id: 'heroine1', short_description: '지나가는 행인이 그녀를 바라본다', situation: '' };
  assert.equal(hasMismatchedRegisteredCharacterName(row, characters), false);
});

test('selectCharacterImageCandidates excludes a row whose metadata contains another registered NPC\'s name (the heroine1/배수진 case)', () => {
  const characters = { heroine1: { name: '한소영' }, heroine4: { name: '배수진' } };
  const catalog = [
    { image_id: 1, character_id: 'heroine1', image_pool: 'general', short_description: '배수진과 함께 있는 모습', situation: '', tags: [], curation_rank: 1 },
    { image_id: 2, character_id: 'heroine1', image_pool: 'general', short_description: '한소영이 웃고 있는 모습', situation: '', tags: [], curation_rank: 9 }
  ];
  const result = selectCharacterImageCandidates(catalog, { characterId: 'heroine1', slots: 2, sexualSignal: false, sceneText: '', characters, lastImageId: null });
  const ids = result.selected.map(img => img.image_id);
  assert.ok(!ids.includes(1));
  assert.ok(ids.includes(2));
});

test('buildExtractPrompt includes the IMAGE CANDIDATE CONTRACT section and the bounded image_id schema line', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /\[IMAGE CANDIDATE CONTRACT\]/);
  assert.match(prompt, /후보 목록에 없는 image_id를 만들거나 추측하지 않는다/);
  assert.match(prompt, /scene_role 특수 이미지는 Worker가 Commit 단계에서 별도로 결정하므로 여기서 추측하지 않는다/);
  assert.match(prompt, /"image_id": "후보 목록 안의 image_id 또는 null"/);
});

test('/api/extract shortlists a large curated catalog to at most 12 images and logs a separate gamebuilder_image_shortlist diagnostic without mixing into timing', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => { logs.push(args.join(' ')); };
  let deepseekImagesSent;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_extract_context')) {
      return new Response(JSON.stringify({
        turn_count: 5,
        master: { characters: { heroine1: { name: '한소영' }, heroine9: { name: '박소현' } } },
        save: { last_image_id: null }
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      const images = [
        ...makeShortlistImages('heroine1', 35, 1000, { image_pool: undefined, is_sexual: false }),
        ...makeShortlistImages('heroine9', 30, 2000, { image_pool: undefined, is_sexual: false })
      ];
      return new Response(JSON.stringify(images), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('api.deepseek.com')) {
      const body = JSON.parse(init.body);
      const content = body.messages[0].content;
      const startMarker = '[이미지 라이브러리]\n';
      const start = content.indexOf(startMarker) + startMarker.length;
      const end = content.indexOf('\n\n[JSON', start);
      deepseekImagesSent = JSON.parse(content.slice(start, end));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ character_id: 'heroine1', npcs_present: ['heroine1', 'heroine9'] }) }, finish_reason: 'stop' }]
      }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/extract', {
      game_id: 'test-game', narrative_text: '한소영과 박소현이 함께 있었다.', player_input: ''
    }), { DEEPSEEK_API_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.ok(deepseekImagesSent.length <= 12);

    const shortlistLog = logs
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .find(entry => entry && entry.event === 'gamebuilder_image_shortlist');
    assert.ok(shortlistLog);
    assert.equal(shortlistLog.image_catalog_count, 65);
    assert.ok(shortlistLog.image_shortlist_count <= 12);
    assert.equal(shortlistLog.image_shortlist_count, deepseekImagesSent.length);
    assert.ok(shortlistLog.image_shortlist_by_character.heroine1 >= 1);
    assert.equal(shortlistLog.timing, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test('selectValidatedShortlistImageId approves a requested ID that is inside the shortlist with a matching pool', () => {
  const shortlist = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'general' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general' }
  ];
  const result = selectValidatedShortlistImageId(shortlist, shortlist, { characterId: 'heroine9', requestedId: 2, previousId: null, isSexual: false });
  assert.equal(result, 2);
});

test('selectValidatedShortlistImageId never approves an ID that exists in the full catalog but not the shortlist, falling back to the shortlist pool leader', () => {
  const shortlist = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'general' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general' }
  ];
  const fullCatalog = [...shortlist, { image_id: 3, character_id: 'heroine9', image_pool: 'general' }];
  const result = selectValidatedShortlistImageId(shortlist, fullCatalog, { characterId: 'heroine9', requestedId: 3, previousId: null, isSexual: false });
  assert.equal(result, 1);
});

test('selectValidatedShortlistImageId falls back to the shortlist pool leader for a nonexistent requested ID', () => {
  const shortlist = [{ image_id: 5, character_id: 'heroine9', image_pool: 'sex' }];
  const result = selectValidatedShortlistImageId(shortlist, shortlist, { characterId: 'heroine9', requestedId: 999999, previousId: null, isSexual: true });
  assert.equal(result, 5);
});

test('selectValidatedShortlistImageId returns null for narrator or a missing characterId', () => {
  assert.equal(selectValidatedShortlistImageId([], [], { characterId: 'narrator', requestedId: 1, previousId: null, isSexual: false }), null);
  assert.equal(selectValidatedShortlistImageId([], [], { characterId: null, requestedId: 1, previousId: null, isSexual: false }), null);
});

test('selectValidatedShortlistImageId rejects a requested ID belonging to a different character', () => {
  const shortlist = [{ image_id: 1, character_id: 'heroine1', image_pool: 'general' }];
  const result = selectValidatedShortlistImageId(shortlist, shortlist, { characterId: 'heroine9', requestedId: 1, previousId: null, isSexual: false });
  assert.equal(result, null);
});

test('selectValidatedShortlistImageId falls back to the matching pool leader when the requested ID is in the shortlist but its pool does not match', () => {
  const shortlist = [
    { image_id: 1, character_id: 'heroine9', image_pool: 'sex' },
    { image_id: 2, character_id: 'heroine9', image_pool: 'general' }
  ];
  const result = selectValidatedShortlistImageId(shortlist, shortlist, { characterId: 'heroine9', requestedId: 1, previousId: null, isSexual: false });
  assert.equal(result, 2);
});

test('selectValidatedShortlistImageId falls back to selectImageId(fullCatalog...) when the shortlist is empty', () => {
  const fullCatalog = [{ image_id: 7, character_id: 'heroine9', image_pool: 'general', curation_rank: 1 }];
  const result = selectValidatedShortlistImageId([], fullCatalog, { characterId: 'heroine9', requestedId: 999, previousId: null, isSexual: false });
  assert.equal(result, 7);
});

test('/api/commit-turn: a triggered scene_role image always wins over the recomputed shortlist', async () => {
  const originalFetch = globalThis.fetch;
  let committedPatch;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/rpc/get_commit_context')) {
      return new Response(JSON.stringify({
        turn_count: 10,
        master: { characters: { heroine1: { name: '한소영' } } },
        save: {}
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/get_image_catalog_for_characters')) {
      return new Response(JSON.stringify([
        { id: 501, character_id: 'heroine1', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 1, tags: ['기쁨'] },
        { id: 502, character_id: 'heroine1', image_pool: 'general', scene_role: null, curation_rank: 1, tags: ['기쁨'] }
      ]), { headers: { 'content-type': 'application/json' } });
    }
    if (requestUrl.includes('/rpc/commit_turn')) {
      committedPatch = JSON.parse(init.body).p_patch;
      return new Response(JSON.stringify({ status: 'committed', turn_count: 11 }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${requestUrl}`);
  };
  try {
    const response = await worker.fetch(apiRequest('/api/commit-turn', {
      game_id: 'test-game', turn_number: 11, content: '한소영이 활짝 웃었다.', player_input: '',
      extract: {
        character_id: 'heroine1', npcs_present: ['heroine1'], is_sexual: false, image_id: 502,
        suggestion_action: { action: 'activate', character_id: 'heroine1', content: '최면 유도', strength: 'surface' }
      }
    }), { SUPABASE_SECRET_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.equal(committedPatch.last_image_id, 501);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─────────────────────────────────────────────
// CURRENT NPC PROFILE injection
// ─────────────────────────────────────────────

const NPC_PROFILE_CHARACTERS = {
  heroine9: {
    name: '박소현', '나이': 35, '말투': '꼼꼼하고 신중, 약간 느린 말투',
    '성격': '꼼꼼·신중·안경 착용·유부녀', '소속': '3병동 간호사',
    '외형': '뿔테 안경, 흑발 단발펌, 골드 결혼반지', '체형': '통통+탄력',
    '연인관계': '기혼 (남편과 매너리즘, 권태기)',
    '취향': '일상에서 벗어난 자극. 자신을 깨워주는 사람에게 약함',
    '숨겨진설정': '남편과 매너리즘. 일상에 지루함.',
    '은밀정보': '유두: 적당 | 유륜: 큼', '신음타입': 'A형(수치심 순응)'
  }
};

test('buildCurrentNpcProfileSection includes name, age, affiliation, and speech style for the current main NPC', () => {
  const section = buildCurrentNpcProfileSection({ last_character_id: 'heroine9' }, NPC_PROFILE_CHARACTERS);
  assert.match(section, /\[CURRENT NPC PROFILE — ESTABLISHED FACT\]/);
  assert.match(section, /이름: 박소현/);
  assert.match(section, /나이: 35/);
  assert.match(section, /소속\/직급: 3병동 간호사/);
  assert.match(section, /말투: 꼼꼼하고 신중, 약간 느린 말투/);
});

test('buildCurrentNpcProfileSection never leaks 은밀정보 or 신음타입', () => {
  const section = buildCurrentNpcProfileSection({ last_character_id: 'heroine9' }, NPC_PROFILE_CHARACTERS);
  assert.doesNotMatch(section, /은밀정보/);
  assert.doesNotMatch(section, /유두/);
  assert.doesNotMatch(section, /신음타입/);
  assert.doesNotMatch(section, /수치심 순응/);
});

test('buildCurrentNpcProfileSection is empty for narrator, an unregistered ID, or a missing/empty ID', () => {
  assert.equal(buildCurrentNpcProfileSection({ last_character_id: 'narrator' }, NPC_PROFILE_CHARACTERS), '');
  assert.equal(buildCurrentNpcProfileSection({ last_character_id: 'heroine99' }, NPC_PROFILE_CHARACTERS), '');
  assert.equal(buildCurrentNpcProfileSection({}, NPC_PROFILE_CHARACTERS), '');
  assert.equal(buildCurrentNpcProfileSection({ last_character_id: 'heroine9' }, {}), '');
});

test('buildCurrentNpcProfileSection states that it overrides misremembered names/ages/ranks/speech from memory', () => {
  const section = buildCurrentNpcProfileSection({ last_character_id: 'heroine9' }, NPC_PROFILE_CHARACTERS);
  assert.match(section, /최근 기억·선택지·요약에 섞인 잘못된 이름, 나이, 직급, 말투보다 우선한다/);
  assert.match(section, /근거 없이 실장·과장·수간호사 등으로 승격시키지 않는다/);
});

test('CURRENT NPC PROFILE sits right after CURRENT SCENE and before EXPLICIT REGISTERED NPC MENTIONS', () => {
  const characters = { ...NPC_PROFILE_CHARACTERS, heroine1: { name: '한소영' } };
  const prompt = buildStoryPrompt({
    master: { characters },
    save: { last_character_id: 'heroine9', world_state: { location_label: '면회실' } },
    recent_memories: []
  }, '한소영 수간호사님, 잠깐 말씀 좀 나눌 수 있을까요?', 5);
  const content = prompt.messages[0].content;
  const sceneIndex = content.indexOf('[CURRENT SCENE');
  const profileIndex = content.indexOf('[CURRENT NPC PROFILE');
  const mentionIndex = content.indexOf('[EXPLICIT REGISTERED NPC MENTIONS');
  assert.ok(sceneIndex >= 0 && profileIndex > sceneIndex && mentionIndex > profileIndex);
});

// ─────────────────────────────────────────────
// Narrative length, pacing, NPC dialogue minimum
// ─────────────────────────────────────────────

test('the narrative length contract states the exact A/B/C character ranges and applies only to [1]', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  assert.match(content, /800~1,000자/);
  assert.match(content, /1,000~1,500자/);
  assert.match(content, /1,200~2,000자/);
  assert.match(content, /\[1\. 서사 및 행동\]만 다음 목표 길이로 작성한다/);
});

test('the narrative length contract requires five progress beats, at least one concrete change, and forbids padding/stat-forcing', () => {
  const section = buildNarrativeLengthSection();
  assert.match(section, /서사는 다음 진행 단위를 확실히 포함한다/);
  assert.match(section, /매 턴 최소 하나의 구체적인 변화가 있어야 한다/);
  assert.match(section, /수치를 억지로 올리거나 내리지 않는다/);
  assert.match(section, /같은 의미의 문장을 늘이거나 장황한 요약, 과거 회상 재복사로 채우지 않는다/);
});

test('the NPC dialogue minimum contract requires 3 meaningful lines, sums across multi-NPC scenes, and lists its exceptions', () => {
  const section = buildNpcDialogueMinimumSection();
  assert.match(section, /최소 3회/);
  assert.match(section, /장면 전체 등록 NPC 발언 합계가 최소 3회이면 되고, NPC마다 3회씩 강제하지 않는다/);
  assert.match(section, /narrator 장면/);
  assert.match(section, /재진입 모드/);
  assert.match(section, /player_setup 모드/);
  assert.match(section, /플레이어가 입력하지 않은 새 플레이어 발언을 임의로 만들어 대화 횟수를 채우지 않는다/);
});

test('the anti-repetition contract names the overused stock phrases and forbids re-running finished actions', () => {
  const section = buildAntiRepetitionSection();
  assert.match(section, /눈동자가 흔들렸다/);
  assert.match(section, /손가락을 만지작거렸다/);
  assert.match(section, /암시가 작동 중이다/);
  assert.match(section, /직전 턴에서 이미 끝난 손 내밀기, 자리 이동, 입장, 암시 성공을 다시 실행하지 않는다/);
});

// ─────────────────────────────────────────────
// Player status panel: no length cap, no duplicate NPC-stat display,
// full active-suggestion/CSA enumeration, mandatory monologue
// ─────────────────────────────────────────────

test('the player status panel contract has no length cap and forbids future stat deltas and invented timestamps', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  assert.match(content, /길이 상한은 없다/);
  assert.doesNotMatch(content, /250~400자/);
  assert.match(content, /이번 턴 예상 stat delta 숫자/);
  assert.match(content, /\(\+1\)·\(-2\) 같은 미확정 수치/);
  assert.match(content, /최면저항력 증감 추측/);
  assert.match(content, /아직 저장되지 않은 EXP와 레벨업 결과/);
  assert.match(content, /저장되지 않은 시각의 임의 생성/);
});

test('the player status panel contract keeps the player monologue mandatory and never lets the panel repeat it verbatim turn to turn', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  assert.match(content, /게임의 핵심 재미 요소이므로 반드시 포함한다/);
  assert.match(content, /실질 길이 40자 이상으로 쓴다\(장면에 맞으면 더 길어도 된다\)/);
  assert.match(content, /매턴 기계적으로 같은 독백을 반복하지 않는다/);
});

test('the player status panel contract drops current-target and NPC compliance/resistance display since the sidebar already shows them', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  // 🎯 접근 대상 legitimately appears once, inside the "don't copy the old
  // layout from recent memories" warning — but never as an active bullet.
  assert.doesNotMatch(content, /- 🎯 접근 대상/);
  assert.match(content, /현재 접근 대상, NPC 순응도·저항력 등 NPC 수치 요약\(우측 사이드바에 이미 표시되므로 중복이다\)/);
});

test('the final output contract explicitly forbids copying the old 🎯/📌 panel layout from recent memories of earlier turns', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  assert.match(content, /past turns may still show 🎯 접근 대상 or 📌 현재 목표 from an older contract; never copy that old layout/);
});

test('the 🔄 turn-change line is specified as qualitative-only, never a numeric delta', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  assert.match(content, /🔄 이번 턴: 실제로 일어난 사건을 정성적으로 서술한다/);
  assert.match(content, /순응 \+2, 저항 -1, 호감도 \+1처럼 숫자·기호로 된 수치 변화는 절대 쓰지 않는다/);
});

const STATUS_PANEL_CHARACTERS = { heroine9: { name: '박소현' }, heroine1: { name: '한소영' } };

test('buildActiveSuggestionPanelText lists every active suggestion for every NPC, grouped by real name, with no truncation', () => {
  const save = {
    active_suggestions: {
      heroine9: [
        { content: '금태양의 도움 요청에 최선을 다한다', strength: 'surface', active: true },
        { content: '금태양과 가까이 있을수록 마음이 편해진다', strength: 'deep', active: true },
        { content: '해제된 옛 암시', strength: 'surface', active: false }
      ],
      heroine1: [{ content: '금태양의 질문에는 솔직히 답한다', strength: 'surface', active: true }]
    }
  };
  const { count, lines } = buildActiveSuggestionPanelText(save, STATUS_PANEL_CHARACTERS);
  assert.equal(count, 3);
  assert.match(lines, /- 박소현/);
  assert.match(lines, /- 한소영/);
  assert.match(lines, /금태양의 도움 요청에 최선을 다한다/);
  assert.match(lines, /금태양과 가까이 있을수록 마음이 편해진다/);
  assert.match(lines, /금태양의 질문에는 솔직히 답한다/);
  assert.doesNotMatch(lines, /해제된 옛 암시/);
});

test('the player status panel contract requires every entry in the pre-formatted suggestion data to be shown, and forbids "외 n개" hiding', () => {
  const prompt = buildStoryPrompt({
    master: { characters: STATUS_PANEL_CHARACTERS },
    save: {
      player: {},
      active_suggestions: {
        heroine9: [{ content: '금태양의 도움 요청에 최선을 다한다', strength: 'surface', active: true }],
        heroine1: [{ content: '금태양의 질문에는 솔직히 답한다', strength: 'surface', active: true }]
      }
    },
    recent_memories: []
  }, '계속', 5);
  const content = prompt.messages[0].content;
  assert.match(content, /"외 n개"처럼 일부만 보여주고 나머지를 생략하지 않는다/);
  assert.match(content, /\[STATUS PANEL DATA — 활성 최면\]/);
  const dataSection = content.slice(content.lastIndexOf('[STATUS PANEL DATA — 활성 최면]'), content.lastIndexOf('[STATUS PANEL DATA — 상식 개변]'));
  assert.match(dataSection, /- 박소현/);
  assert.match(dataSection, /- 한소영/);
  assert.match(dataSection, /금태양의 도움 요청에 최선을 다한다/);
  assert.match(dataSection, /금태양의 질문에는 솔직히 답한다/);
});

test('buildCsaPanelText lists every active CSA with its scope label and content, plus active/max and daily-use counts', () => {
  const save = {
    player_progress: { level: 4 },
    csa_daily_used: 1,
    csa_active: [
      { content: '간호사는 환자의 개인적인 부탁에도 친절히 응한다', scope_label: '3병동', active: true },
      { content: '직원 간 가벼운 신체 접촉은 자연스러운 인사다', scope_label: '3층 전체', active: true },
      { content: '해제된 상식', scope_label: '3병동', active: false }
    ]
  };
  const data = buildCsaPanelText(save);
  assert.equal(data.count, 2);
  assert.equal(data.maxActive, 2); // getCsaLimits(4).max_active
  assert.equal(data.dailyUsed, 1);
  assert.match(data.lines, /- \[3병동\] 간호사는 환자의 개인적인 부탁에도 친절히 응한다/);
  assert.match(data.lines, /- \[3층 전체\] 직원 간 가벼운 신체 접촉은 자연스러운 인사다/);
  assert.doesNotMatch(data.lines, /해제된 상식/);
});

test('the player status panel contract requires every active CSA entry (not just count) to be shown with its scope and content', () => {
  const prompt = buildStoryPrompt({
    master: { characters: {} },
    save: {
      player: {},
      player_progress: { level: 4 },
      csa_active: [
        { content: '간호사는 환자의 개인적인 부탁에도 친절히 응한다', scope_label: '3병동', active: true },
        { content: '직원 간 가벼운 신체 접촉은 자연스러운 인사다', scope_label: '3층 전체', active: true }
      ]
    },
    recent_memories: []
  }, '계속', 5);
  const content = prompt.messages[0].content;
  assert.match(content, /\[STATUS PANEL DATA — 상식 개변\]/);
  const dataSection = content.slice(content.lastIndexOf('[STATUS PANEL DATA — 상식 개변]'));
  assert.match(dataSection, /활성 2개 \/ 최대 2개/);
  assert.match(dataSection, /- \[3병동\] 간호사는 환자의 개인적인 부탁에도 친절히 응한다/);
  assert.match(dataSection, /- \[3층 전체\] 직원 간 가벼운 신체 접촉은 자연스러운 인사다/);
});

test('an empty active-suggestion or CSA list renders as "없음" placeholders, not an empty or omitted section', () => {
  const prompt = buildStoryPrompt({ master: { characters: {} }, save: { player: {} }, recent_memories: [] }, '계속', 1);
  const content = prompt.messages[0].content;
  const suggestionData = content.slice(content.lastIndexOf('[STATUS PANEL DATA — 활성 최면]'), content.lastIndexOf('[STATUS PANEL DATA — 상식 개변]'));
  assert.match(suggestionData, /없음/);
  const csaData = content.slice(content.lastIndexOf('[STATUS PANEL DATA — 상식 개변]'), content.indexOf('[게임 설정]'));
  assert.match(csaData, /활성 0개 \/ 최대 1개, 오늘 사용 0회 \/ 한도 1회/);
  assert.match(csaData, /없음/);
});

// ─────────────────────────────────────────────
// Narrative length: gate [2] on [1]'s minimum, five progress beats
// ─────────────────────────────────────────────

test('the narrative length contract blocks starting [2] before [1] meets its lower bound, and lists the five progress beats', () => {
  const section = buildNarrativeLengthSection();
  assert.match(section, /\[1\]이 목표 하한을 채우기 전에는 \[2\. 플레이어 상황판\]을 시작하지 않는다/);
  assert.match(section, /출력하기 전에 내부적으로 \[1\]이 목표 하한을 충족했는지 스스로 확인한다/);
  assert.match(section, /1\. 입력에 대한 즉각적인 반응/);
  assert.match(section, /2\. 첫 번째 대화·행동 전개/);
  assert.match(section, /3\. 추가 질문·정보·행동 전개/);
  assert.match(section, /4\. 장면의 구체적인 결과/);
  assert.match(section, /5\. 다음 턴으로 이어지는 결정·갈등 또는 새 목표/);
});

test('the NPC dialogue minimum contract requires real progress between each NPC line, not just line count', () => {
  const section = buildNpcDialogueMinimumSection();
  assert.match(section, /각 NPC 발언 사이에는 새로운 행동·정보·결정·관계 변화 중 하나가 있어야 한다/);
});

// ─────────────────────────────────────────────
// Extract: concise JSON contract, image_reasoning removal, max_tokens
// ─────────────────────────────────────────────

test('Extract prompt carries the CONCISE JSON CONTRACT with the reason/turn_summary length limits', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.match(prompt, /\[CONCISE JSON CONTRACT\]/);
  assert.match(prompt, /reason 필드는 각각 짧은 한 문장으로 쓰고 60자를 넘기지 않는다/);
  assert.match(prompt, /turn_summary는 핵심 변화만 1~2문장, 최대 200자로 쓴다/);
  assert.match(prompt, /같은 근거를 여러 필드에 반복 설명하지 않는다/);
});

test('image_reasoning is fully removed: not in the JSON schema, and stripped from normalizeExtract output even if the model still sends it', () => {
  const prompt = buildExtractPrompt('서사', '입력', { master: {}, save: {} }, [], 1);
  assert.doesNotMatch(prompt, /image_reasoning/);
  const normalized = normalizeExtract({ character_id: 'heroine9', image_reasoning: '모델이 어쨌든 보낸 값' });
  assert.equal('image_reasoning' in normalized, false);
});
