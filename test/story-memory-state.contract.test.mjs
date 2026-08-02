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
const patch = fs.readFileSync(new URL('../worker/build-csa-deactivation-hotfix.parts/part-11.part', import.meta.url), 'utf8');

test('story summaries retain up to 3000 characters by complete summary lines', () => {
  assert.match(script, /function appendSummary\(previous, addition, limit = 3000\)/);
  assert.match(script, /entries\.length - 1/);
  assert.match(script, /return kept\.join\('\\n'\)/);
  assert.match(script, /story_summary_recent100\(3000자\)/);
  assert.match(script, /story_summary_overall\(3000자\)/);
  assert.doesNotMatch(script, /function appendSummary\(previous, addition, limit = 1000\)/);
});

test('relevant NPC generator removes the arbitrary four-person cap from the deploy artifact', () => {
  assert.match(patch, /remove arbitrary four-NPC cap from relevant NPC selection/);
  assert.match(patch, /'return ordered;'/);
  assert.match(script, /임의의 인원 수 제한으로 뒤쪽 인물을 생략하지 않는다/);
});

test('structured state block includes relationship address location emotion scene and memories', () => {
  assert.match(script, /\[관련 NPC 구조화 상태 — 현재 저장값\]/);
  assert.match(script, /현재 개인 관계/);
  assert.match(script, /관계 진행 단계/);
  assert.match(script, /플레이어 호칭/);
  assert.match(script, /현재 위치/);
  assert.match(script, /표면 인식/);
  assert.match(script, /내면 인식/);
  assert.match(script, /현재 복장/);
  assert.match(script, /현재 행동/);
  assert.match(script, /영구 기억/);
  assert.match(script, /최근 중요 기억/);
});

test('memory and state patch adds no extra model call database query or frontend dependency', () => {
  assert.doesNotMatch(patch, /fetch\s*\(/);
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost/);
  assert.doesNotMatch(patch, /pages\//);
});

test('build generator emits a parseable Worker with final structured-state injection', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /function appendSummary\(previous, addition, limit = 3000\)/);
  assert.match(generated, /function buildRelevantNpcStructuredStateSection/);
  assert.match(generated, /content: relevantNpcStructuredStateSection/);
  assert.match(generated, /return ordered;/);
  assert.doesNotMatch(generated, /return ordered\.slice\(0, 4\);/);
  assert.ok(partNames.indexOf('part-11.part') < partNames.indexOf('part-07.part'));

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
