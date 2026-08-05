import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const partsDir = new URL('../worker/build-csa-deactivation-hotfix.parts/', import.meta.url);
const partNames = fs.readdirSync(partsDir).filter(name => name.endsWith('.part')).sort((left, right) => {
  if (left === 'part-07.part') return 1;
  if (right === 'part-07.part') return -1;
  return left.localeCompare(right);
});
const script = partNames.map(name => fs.readFileSync(new URL(name, partsDir), 'utf8')).join('');
const patch = fs.readFileSync(new URL('../worker/build-csa-deactivation-hotfix.parts/part-09.part', import.meta.url), 'utf8');

test('NPC reaction contract separates normalized rules from personal emotion', () => {
  assert.match(script, /\[NPC 복합 반응\]/);
  assert.match(script, /규정 준수와 개인적 수용은 별개다/);
  assert.match(script, /등록 히로인과 일반 NPC 모두/);
  assert.match(script, /최소 두 요소/);
});

test('ambient events stay optional, brief, and inside active CSA scope', () => {
  assert.match(script, /\[가벼운 자율 사건\]/);
  assert.match(script, /사건이 없어도 정상이다/);
  assert.match(script, /한 턴에 최대 하나/);
  assert.match(script, /보통 1~3문장/);
  assert.match(script, /required_action 직접 범위 안에서만/);
});

test('lightweight patch adds no extra model call or random event engine', () => {
  assert.doesNotMatch(patch, /fetch\s*\(/);
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
});

test('reaction and ambient contract is injected before relationship interpretation', () => {
  assert.match(script, /buildNpcReactionAndAmbientEventSection\(\{ mode, activeCsa \}\) \+ relationshipInterpretationSection/);
  assert.ok(partNames.indexOf('part-09.part') < partNames.indexOf('part-07.part'));
});

test('build generator emits parseable Worker with both contracts', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /function buildNpcReactionAndAmbientEventSection/);
  assert.match(generated, /\[NPC 복합 반응\]/);
  assert.match(generated, /\[가벼운 자율 사건\]/);
  assert.match(generated, /buildNpcReactionAndAmbientEventSection\(\{ mode, activeCsa \}\)/);

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
