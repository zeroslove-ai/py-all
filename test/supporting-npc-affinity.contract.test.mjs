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
const patch = fs.readFileSync(new URL('../worker/build-csa-deactivation-hotfix.parts/part-14.part', import.meta.url), 'utf8');

const runBuild = () => spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
  cwd: fileURLToPath(repoRoot),
  encoding: 'utf8'
});

test('recurring supporting NPC catalog stays lightweight', () => {
  assert.match(patch, /supporting_npc:shin_doyoon/);
  assert.match(patch, /supporting_npc:jung_taehoon/);
  assert.match(patch, /정태훈/);
  assert.match(patch, /김지은의 남편·병원 방문객/);
  assert.match(patch, /김지은과 오래된 섹스리스 부부/);
  assert.match(patch, /관전 상황 자체에 강하게 흥분/);
  assert.match(patch, /플레이어 호감·충성·복종이 아니/);
  assert.match(patch, /자동 등장하지 않는다/);
});

test('unregistered staff can be resolved by explicit gender and role', () => {
  assert.match(patch, /SUPPORTING_MALE_STAFF_RE/);
  assert.match(patch, /SUPPORTING_FEMALE_STAFF_RE/);
  assert.match(patch, /function collectPresentSupportingNpcProfiles/);
  assert.match(patch, /hospital_staff/);
  assert.match(patch, /male_staff/);
  assert.match(patch, /female_staff/);
  assert.match(patch, /성별이 불명확한 일반 NPC를 남성 직원이나 여성 직원으로 임의 추정하지 않는다/);
});

test('current player input is ephemeral context rather than saved game data', () => {
  assert.match(patch, /__current_player_input: resolvedPlayerInput/);
  assert.match(patch, /__current_player_input: player_input/);
  assert.doesNotMatch(patch, /patch\.__current_player_input|statePatch.*__current_player_input/);
});

test('supporting NPC participates in structured CSA matching without heroine state', () => {
  assert.match(patch, /type: 'supporting_npc'/);
  assert.match(patch, /supportingNpcId/);
  assert.match(patch, /structuredParticipantMatches\(participants\.actor, actorId, presentIds, save\)/);
  assert.match(patch, /resolvePlayerInitiatedAuthorityMatch\(\{ csa, contract, master, save, targetId, presentIds \}\)/);
  assert.match(patch, /npc_stats, npc_emotion, npc_relationship_state, 이미지, TTS 기준 character_id, 영구 히로인 ID를 만들지 않는다/);
  assert.match(patch, /npcs_present나 영구 관계 저장 대상이 아니다/);
});

test('Story receives a final CSA compliance versus affinity firewall', () => {
  assert.match(patch, /CSA 수행과 플레이어 호감 완전 분리/);
  assert.match(patch, /해야 하니 한다/);
  assert.match(patch, /상식수용도는 규정 수행의 자연스러움·속도·적극성만 조절/);
  assert.match(patch, /호감도 0~19/);
  assert.match(patch, /호감도 20~39/);
  assert.match(patch, /최근 요약·기억·직전 npc_emotion/);
  assert.match(patch, /content: csaAffinitySeparationSection/);
});

test('Extract rejects CSA-derived affinity and low-affinity romance deterministically', () => {
  assert.match(patch, /function sanitizeCsaAffinityProjection/);
  assert.match(patch, /CSA_FALSE_AFFINITY_EVIDENCE_RE/);
  assert.match(patch, /INDEPENDENT_AFFINITY_EVIDENCE_RE/);
  assert.match(patch, /acceptedAffinityDelta = 0/);
  assert.match(patch, /상식개변·업무 수행·성적 반응은 플레이어 호감 상승의 독립 근거가 아님/);
  assert.match(patch, /if \(emotion\.state === 'dependent'\) emotion\.state = 'accepting'/);
  assert.match(patch, /sanitizeCsaAffinityProjection\(normalizeExtract\(result\.parsed\)/);
});

test('supporting NPC and affinity patch adds no extra model call database query timer random or frontend dependency', () => {
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(patch, /pages\//);
});

test('part order keeps supporting patch before final export patch', () => {
  assert.ok(partNames.includes('part-14.part'));
  assert.ok(partNames.indexOf('part-14.part') < partNames.indexOf('part-07.part'));
});

test('generator emits parseable Worker with supporting NPC and affinity protections', () => {
  const build = runBuild();
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /supporting_npc:shin_doyoon/);
  assert.match(generated, /supporting_npc:jung_taehoon/);
  assert.match(generated, /function collectPresentSupportingNpcProfiles/);
  assert.match(generated, /function sanitizeCsaAffinityProjection/);
  assert.match(generated, /content: supportingNpcCsaSection/);
  assert.match(generated, /content: csaAffinitySeparationSection/);
  assert.match(generated, /상식개변·업무 수행·성적 반응은 플레이어 호감 상승의 독립 근거가 아님/);

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
