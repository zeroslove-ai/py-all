import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const patchPath = new URL('../worker/build-csa-deactivation-hotfix.parts/part-12.part', import.meta.url);
const patch = fs.readFileSync(patchPath, 'utf8');

test('transient NPC physical state expires instead of becoming permanent canon', () => {
  assert.match(patch, /NPC_TRANSIENT_SCENE_STATE_MAX_AGE = 8/);
  assert.match(patch, /function isNpcTransientSceneStateFresh/);
  assert.match(patch, /만료된 일시 상태는 과거 장면 기록일 뿐 현재 확정값이 아니다/);
  assert.match(patch, /상태라 현재 확정값에서 제외/);
});

test('wardrobe CSA deactivation produces covering and dressing recovery', () => {
  assert.match(patch, /function buildCsaWardrobeRecoverySection/);
  assert.match(patch, /공공장소·병원 근무·일반 대화 장면에서는 같은 턴 안에 최소한 유니폼부터 입거나 몸을 가리는 행동을 우선한다/);
  assert.match(patch, /예전 규칙, 습관, 상식수용도, 과거 성적 경험만으로 계속 벗고 있게 하지 않는다/);
  assert.match(patch, /기억상실이 아니라 재평가/);
});

test('current voluntary action is distinct from stale CSA residue', () => {
  assert.match(patch, /NPC_TRANSIENT_SEXUAL_ACTION_RE/);
  assert.match(patch, /진행 중인 현재의 자발적 성적 행동이 명확할 때만/);
  assert.match(patch, /해제된 규칙을 근거로 현재 동의나 성적 참여를 자동 확정하지 않는다/);
});

test('structured NPC state no longer projects stale clothing posture or actions', () => {
  assert.match(patch, /const sceneFresh = isNpcTransientSceneStateFresh/);
  assert.match(patch, /if \(sceneFresh\)/);
  assert.match(patch, /복장 복구 필요/);
  assert.match(patch, /관계·호칭·영구 기억은 지속 상태다/);
});

test('wardrobe recovery patch adds no model call database query frontend timer or randomness', () => {
  assert.doesNotMatch(patch, /fetch\s*\(/);
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(patch, /pages\//);
});

test('generator emits syntax-valid Worker with freshness and recovery authority', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /CURRENT NPC PHYSICAL SCENE STATE — FRESHNESS-AWARE/);
  assert.match(generated, /function buildCsaWardrobeRecoverySection/);
  assert.match(generated, /content: csaWardrobeRecoverySection/);
  assert.match(generated, /NPC_TRANSIENT_SCENE_STATE_MAX_AGE = 8/);
  assert.match(generated, /유니폼\|가리\|여미\|단추\|착의/);
  assert.doesNotMatch(generated, /CURRENT NPC PHYSICAL SCENE STATE — ESTABLISHED FACT/);

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
