import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const generatedPath = new URL('../worker/game-proxy-v2.generated.js', import.meta.url);
const ejaculationPartPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-26.part', import.meta.url);
const generalNpcPartPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-27.part', import.meta.url);
const ejaculationPart = fs.readFileSync(ejaculationPartPath, 'utf8');
const generalNpcPart = fs.readFileSync(generalNpcPartPath, 'utf8');
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
  if (!moduleCache) {
    moduleCache = import(`${pathToFileURL(fileURLToPath(generatedPath)).href}?test=${Date.now()}`);
  }
  return moduleCache;
}

test('parts 26 and 27 add no model, database, timer, random, or frontend dependency', () => {
  for (const part of [ejaculationPart, generalNpcPart]) {
    assert.doesNotMatch(part, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
    assert.doesNotMatch(part, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
    assert.doesNotMatch(part, /Math\.random|setInterval|setTimeout/);
    assert.doesNotMatch(part, /pages\//);
  }
});

test('ejaculation meter is denied below fifty and does not auto-complete at one hundred', async () => {
  const { resolvePlayerSexualStateUpdate } = await generatedModule();
  const below = resolvePlayerSexualStateUpdate(
    { player_sexual_state: { ejaculation_meter: 49 } },
    { player_sexual_state_patch: { meter_delta: 0, ejaculation_completed: true, ejaculation_evidence: '사정했다' } },
    '플레이어는 사정했다.',
    10
  );
  assert.equal(below.accepted, false);
  assert.equal(below.state.ejaculation_meter, 49);

  const fullWithoutRequest = resolvePlayerSexualStateUpdate(
    { player_sexual_state: { ejaculation_meter: 100 } },
    { player_sexual_state_patch: { meter_delta: 0, ejaculation_completed: false, ejaculation_evidence: '' } },
    '플레이어는 숨을 고른다.',
    11
  );
  assert.equal(fullWithoutRequest.accepted, false);
  assert.equal(fullWithoutRequest.state.ejaculation_meter, 100);
});

test('accepted ejaculation requires final Story evidence and resets the meter', async () => {
  const { resolvePlayerSexualStateUpdate } = await generatedModule();
  const absentEvidence = resolvePlayerSexualStateUpdate(
    { player_sexual_state: { ejaculation_meter: 50 } },
    { player_sexual_state_patch: { meter_delta: 0, ejaculation_completed: true, ejaculation_evidence: '사정했다' } },
    '플레이어는 숨을 고른다.',
    12
  );
  assert.equal(absentEvidence.accepted, false);

  const accepted = resolvePlayerSexualStateUpdate(
    { player_sexual_state: { ejaculation_meter: 50 } },
    { player_sexual_state_patch: { meter_delta: 0, ejaculation_completed: true, ejaculation_evidence: '사정했다' } },
    '플레이어는 사정했다.',
    13
  );
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.ejaculation_meter, 0);
  assert.equal(accepted.state.last_ejaculation_turn, 13);
  assert.equal(accepted.amount, 'moderate');
});

test('ejaculation amount scales at seventy, eighty-five, and one hundred', async () => {
  const { playerEjaculationAmountForMeter } = await generatedModule();
  assert.equal(playerEjaculationAmountForMeter(50), 'moderate');
  assert.equal(playerEjaculationAmountForMeter(70), 'large');
  assert.equal(playerEjaculationAmountForMeter(85), 'very_large');
  assert.equal(playerEjaculationAmountForMeter(100), 'extreme');
});

test('generated Story contract states the fixed ejaculation-meter rules', () => {
  const generated = generatedWorker();
  assert.match(generated, /플레이어 사정 게이지 — 0~100 절대 규칙/);
  assert.match(generated, /0~49에서는 플레이어가 사정을 요구해도/);
  assert.match(generated, /50~99에서는 플레이어가 사정을 선택하거나/);
  assert.match(generated, /100에 도달한 바로 그 턴에는 자동 사정하지 않고/);
  assert.match(generated, /이번 턴은 100에 도달한 다음 턴이므로 기본 결과는 반드시 사정/);
  assert.match(generated, /즉시 성기를 빼고 삽입·손·구강 등 모든 직접 자극에서 완전히 벗어나/);
  assert.match(generated, /NPC가 성기를 놓아주지 않거나 붙잡거나 계속 자극하면/);
  assert.match(generated, /const nextMeter = accepted \? 0 : escapedAtOneHundred \? 85 : projectedMeter/);
  assert.match(generated, /ejaculation_meter: nextMeter/);
  assert.match(generated, /forced_ejaculation_pending: accepted \|\| escapedAtOneHundred \? false/);
  assert.match(generated, /escapedAtOneHundred \? 85/);
});

test('general NPCs are limited to the configured pool and remain without invented state', async () => {
  const { buildGeneralNpcPoolSection } = await generatedModule();
  const section = buildGeneralNpcPoolSection({
    general_npcs: {
      profiles: {
        porter_1: { name: '오민석', age: 31, gender: 'male', role: '이송 직원', personality: '조용함' }
      }
    }
  });
  assert.match(section, /GENERAL NPC POOL — 단역 NPC의 유일한 출처/);
  assert.match(section, /위 general_npcs\.profiles 중 한 명/);
  assert.match(section, /새 이름·직업·나이·외형·관계·설정을 즉흥 생성하지 않는다/);
  assert.match(section, /임의로 퇴장·사라짐·복귀하지 않는다/);
  assert.match(section, /새 character_id, npc_stats, 마인드 모니터, 전용 이미지, 영구 관계 수치를 만들지 않는다/);
});

test('adult supporting NPC sexual observation remains non-coercive', () => {
  const generated = generatedWorker();
  assert.match(generated, /흥미를 보이고 계속 지켜보거나 즐기는 방향을 기본/);
  assert.match(generated, /강압·폭력·무단 신체접촉을 자동 생성하지 않는다/);
});

test('generated Worker syntax is valid', () => {
  generatedWorker();
  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(generatedPath)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
