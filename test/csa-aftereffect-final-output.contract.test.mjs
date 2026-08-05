import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test('final generated aftereffect helper excludes deactivated rule originals and preserves multi-NPC contract', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  const signature = 'function buildCsaAftereffectStorySection(save = {}, characterIds = [], characters = {})';
  const start = generated.indexOf(signature);
  const end = generated.indexOf('function collectCsaRuleAwarenessProjectionText', start);

  assert.ok(start >= 0, 'multi-NPC aftereffect helper missing');
  assert.ok(end > start, 'aftereffect helper end marker missing');

  const helper = generated.slice(start, end);
  assert.doesNotMatch(helper, /canonical_content/);
  assert.match(helper, /experiencedIds\.has\(csaId\)/);
  assert.match(helper, /!activeIds\.has\(csaId\)/);
  assert.match(helper, /item\.actual_execution_confirmed === true/);
  assert.match(helper, /item\.phase !== 'integrated'/);
  assert.match(helper, /해제된 규정의 원문·의무·권한·적용 범위를 재현하지 않는다/);
  assert.match(helper, /현재 활성 CSA만 규범과 행동 판단의 권위/);

  assert.equal(countMatches(generated, /function buildCsaAftereffectStorySection\(save = \{\}, characterIds = \[\], characters = \{\}\)/g), 1);
  assert.equal(countMatches(generated, /buildLegacyCsaAftereffectStorySection\(/g), 1);

  const aftereffectIndex = generated.lastIndexOf('content: csaAftereffectSection');
  const awarenessIndex = generated.lastIndexOf('content: csaRuleAwarenessSection');
  assert.ok(awarenessIndex > aftereffectIndex, 'current active-rule authority must remain after historical aftereffects');

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
