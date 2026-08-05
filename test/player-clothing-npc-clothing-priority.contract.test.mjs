import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const partPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-25.part', import.meta.url);
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
  generatedWorker();
  if (!moduleCache) moduleCache = import(`${pathToFileURL(fileURLToPath(generatedPath)).href}?test=${Date.now()}`);
  return moduleCache;
}

test('part 25 adds no model database timer random or frontend dependency', () => {
  assert.doesNotMatch(part, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(part, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(part, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(part, /pages\//);
});

test('player clothing schema persists four independent clothing fields', () => {
  const generated = generatedWorker();
  assert.match(generated, /PLAYER_CLOTHING_FIELDS = \['outer_top', 'outer_bottom', 'underwear_top', 'underwear_bottom'\]/);
  assert.match(generated, /"outer_top": "worn\|open\|removed\|unknown"/);
  assert.match(generated, /function buildPlayerSceneStatePatch/);
  assert.match(generated, /clothing,\s*updated_turn: turnNumber/);
});

test('player base outfit and half-lowered pants bootstrap into stable state', async () => {
  const { resolveEffectivePlayerClothingState } = await generatedModule();
  const clothing = resolveEffectivePlayerClothingState({
    player: { style: '연한 회색 셔츠에 검은 청바지, 가죽 서류 가방' },
    player_scene_state: {
      position_label: '바지를 반쯤 내리고 꺼낸 성기를 손으로 감싸 자위하는 중'
    }
  });
  assert.equal(clothing.outer_top, 'worn');
  assert.equal(clothing.outer_bottom, 'open');
  assert.equal(clothing.underwear_bottom, 'open');
});

test('player Story section fixes clothing identity and state', async () => {
  const { buildCurrentPlayerPhysicalSceneStateSection } = await generatedModule();
  const section = buildCurrentPlayerPhysicalSceneStateSection({
    player: { style: '연한 회색 셔츠에 검은 청바지' },
    player_scene_state: {
      clothing: { outer_top: 'worn', outer_bottom: 'open', underwear_bottom: 'open' },
      position_label: '바지를 반쯤 내린 상태'
    }
  });
  assert.match(section, /CURRENT PLAYER CLOTHING AND PHYSICAL STATE — FINAL AUTHORITY/);
  assert.match(section, /연한 회색 셔츠에 검은 청바지/);
  assert.match(section, /하의: 열림\/일부 내림/);
  assert.match(section, /셔츠가 재킷이나 정장으로 바뀌거나 색상·종류가 임의로 변하지 않는다/);
});

test('Extract only changes player clothing on completed physical action', () => {
  const generated = generatedWorker();
  assert.match(generated, /PLAYER CLOTHING STATE EXTRACTION/);
  assert.match(generated, /이번 최종 Story에서 바뀐 필드만 반환한다/);
  assert.match(generated, /지퍼를 열거나 반쯤 내리거나 젖힌 상태는 open/);
  assert.match(generated, /단순 노출 묘사나 이전 상태 반복만으로 바꾸지 않는다/);
});

test('active NPC clothing authority is last and covers registered NPC switches', () => {
  const generated = generatedWorker();
  assert.match(generated, /const allRegisteredIds = Object\.keys/);
  assert.match(generated, /FINAL ACTIVE CLOTHING CSA — DO NOT CONTRADICT/);
  assert.match(generated, /playerAttemptSection \+ playerPhysicalSceneStateSection \+ playerEjaculationMeterSection \+ generalNpcPoolSection \+ absoluteClothingCsaSection/);
  assert.doesNotMatch(generated, /physicalSceneStateSection \+ absoluteClothingCsaSection \+ narrativeLengthSection/);
});

test('fully nude CSA target is already nude and never removes a new top', async () => {
  const { buildAbsoluteClothingCsaSection } = await generatedModule();
  const section = buildAbsoluteClothingCsaSection({
    last_character_id: 'heroine7',
    last_npcs_present: ['heroine7'],
    world_state: { location_label: '5층 가정의학과 과장실' },
    csa_active: [{
      id: 'csa_nude', active: true, source_type: 'preset', created_turn: 1,
      content: '병원 직원은 전라 상태가 표준 근무 복장이며 그 상태로 근무해야 한다.',
      preset: {
        template_id: 'nudity_is_standard_uniform_for_selected_group',
        required_action: 'nudity_is_standard_uniform_for_selected_group',
        actor_group: 'hospital_staff', target_group: 'unknown', trigger: 'always_on_duty', duration: 'while_on_duty'
      }
    }]
  }, {
    heroine7: { name: '서지아', '소속': '내과 과장 의사' },
    heroine8: { name: '한세아', '소속': '가정의학과 과장 의사' }
  });
  assert.match(section, /한세아: .*uniform_top=벗음/);
  assert.match(section, /이미 완전한 전라 상태/);
  assert.match(section, /새로 옷을 벗는 준비 장면을 만들지 않는다/);
  assert.match(section, /상의만 입음, 가운을 걸침, 하의만 벗음 같은 중간 복장을 절대 쓰지 않는다/);
});

test('generated Worker syntax is valid', () => {
  generatedWorker();
  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(generatedPath)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
