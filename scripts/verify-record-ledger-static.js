// Deterministic source audit only.  It makes no network, API, game, or DB call.
import fs from 'node:fs';
const worker = fs.readFileSync('worker/game-proxy-v2.js', 'utf8');
const index = fs.readFileSync('pages/index.html', 'utf8');
const ui = fs.readFileSync('pages/ui.js', 'utf8');

const requiredWorker = [
  'function applySexualRecordLedger',
  'function normalizeSexualRecordEvents',
  'function resolveCurrentTurnPlayerAddressRequests',
  'function buildCurrentTurnPlayerAddressRequestSection',
  'actor_type',
  'new Response(deepseekRes.body',
  'stream: true'
];
for (const needle of requiredWorker) {
  if (!worker.includes(needle)) throw new Error(`missing worker invariant: ${needle}`);
}
if (/function applySexualRecordCounters[\s\S]{0,1800}Math\.min\(10/.test(worker)) {
  throw new Error('factual ledger still caps relationship counters at 10');
}
if (/function prepareMedia[\s\S]{0,900}setLoading\(/.test(index)) {
  throw new Error('media loading still controls chat loading state');
}
if (!index.includes("ui.setLoading(true, '상태 분석 중', { lockInput: false })")) {
  throw new Error('extract phase no longer keeps draft editable');
}
if (!ui.includes('if (!this._resizeHandler)')) {
  throw new Error('ui init may duplicate resize handlers');
}
console.log('STATIC_RECORD_LEDGER_OK');
