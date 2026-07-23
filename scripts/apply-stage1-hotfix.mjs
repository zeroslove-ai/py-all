import fs from 'node:fs';

const workerPath = 'worker/game-proxy-v2.js';
const testPath = 'test/stage1-hotfix.test.js';
let worker = fs.readFileSync(workerPath, 'utf8');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch target is not unique: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

worker = replaceOnce(
  worker,
  `const CSA_SCOPE_LABELS = {
  seoul_central_hospital: '서울중앙병원',
  hospital_floor_3: '서울중앙병원 3층',
  hospital_3ward: '서울중앙병원 3병동',
  hospital_6ward: '서울중앙병원 6병동',
  world: '병원 전체'
};`,
  `const CSA_SCOPE_LABELS = {
  seoul_central_hospital: '서울중앙병원',
  hospital_floor_3: '서울중앙병원 3층',
  hospital_floor_6: '서울중앙병원 6층',
  hospital_3ward: '서울중앙병원 3병동',
  hospital_6ward: '서울중앙병원 6병동',
  world: '병원 전체'
};`,
  'CSA 6th-floor label'
);

worker = replaceOnce(
  worker,
  `const WORLD_STATE_FLOOR_IDS = { '3층': 'hospital_floor_3', hospital_floor_3: 'hospital_floor_3' };`,
  `const WORLD_STATE_FLOOR_IDS = {
  '3층': 'hospital_floor_3',
  hospital_floor_3: 'hospital_floor_3',
  '6층': 'hospital_floor_6',
  hospital_floor_6: 'hospital_floor_6'
};`,
  'world-state 6th-floor IDs'
);

worker = replaceOnce(
  worker,
  `function hasLegacyEncounterEvidence(previousSave, characterId) {
  if (!characterId) return false;
  if (previousSave?.last_character_id === characterId) return true;
  if (isPlainObject(previousSave?.npc_emotion?.[characterId]) && Object.keys(previousSave.npc_emotion[characterId]).length > 0) return true;
  if (isPlainObject(previousSave?.npc_stat_changes?.[characterId])) return true;
  if (isPlainObject(previousSave?.npc_relationship_state?.[characterId])) return true;
  return false;
}`,
  `function hasMeaningfulNpcEmotion(emotion) {
  if (!isPlainObject(emotion)) return false;
  return ['surface', 'inner', 'physical_reaction'].some(key =>
    typeof emotion[key] === 'string' && emotion[key].trim().length > 0
  );
}

function hasLegacyEncounterEvidence(previousSave, characterId) {
  if (!characterId) return false;
  if (previousSave?.last_character_id === characterId) return true;
  if (hasMeaningfulNpcEmotion(previousSave?.npc_emotion?.[characterId])) return true;
  if (isPlainObject(previousSave?.npc_stat_changes?.[characterId])) return true;
  if (isPlainObject(previousSave?.npc_relationship_state?.[characterId])) return true;
  return false;
}`,
  'meaningful legacy emotion detection'
);

worker = replaceOnce(
  worker,
  `function normalizeFirstEncounterStats(raw) {
  if (!isPlainObject(raw)) return null;
  const reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 240) : '';
  return {
    호감도: clampStatValue(raw['호감도'], 0, 35),
    신뢰도: clampStatValue(raw['신뢰도'], 0, 35),
    reason
  };
}`,
  `function normalizeFirstEncounterStats(raw) {
  if (!isPlainObject(raw)) return null;
  const affinity = Number(raw['호감도']);
  const trust = Number(raw['신뢰도']);
  if (!Number.isFinite(affinity) || !Number.isFinite(trust)) return null;
  const reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 240) : '';
  return {
    호감도: clampStatValue(affinity, 0, 35),
    신뢰도: clampStatValue(trust, 0, 35),
    reason
  };
}`,
  'reject incomplete first-encounter stats'
);

fs.writeFileSync(workerPath, worker);

fs.writeFileSync(testPath, `import test from 'node:test';
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
`);

console.log('Stage 1 hotfix applied.');
