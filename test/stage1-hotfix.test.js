import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSavePatch,
  buildWorldStatePatch,
  hasLegacyEncounterEvidence,
  normalizeFirstEncounterStats
} from '../worker/game-proxy-v2.js';

test('blank npc_emotion placeholders are not legacy encounter evidence', () => {
  const save = {
    npc_emotion: {
      heroine2: { surface: '', inner: '', physical_reaction: '' }
    }
  };
  assert.equal(hasLegacyEncounterEvidence(save, 'heroine2'), false);
});

test('a meaningful stored NPC emotion is legacy encounter evidence', () => {
  const save = {
    npc_emotion: {
      heroine2: { surface: '  “처음 본 방문객이 신경 쓰인다.”  ', inner: '' }
    }
  };
  assert.equal(hasLegacyEncounterEvidence(save, 'heroine2'), true);
});

test('incomplete first_encounter_stats is rejected instead of becoming zero-zero', () => {
  assert.equal(normalizeFirstEncounterStats({}), null);
  assert.equal(normalizeFirstEncounterStats({ 호감도: 12 }), null);
  assert.equal(normalizeFirstEncounterStats({ 신뢰도: 9 }), null);
});

test('invalid first_encounter_stats preserves existing stats and creates no encounter record', () => {
  const previousSave = {
    npc_stats: {
      heroine2: { 호감도: 14, 신뢰도: 11, 최면깊이: 0, 순응도: 10, 최면저항력: 40 }
    }
  };
  const extract = {
    character_id: 'heroine2',
    first_encounter_stats: { 호감도: 20 },
    npc_stat_changes: {}
  };
  const patch = buildSavePatch(extract, {}, null, previousSave, 7, '');
  assert.equal(patch.npc_stats.heroine2.호감도, 14);
  assert.equal(patch.npc_stats.heroine2.신뢰도, 11);
  assert.equal(patch.npc_encounters, undefined);
});

test('6층 is normalized to hospital_floor_6', () => {
  assert.deepEqual(buildWorldStatePatch({ floor: '6층' }), { floor: 'hospital_floor_6' });
  assert.deepEqual(buildWorldStatePatch({ floor: 'hospital_floor_6' }), { floor: 'hospital_floor_6' });
});
