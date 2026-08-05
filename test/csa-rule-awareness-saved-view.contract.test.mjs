import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const patch = fs.readFileSync(new URL('../worker/build-csa-deactivation-hotfix.parts/part-18.part', import.meta.url), 'utf8');

test('saved summaries emotions and runtime cannot preserve fabricated active-rule exceptions', () => {
  assert.match(patch, /function sanitizeSavedRuleDenialText/);
  assert.match(patch, /function sanitizeSavedCsaRuleAwarenessView/);
  assert.match(patch, /recent_summary/);
  assert.match(patch, /story_summary_recent100/);
  assert.match(patch, /npc_emotion/);
  assert.match(patch, /csa_runtime_state/);
  assert.match(patch, /정정: 활성 규정은 실제로 존재하고 현재 적용된다/);
  assert.match(patch, /저장된 규정 부정 판단은 무효이며 활성 규정 인식 후 재판단 필요/);
  assert.match(patch, /status: 'paused'/);
  assert.match(patch, /return sanitizeSavedCsaRuleAwarenessView/);
});

test('saved-view cleanup adds no database call model call timer random or frontend dependency and generated Worker parses', () => {
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(patch, /pages\//);

  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /function sanitizeSavedCsaRuleAwarenessView/);
  assert.match(generated, /return sanitizeSavedCsaRuleAwarenessView/);

  const awarenessIndex = generated.lastIndexOf('content: csaRuleAwarenessSection');
  const aftereffectIndex = generated.lastIndexOf('content: csaAftereffectSection');
  assert.ok(awarenessIndex > aftereffectIndex, 'current active-rule authority must be injected after historical aftereffects');

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
