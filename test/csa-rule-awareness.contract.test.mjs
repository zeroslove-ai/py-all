import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const patchPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-17.part', import.meta.url);
const patch = fs.readFileSync(patchPath, 'utf8');

const runBuild = () => spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
  cwd: fileURLToPath(repoRoot),
  encoding: 'utf8'
});

test('active refusal-cost CSA must be known and cannot be denied', () => {
  assert.match(patch, /활성 CSA 규정 인식·의식적 위반 계약 — 현재 규칙 최종 권위/);
  assert.match(patch, /실제로 존재하고 현재 자신에게 적용된다는 사실을 반드시 안다/);
  assert.match(patch, /그런 규정은 없다/);
  assert.match(patch, /우리 병원에는 적용되지 않는다/);
  assert.match(patch, /존재하지 않는 예외를 만들지 않는다/);
});

test('rule awareness and behavioral compliance remain separate decisions', () => {
  assert.match(patch, /규정을 아는 것과 모든 요구를 무조건 수행하는 것은 별개/);
  assert.match(patch, /수행, 부분 수행, 즉시 협상, 또는 의식적 위반/);
  assert.match(patch, /성격·상식수용도·저항·공포·수치심·행동 강도/);
});

test('conscious refusal requires acknowledged consequences and player action space', () => {
  assert.match(patch, /업무 태만이며 감점·징계 가능성이 있음을 알고도 그 비용을 감수/);
  assert.match(patch, /가능한 대체 수행/);
  assert.match(patch, /요구 강도 조정/);
  assert.match(patch, /플레이어가 다음 행동을 선택할 공간/);
  assert.match(patch, /업무 태만·감점·징계 가능성을 알고 감수한 명시적 거부/);
});

test('refusal-cost rule does not silently authorize unrelated exact sexual actions', () => {
  assert.match(patch, /별도의 정확한 성적 행동 권한이 자동 생성되지는 않는다/);
  assert.match(patch, /허용된 대체 행동을 즉시 수행/);
  assert.match(patch, /가짜 예외는 금지한다/);
  assert.doesNotMatch(patch, /treat_refusal_as_dereliction[^\n]{0,100}(?:penetration|oral_sex)/);
});

test('deactivated rule originals are isolated from current Story authority', () => {
  assert.match(patch, /function buildLegacyCsaAftereffectStorySection/);
  assert.match(patch, /function buildCsaAftereffectStorySection/);
  assert.match(patch, /과거 해제 규정의 기억 — 현재 규칙 아님/);
  assert.match(patch, /해제된 규정의 원문·의무·권한·적용 범위를 재현하지 않는다/);
  assert.match(patch, /현재 활성 CSA만 규범과 행동 판단의 권위/);
});

test('aftereffect requires actual experience and excludes integrated or current rules', () => {
  assert.match(patch, /collectCsaIdsFromExperience/);
  assert.match(patch, /experiencedIds\.has\(csaId\)/);
  assert.match(patch, /item\.actual_execution_confirmed === true/);
  assert.match(patch, /item\.phase !== 'integrated'/);
  assert.match(patch, /!activeIds\.has\(csaId\)/);
  assert.match(patch, /\.slice\(0, 3\)/);
});

test('Extract distinguishes denial conscious refusal negotiation and incomplete refusal', () => {
  assert.match(patch, /CSA_RULE_DENIAL_RE/);
  assert.match(patch, /CSA_CONSCIOUS_REFUSAL_RE/);
  assert.match(patch, /CSA_GENERIC_REFUSAL_RE/);
  assert.match(patch, /mode = 'denied'/);
  assert.match(patch, /mode = 'conscious_refusal'/);
  assert.match(patch, /mode = 'negotiate'/);
  assert.match(patch, /mode = 'incomplete'/);
  assert.match(patch, /sanitizeCsaRuleAwarenessProjection/);
});

test('invalid denial cannot be stored as compliant active runtime', () => {
  assert.match(patch, /활성 규정을 부정한 판단은 무효이며 규정 인식 후 재판단 필요/);
  assert.match(patch, /status: 'paused'/);
  assert.match(patch, /규정 부정·가짜 예외 감지/);
  assert.match(patch, /다음 턴에 규정을 인정한 뒤 수행·협상·의식적 위반으로 재판단/);
});

test('newer paused or ended runtime suppresses stale ongoing scene action without magical clothing changes', () => {
  assert.match(patch, /function buildCsaRuntimeSceneReconciliationSection/);
  assert.match(patch, /function sanitizeSavedCsaRuntimeSceneView/);
  assert.match(patch, /\['paused', 'ended'\]\.includes\(runtime\.status\)/);
  assert.match(patch, /이전 CSA 행동은 중단되었으며/);
  assert.match(patch, /복장·자세는 마법처럼 바꾸지 말고/);
  assert.match(patch, /return sanitizeSavedCsaRuntimeSceneView\(sanitizeSavedCsaAffinityView\(view\)\)/);
});

test('generator emits a parseable Worker with no new model database timer random or frontend dependency', () => {
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(patch, /pages\//);

  const build = runBuild();
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /활성 CSA 규정 인식·의식적 위반 계약 — 현재 규칙 최종 권위/);
  assert.match(generated, /function sanitizeCsaRuleAwarenessProjection/);
  assert.match(generated, /function sanitizeSavedCsaRuntimeSceneView/);
  assert.match(generated, /과거 해제 규정의 기억 — 현재 규칙 아님/);
  assert.match(generated, /content: csaRuleAwarenessSection/);

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
