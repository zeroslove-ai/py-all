import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const partPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-22.part', import.meta.url);
const generatedPath = new URL('../worker/game-proxy-v2.generated.js', import.meta.url);
const part = fs.readFileSync(partPath, 'utf8');
let generatedCache = null;

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

test('part 22 adds no model database timer random or frontend dependency', () => {
  assert.doesNotMatch(part, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(part, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(part, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(part, /pages\//);
});

test('affinity delta trusts Extract LLM and only clamps to minus five plus five', () => {
  const generated = generatedWorker();
  assert.match(generated, /acceptedAffinityDelta = Math\.max\(-5, Math\.min\(5, Number\(affinityChange\.delta\) \|\| 0\)\)/);
  assert.doesNotMatch(generated, /resolveAffinityEvidenceAllowance\(reason, priorArousal/);
  assert.doesNotMatch(generated, /가벼운 칭찬에 대한 작은 호의/);
  assert.doesNotMatch(generated, /신체 반응·CSA 수행과 분리된 관계 행동 근거가 없음/);
});

test('new choice metadata never exposes bold probability', () => {
  const generated = generatedWorker();
  assert.match(generated, /function buildChoiceMetaLegacy/);
  assert.match(generated, /function buildChoiceMeta\(choices = \[\]/);
  assert.match(generated, /meta\.kind !== 'bold'/);
  assert.match(generated, /kind: 'free_action'/);
  assert.match(generated, /success_rate: null/);
});

test('stored bold metadata is invalidated and no bold roll executes', () => {
  const generated = generatedWorker();
  assert.match(generated, /choiceMeta\.some\(meta => isPlainObject\(meta\) && meta\.kind === 'bold'\)/);
  assert.match(generated, /function resolveBoldChoiceAttempt\(save = \{\}, master = \{\}, playerInput = '', gameId = '', turnNumber = 0\) \{\s*return null;\s*\}/);
});

test('choice prompt no longer forces extreme or probability options', () => {
  const generated = generatedWorker();
  assert.match(generated, /never force an extreme, reckless, humiliating, violent, or low-probability option merely for variety/);
  assert.match(generated, /never display a success percentage/);
  assert.match(generated, /All four may be ordinary choices/);
});

test('physical state prompt remains compact and present-NPC only', () => {
  const generated = generatedWorker();
  assert.match(generated, /이 블록에는 현재 등장 NPC만 포함한다/);
  assert.match(generated, /이름·현재 복장·현재 자세만 짧게 사용한다/);
  assert.doesNotMatch(generated, /모든 NPC의 기본 프로필 전체를 매 턴 반복/);
});

test('clothing CSA forbids invented exceptions without blocking save', () => {
  const generated = generatedWorker();
  assert.match(generated, /회진·체면·관행·외부인·업무 이동을 임의 예외로 만들지 않는다/);
  assert.match(generated, /규정을 정확히 알고, 위반임을 인정하고, 구체적 이유와 불이익 감수/);
  assert.match(generated, /저장 실패나 서사 실패를 만들지 않는다/);
  assert.match(generated, /저장된 구조화 복장 상태를 자동으로 뒤집지 않는다/);
});

test('active sex requires minimum vocal reactions and short dialogue', () => {
  const generated = generatedWorker();
  assert.match(generated, /일반 삽입은 장면 전체에 독립적인 신음·끊어진 숨·짧은 감각 반응을 최소 2회/);
  assert.match(generated, /빠르거나 깊은 삽입은 최소 3회/);
  assert.match(generated, /절정 직전·절정은 최소 4회/);
  assert.match(generated, /완성된 장문 설명은 최대 1회만 허용/);
  assert.match(generated, /흥분도가 높을수록 말보다 신음·호흡·신체 반응의 비중을 높인다/);
});

test('generated Worker syntax is valid', () => {
  generatedWorker();
  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(generatedPath)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
