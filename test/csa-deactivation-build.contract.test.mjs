import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const partsDir = new URL('../worker/build-csa-deactivation-hotfix.parts/', import.meta.url);
const script = fs.readdirSync(partsDir).filter(name => name.endsWith('.part')).sort()
  .map(name => fs.readFileSync(new URL(name, partsDir), 'utf8')).join('');
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
