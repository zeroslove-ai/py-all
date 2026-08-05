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
const patch = fs.readFileSync(new URL('../worker/build-csa-deactivation-hotfix.parts/part-10.part', import.meta.url), 'utf8');

test('aftereffect patch recognizes female registered staff without a literal gender field', () => {
  assert.match(patch, /hasFemaleEvidence/);
  assert.match(patch, /character\?\.\['컵'\]/);
  assert.match(patch, /actorGroup === 'female_staff'/);
});

test('deactivation contract preserves event memory and rejects memory-gap evidence', () => {
  assert.match(patch, /CSA_AFTEREFFECT_MEMORY_GAP_RE/);
  assert.match(patch, /기억은 나지만 왜 그게 당연했는지 이해되지 않는다/);
  assert.match(patch, /if \(CSA_AFTEREFFECT_MEMORY_GAP_RE\.test\(block\)\) return false/);
});

test('choice extraction requires a real heading and numbered actions', () => {
  assert.match(patch, /if \(!heading\) return \[\]/);
  assert.match(patch, /\[1-4\]\[\.\)\]/);
  assert.doesNotMatch(patch, /\[1-4\]\[\.\)\]\|\[-\*•\]/);
  assert.match(patch, /isChoiceDirectiveLeak/);
});

test('choice repair clears structured metadata and invalidates sexual fallback metadata', () => {
  assert.match(patch, /choicesRepaired \|\| choicesFallbackUsed/);
  assert.match(patch, /extract\.choice_structured_meta = \[\]/);
  assert.match(patch, /SAFE_FALLBACK_CHOICE_TEXTS/);
  assert.match(patch, /meta\.sexual_action/);
});

test('Story output prompt forbids meta instruction leakage', () => {
  assert.match(patch, /\[출력 메타 지시문 금지 — 최종\]/);
  assert.match(patch, /buildStoryOutputLeakGuardSection\(\)/);
  assert.match(patch, /상식 목록·상황판 항목을 선택지로 복사하지 않는다/);
});

test('generator emits a parseable Worker containing the hardened contracts', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /CSA_AFTEREFFECT_MEMORY_GAP_RE/);
  assert.match(generated, /CHOICE_DIRECTIVE_LEAK_RE/);
  assert.match(generated, /buildStoryOutputLeakGuardSection/);
  assert.match(generated, /extract\.choice_structured_meta = \[\]/);

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
