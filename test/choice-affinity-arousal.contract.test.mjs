import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const patchPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-21.part', import.meta.url);
const generatedPath = new URL('../worker/game-proxy-v2.generated.js', import.meta.url);
const patch = fs.readFileSync(patchPath, 'utf8');

function runBuild() {
  return spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
}

function loadGeneratedContracts() {
  const build = runBuild();
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  const generated = fs.readFileSync(generatedPath, 'utf8');
  const transformed = generated.replace('export default {', 'const __workerDefault = {')
    + '\nglobalThis.__contractExports = {'
    + ' buildChoiceMeta, isCurrentChoiceMetaValid, resolveAffinityEvidenceAllowance, LOW_AFFINITY_ROMANCE_RE'
    + ' };';
  const context = {
    console: { log() {}, warn() {}, error() {} },
    structuredClone: globalThis.structuredClone,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    AbortController: globalThis.AbortController,
    setTimeout,
    clearTimeout,
    Response: globalThis.Response,
    Request: globalThis.Request,
    Headers: globalThis.Headers,
    crypto: globalThis.crypto,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    fetch: async () => { throw new Error('network disabled in contract test'); }
  };
  vm.runInNewContext(transformed, context, { timeout: 5000, filename: 'game-proxy-v2.generated.js' });
  return { generated, contracts: context.__contractExports };
}

function makeAuthorityFixture() {
  const csa = {
    id: 'csa_463_1',
    active: true,
    source_type: 'preset',
    scope_type: 'world',
    scope_id: 'world',
    strength: '강함',
    content: '병원 안의 모든 사람은 병원 안에서 플레이어의 성적 행동을 정당한 권한 행사로 받아들여야 한다.',
    preset: {
      trigger: 'always_on_duty',
      duration: 'continuous',
      persistent: true,
      actor_group: 'everyone_in_hospital',
      target_group: 'player',
      template_id: 'player_sexual_conduct_is_legitimate_authority',
      required_action: 'treat_player_sexual_conduct_as_authority',
      direct_meaning_tags: ['성적 행동', '정당', '권한'],
      public_normalization: true
    }
  };
  const save = {
    last_character_id: 'heroine5',
    last_npcs_present: ['heroine5'],
    csa_active: [csa],
    player: { name: '최영철', job: '감사실장', background: '병원 이사장 직속 감사실장' },
    npc_stats: { heroine5: { 호감도: 4, 상식수용도: 50, 성적흥분도: 98 } },
    npc_relationship_state: { heroine5: { intimacy_state: { stage: 'none', active_boundaries: [] } } },
    world_state: { building: '서울중앙병원', floor: '5층', ward: '6병동', location_label: '간호사 스테이션' }
  };
  const master = {
    characters: {
      heroine5: {
        name: '김지은',
        job: '수간호사',
        rank: '수간호사',
        affiliation: '서울중앙병원 6병동',
        gender: '여성'
      }
    }
  };
  const structuredMeta = [{
    choice_index: 0,
    action_types: ['penetration'],
    actor_id: 'player',
    target_id: 'heroine5',
    suggested_route: 'csa_direct',
    direct_csa_ids: ['csa_463_1']
  }];
  return { save, master, structuredMeta };
}

test('part 21 contains no added model database timer random or frontend dependency', () => {
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(patch, /pages\//);
});

test('player sexual conduct authority is handled before nominal NPC-to-player direction', () => {
  assert.match(patch, /function isPlayerSexualConductAuthorityCsa/);
  assert.match(patch, /treat_player_sexual_conduct_as_authority/);
  assert.match(patch, /resolvePlayerSexualConductAuthorityTarget/);
  assert.match(patch, /authorityMode: 'player_acts_on_compliant_npc'/);
});

test('structured CSA authority choice never displays bold 10 percent', () => {
  const { contracts } = loadGeneratedContracts();
  const { save, master, structuredMeta } = makeAuthorityFixture();
  const [meta] = contracts.buildChoiceMeta(
    ['김지은에게 그대로 삽입을 이어간다'],
    save,
    master,
    480,
    { allowBold: true, structuredMeta }
  );
  assert.equal(meta.kind, 'csa_direct');
  assert.equal(meta.success_rate, null);
  assert.equal(meta.severity, 'none');
  assert.equal(meta.sexual_gate, 'csa_direct');
  assert.deepEqual(Array.from(meta.direct_csa_ids), ['csa_463_1']);
  assert.equal(meta.csa_direct.physical_actor_type, 'player');
  assert.equal(meta.csa_direct.physical_target_character_id, 'heroine5');
});

test('text fallback uses the same direct authority route without structured metadata', () => {
  const { contracts } = loadGeneratedContracts();
  const { save, master } = makeAuthorityFixture();
  const [meta] = contracts.buildChoiceMeta(
    ['김지은의 질에 성기를 삽입한다'],
    save,
    master,
    480,
    { allowBold: true, structuredMeta: [] }
  );
  assert.equal(meta.kind, 'csa_direct');
  assert.equal(meta.success_rate, null);
  assert.deepEqual(Array.from(meta.direct_csa_ids), ['csa_463_1']);
});

test('a stale bold 10 percent cache is rejected when live coverage is direct', () => {
  const { contracts } = loadGeneratedContracts();
  const { save, master, structuredMeta } = makeAuthorityFixture();
  const [direct] = contracts.buildChoiceMeta(
    ['김지은에게 그대로 삽입을 이어간다'], save, master, 480,
    { allowBold: true, structuredMeta }
  );
  const stale = {
    ...direct,
    kind: 'bold',
    severity: 'extreme',
    success_rate: 10,
    sexual_gate: 'voluntary_eligible',
    direct_csa_ids: [],
    csa_direct: undefined
  };
  assert.equal(contracts.isCurrentChoiceMetaValid(
    ['김지은에게 그대로 삽입을 이어간다'],
    [stale],
    480,
    { save, master, structuredMeta }
  ), false);
});

test('arousal alone never creates affinity evidence', () => {
  const { contracts } = loadGeneratedContracts();
  const result = contracts.resolveAffinityEvidenceAllowance(
    '삽입이 좋고 몸이 강하게 반응하며 더 열리는 태도를 보임',
    98,
    { active: true, intensity: 'high' }
  );
  assert.equal(result.max_delta, 0);
  assert.equal(result.tier, 'none');
});

test('high arousal amplifies real gentle care but not beyond plus two', () => {
  const { contracts } = loadGeneratedContracts();
  const result = contracts.resolveAffinityEvidenceAllowance(
    '불안해하자 부드럽게 속도를 낮추고 괜찮은지 상태를 확인하며 안심시킴',
    98,
    { active: true, intensity: 'high' }
  );
  assert.equal(result.max_delta, 2);
  assert.equal(result.tier, 'care');
  assert.equal(result.arousal_amplified, true);
});

test('a light compliment remains a small affinity event even during high arousal', () => {
  const { contracts } = loadGeneratedContracts();
  const result = contracts.resolveAffinityEvidenceAllowance(
    '사랑스럽고 아름답다고 다정하게 칭찬함',
    98,
    { active: true, intensity: 'high' }
  );
  assert.equal(result.max_delta, 1);
  assert.equal(result.tier, 'light_compliment');
});

test('boundary respect can create a stronger trust gain', () => {
  const { contracts } = loadGeneratedContracts();
  const result = contracts.resolveAffinityEvidenceAllowance(
    '멈춰 달라는 요청을 즉시 존중하고 선택권을 돌려줌',
    20,
    null
  );
  assert.equal(result.max_delta, 3);
  assert.equal(result.tier, 'strong');
});

test('low-affinity overreach catches retroactive consent and personal devotion', () => {
  const { contracts } = loadGeneratedContracts();
  assert.equal(contracts.LOW_AFFINITY_ROMANCE_RE.test('규정이 아니었어도 실장님과 했을 거예요.'), true);
  assert.equal(contracts.LOW_AFFINITY_ROMANCE_RE.test('저는 실장님에게만 약해지는 것 같아요.'), true);
  assert.equal(contracts.LOW_AFFINITY_ROMANCE_RE.test('다정하게 말씀해 주셔서 조금 안심됐어요.'), false);
});

test('generated Story contract exposes visible affinity stages and next-turn expression timing', () => {
  const { generated } = loadGeneratedContracts();
  assert.match(generated, /흥분·다정함·호감 단계 분리/);
  assert.match(generated, /이번 Story의 감정 표현 상한은 반드시 턴 시작 호감도로 정한다/);
  assert.match(generated, /호감도 0~9/);
  assert.match(generated, /호감도 10~19/);
  assert.match(generated, /호감도 20~39/);
  assert.match(generated, /과거의 동기와 동의를 소급 변경하지 않는다/);

  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(generatedPath)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
