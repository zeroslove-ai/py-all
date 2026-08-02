import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const partPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-24.part', import.meta.url);
const generatedPath = new URL('../worker/game-proxy-v2.generated.js', import.meta.url);
const part = fs.readFileSync(partPath, 'utf8');
let generatedCache = null;
let moduleCache = null;

function generatedWorker() {
  if (generatedCache) return generatedCache;
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  generatedCache = fs.readFileSync(generatedPath, 'utf8');
  return generatedCache;
}

async function generatedModule() {
  if (moduleCache) return moduleCache;
  generatedWorker();
  moduleCache = await import(`${pathToFileURL(fileURLToPath(generatedPath)).href}?test=${Date.now()}`);
  return moduleCache;
}

const characters = {
  heroine7: { name: '서지아', 성별: '여성', 소속: '내과 과장 의사' }
};

function clothingSave(overrides = {}) {
  return {
    last_character_id: 'heroine7',
    last_npcs_present: ['heroine7'],
    npc_scene_state: {
      heroine7: {
        clothing: {
          uniform_top: 'worn',
          uniform_bottom: 'worn',
          underwear_top: 'worn',
          underwear_bottom: 'worn'
        },
        posture: 'standing'
      }
    },
    csa_active: [{
      id: 'csa_clothing_1',
      active: true,
      source_type: 'preset',
      scope_type: 'world',
      scope_id: 'world',
      content: '병원 직원은 전라 상태가 표준 근무 복장이며 그 상태로 근무해야 한다.',
      created_turn: 10,
      preset: {
        template_id: 'nudity_is_standard_uniform_for_selected_group',
        required_action: 'nudity_is_standard_uniform_for_selected_group',
        actor_group: 'hospital_staff',
        target_group: null,
        trigger: 'always_on_duty',
        duration: 'while_on_duty',
        public_normalization: true
      }
    }],
    ...overrides
  };
}

test('part 24 adds no model call database call timer random or frontend dependency', () => {
  assert.doesNotMatch(part, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(part, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(part, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(part, /pages\//);
});

test('affinity prompt allows modest sexual satisfaction without mechanical farming', () => {
  const generated = generatedWorker();
  assert.match(generated, /성적 매력, 성적 만족, 신체적 친밀감, 익숙함과 떡정도 작은 긍정 근거/);
  assert.match(generated, /매 턴 기계적으로 누적하지 않는다/);
  assert.match(generated, /숫자용 키워드 계산 없이 장면 전체와 NPC 성격을 보고 자연스럽게 판단한다/);
  assert.doesNotMatch(generated, /성행위 자체·플레이어 결과 선언·높은 수용도만을 근거로 한 호감 상승은 delta 0/);
});

test('clothing CSA is absolute and removes invented exception branches', () => {
  const generated = generatedWorker();
  assert.match(generated, /활성 복장 CSA — 실제 복장의 절대 최종 권위/);
  assert.match(generated, /플레이어가 반대 복장을 입혀도 NPC는 규정상 유지할 수 없다고 말하고 즉시 스스로 위 상태로 되돌린다/);
  assert.match(generated, /별도의 예외, 의식적 위반, 불이익 감수, 협상 분기를 만들지 않는다/);
  assert.doesNotMatch(generated, /NPC가 의식적으로 위반하려면 규정을 정확히 알고/);
});

test('active nudity clothing CSA overrides worn Extract and saved clothing state', async () => {
  const worker = await generatedModule();
  const save = clothingSave();
  const forced = worker.resolveAbsoluteClothingCsaByCharacter(save, characters, save.csa_active, ['heroine7']);
  assert.deepEqual(forced.heroine7, {
    uniform_top: 'removed',
    uniform_bottom: 'removed',
    underwear_top: 'removed',
    underwear_bottom: 'removed'
  });

  const normalized = worker.applyAbsoluteClothingCsaState(save, {
    heroine7: {
      clothing: {
        uniform_top: 'worn',
        uniform_bottom: 'worn',
        underwear_top: 'worn',
        underwear_bottom: 'worn'
      }
    }
  }, ['heroine7'], characters, 20);

  assert.deepEqual(normalized.heroine7.clothing, {
    uniform_top: 'removed',
    uniform_bottom: 'removed',
    underwear_top: 'removed',
    underwear_bottom: 'removed'
  });
  assert.equal(normalized.heroine7.updated_turn, 20);
});

test('relationship prompt defaults sudden dating requests to refusal or deferral', () => {
  const generated = generatedWorker();
  assert.match(generated, /연애 관계 기본 원칙 — 단순 최종 규칙/);
  assert.match(generated, /플레이어가 갑자기 교제를 요구하면 기본 반응은 거절하거나 아직 이르다며 유보/);
  assert.match(generated, /성적 만족과 호감 상승은 가능하지만, 그것이 곧 연애 수락이나 사랑 고백을 뜻하지 않는다/);
});

test('low-affinity girlfriend acceptance creates a next-turn correction', async () => {
  const worker = await generatedModule();
  const state = worker.resolveRelationshipCorrectionState({
    previousSave: {
      last_character_id: 'heroine7',
      npc_stats: { heroine7: { 호감도: 15 } },
      npc_relationship_state: { heroine7: { relationship_memory: [] } }
    },
    narrativeText: '[1. 서사 및 행동]\n서지아 (흔들리는 목소리로): “좋아요. 오늘부터 저, 자기야 여자친구예요.”',
    characterId: 'heroine7',
    characters,
    turnNumber: 100
  });
  assert.equal(state.detected, true);
  assert.equal(state.pending.active, true);
  assert.equal(state.pending.character_id, 'heroine7');
  assert.equal(state.clear_address_override, true);
});

test('sufficient affinity does not trigger the lightweight correction detector', async () => {
  const worker = await generatedModule();
  const state = worker.resolveRelationshipCorrectionState({
    previousSave: {
      last_character_id: 'heroine7',
      npc_stats: { heroine7: { 호감도: 45 } },
      npc_relationship_state: { heroine7: { relationship_memory: [] } }
    },
    narrativeText: '[1. 서사 및 행동]\n서지아 (차분하게): “좋아요. 오늘부터 당신의 여자친구가 될게요.”',
    characterId: 'heroine7',
    characters,
    turnNumber: 101
  });
  assert.equal(state.detected, false);
  assert.equal(state.pending, null);
});

test('pending correction clears only after the NPC explicitly retracts the claim', async () => {
  const worker = await generatedModule();
  const previousSave = {
    last_character_id: 'heroine7',
    npc_stats: { heroine7: { 호감도: 15 } },
    relationship_correction_pending: {
      active: true,
      character_id: 'heroine7',
      source_turn: 100,
      invalid_claim: '성급한 연애 관계 수락'
    },
    npc_relationship_state: { heroine7: { relationship_memory: [] } }
  };
  const state = worker.resolveRelationshipCorrectionState({
    previousSave,
    narrativeText: '[1. 서사 및 행동]\n서지아 (차분하게 고개를 저으며): “아까 여자친구가 되겠다는 말은 너무 성급했어요. 그 말은 취소할게요.”',
    characterId: 'heroine7',
    characters,
    turnNumber: 101
  });
  assert.equal(state.detected, false);
  assert.equal(state.pending.active, false);
  assert.equal(state.pending.corrected_turn, 101);
});

test('legacy low-affinity romantic memory injects correction before current action', async () => {
  const worker = await generatedModule();
  const section = worker.buildRelationshipCorrectionSection({
    last_character_id: 'heroine7',
    npc_stats: { heroine7: { 호감도: 21 } },
    npc_relationship_state: {
      heroine7: {
        relationship_memory: [{ text: '서지아가 플레이어의 여자친구 제안에 수락하며 자기야라고 부르기 시작했다.', turn: 533 }]
      }
    }
  }, characters);
  assert.match(section, /관계 오류 정정 — 이번 응답의 첫 행동으로 반드시 실행/);
  assert.match(section, /플레이어의 이번 행동이나 선택지에 반응하기 전에/);
  assert.match(section, /잘못된 자기야 호칭과 사랑 고백을 계속 이어가지 않는다/);
});

test('generated Worker syntax is valid', () => {
  generatedWorker();
  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(generatedPath)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
