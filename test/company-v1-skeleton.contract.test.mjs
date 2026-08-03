import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = (...parts) => path.join(root, ...parts);
const read = (...parts) => fs.readFileSync(resolve(...parts), 'utf8');
const readJson = (...parts) => JSON.parse(read(...parts));
const importFile = filePath => import(pathToFileURL(filePath).href);

const requiredFiles = [
  'apps/company-v1/api/src/index.js',
  'apps/company-v1/api/src/edition.js',
  'apps/company-v1/api/wrangler.jsonc',
  'apps/company-v1/frontend/pages/index.html',
  'apps/company-v1/frontend/pages/app.js',
  'apps/company-v1/frontend/wrangler.jsonc',
  'packages/game-core/package.json',
  'packages/game-core/src/index.js',
  'packages/game-core/src/edition.js',
  'packages/game-core/src/errors.js',
  'content/company-v1/edition.json',
  'content/company-v1/organization.json',
  'content/company-v1/map.json',
  'content/company-v1/characters.json',
  'content/company-v1/general_npcs.json',
  'content/company-v1/csa_presets.json',
  'test/company-v1-skeleton.contract.test.mjs'
];

test('all Phase 0 files exist', () => {
  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(resolve(file)), true, file);
  }
});

test('Worker names and content identity are fixed', () => {
  const apiConfig = readJson('apps/company-v1/api/wrangler.jsonc');
  const frontendConfig = readJson('apps/company-v1/frontend/wrangler.jsonc');
  const edition = readJson('content/company-v1/edition.json');
  const organization = readJson('content/company-v1/organization.json');

  assert.equal(apiConfig.name, 'game-proxy-company-v1');
  assert.equal(frontendConfig.name, 'gamebuilder-company-v1');
  assert.equal(edition.edition_id, 'company-v1');
  assert.equal(edition.content_version, '0.0.1-skeleton');
  assert.equal(organization.company.name, '루미너스 브랜드 그룹');
});

test('content skeleton JSON files parse', () => {
  for (const file of [
    'content/company-v1/edition.json',
    'content/company-v1/organization.json',
    'content/company-v1/map.json',
    'content/company-v1/characters.json',
    'content/company-v1/general_npcs.json',
    'content/company-v1/csa_presets.json'
  ]) {
    assert.doesNotThrow(() => readJson(file), file);
  }
});

test('edition adapter uses the shared core validator', async () => {
  const apiEdition = read('apps/company-v1/api/src/edition.js');
  assert.match(apiEdition, /packages\/game-core\/src\/index\.js/);

  const { createEditionAdapter, GameCoreError } = await importFile(resolve('packages/game-core/src/index.js'));
  const valid = createEditionAdapter({
    editionId: 'company-v1',
    contentVersion: '0.0.1-skeleton',
    organization: {},
    map: {},
    characters: {},
    generalNpcs: {},
    csaPresets: {}
  });

  assert.equal(valid.editionId, 'company-v1');
  assert.throws(
    () => createEditionAdapter({ editionId: '', contentVersion: '0.0.1-skeleton' }),
    GameCoreError
  );
});

test('implementation paths exclude prohibited dependencies and patch generators', () => {
  const implementationFiles = requiredFiles.filter((file) =>
    file.startsWith('apps/company-v1/') ||
    file.startsWith('packages/game-core/') ||
    file.startsWith('content/company-v1/')
  );
  const forbidden = [
    'supabase',
    'deepseek',
    'tts',
    'replaceOnce',
    'replaceRegex',
    'part-*.part',
    'generated.js',
    'game-proxy-v2',
    'gamebuilder-v2',
    'game-builder-v2',
    'ovltkzwddxsekcfeskds',
    'hospital',
    'nurse',
    'doctor',
    'patient',
    '병원',
    '간호사',
    '의사',
    '환자'
  ];

  for (const file of implementationFiles) {
    const source = read(file).toLowerCase();
    for (const token of forbidden) {
      assert.equal(source.includes(token.toLowerCase()), false, `${file} contains ${token}`);
    }
  }
});

test('API entry returns static status responses without outbound calls', async () => {
  const apiEntry = read('apps/company-v1/api/src/index.js');
  assert.match(apiEntry, /async fetch\(request\)/);
  assert.doesNotMatch(apiEntry, /await fetch\(|globalThis\.fetch\(|fetch\(["']http/);

  const { default: worker } = await importFile(resolve('apps/company-v1/api/src/index.js'));
  for (const pathname of ['/health', '/api/version']) {
    const response = await worker.fetch(new Request(`https://example.test${pathname}`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      edition_id: 'company-v1',
      phase: 'phase-0-skeleton',
      content_version: '0.0.1-skeleton'
    });
  }

  const missing = await worker.fetch(new Request('https://example.test/missing'));
  assert.equal(missing.status, 404);
});

test('frontend presents the company skeleton state', () => {
  const html = read('apps/company-v1/frontend/pages/index.html');
  assert.match(html, /상식개변 앱 — 회사편 v1/);
  assert.match(html, /Phase 0 skeleton/);
  assert.match(read('apps/company-v1/frontend/pages/app.js'), /edition-status/);
});
