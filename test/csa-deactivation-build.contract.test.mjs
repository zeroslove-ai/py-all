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
const wrangler = fs.readFileSync(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8');

test('build generator defines schema-v2 global aftereffects', () => {
  assert.match(script, /CSA_AFTEREFFECT_SCHEMA_VERSION = 2/);
  assert.match(script, /CSA_AFTEREFFECT_GLOBAL_KEY = '__global'/);
  assert.match(script, /buildCsaAftereffectEffectiveSave/);
});

test('phase progression requires final Story reaction evidence', () => {
  assert.match(script, /storyHasCsaAftereffectReactionEvidence/);
  assert.match(script, /reaction_evidence_turns/);
  assert.match(script, /strength === '강함'\) return 3/);
  assert.match(script, /legacy auto progression removed/);
});

test('Story contract is late-authoritative and streaming-first is asserted', () => {
  assert.match(script, /CSA DEACTIVATION AFTEREFFECT — LATE AUTHORITATIVE FACT/);
  assert.match(script, /new Response\(deepseekRes\.body/);
  assert.match(script, /stream: true/);
});

test('Wrangler deploy uses deterministic generated entry point', () => {
  const config = JSON.parse(wrangler);
  assert.equal(config.main, './game-proxy-v2.generated.js');
  assert.equal(config.build.command, 'node ./build-csa-deactivation-hotfix.mjs');
  assert.equal(config.build.cwd, 'worker');
});

test('generator converts file URL to a native OS path', () => {
  assert.match(script, /import \{ fileURLToPath \} from 'node:url'/);
  assert.match(script, /const generatedWorkerPath = fileURLToPath\(outputPath\)/);
  assert.doesNotMatch(script, /outputPath\.pathname/);
});

test('current-scene address prompt stays compact and present-NPC only', () => {
  assert.match(script, /inject compact present-NPC nurse and player addresses/);
  assert.match(script, /\[현재 장면 호칭\]/);
  assert.match(script, /presentIds\.length > 1/);
  assert.match(script, /currentAddress \|\| savedAddress \|\| masterAddress/);
  assert.match(script, /lines\.join\(' \/ '\)/);
});

test('nurse address derivation respects rank explicit seniority and age', () => {
  assert.match(script, /resolveNurseToNurseAddress/);
  assert.match(script, /hasExplicitNurseSeniority/);
  assert.match(script, /resolveCharacterAge/);
  assert.match(script, /return targetName \+ ' 선생님'/);
  assert.match(script, /return '선배님'/);
  assert.match(script, /resolveNpcGivenName\(targetName\) \+ '쌤'/);
  assert.doesNotMatch(script, /resolveNpcGivenName\(targetName\) \+ '씨'/);
});

test('explicit persistent player-address requests bypass Extract omission', () => {
  assert.match(script, /resolveDeterministicNpcPlayerAddressUpdates/);
  assert.match(script, /resolveCurrentTurnPlayerAddressRequests\(input/);
  assert.match(script, /for \(const update of deterministic\) merged\.set/);
  assert.match(script, /item\.scope === 'persistent'/);
});

test('worker output finalizer runs after all mutation parts', () => {
  assert.equal(partNames.at(-1), 'part-07.part');
  assert.ok(partNames.indexOf('part-08.part') < partNames.indexOf('part-07.part'));
});

test('build generator executes and emitted Worker parses', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /\[현재 장면 호칭\]/);
  assert.match(generated, /resolveNurseToNurseAddress/);
  assert.match(generated, /return '선배님'/);
  assert.match(generated, /targetName \+ ' 선생님'/);
  assert.match(generated, /resolveNpcGivenName\(targetName\) \+ '쌤'/);
  assert.match(generated, /resolveDeterministicNpcPlayerAddressUpdates/);
  assert.doesNotMatch(generated, /HOSPITAL ADDRESS MATRIX — ESTABLISHED FACT/);
  assert.doesNotMatch(generated, /resolveNpcGivenName\(targetName\) \+ '씨'/);

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
