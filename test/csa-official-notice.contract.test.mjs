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
const patch = fs.readFileSync(new URL('../worker/build-csa-deactivation-hotfix.parts/part-13.part', import.meta.url), 'utf8');

test('CSA official notice runs only for structured CSA change transactions', () => {
  assert.match(patch, /function buildCsaOfficialNoticeSection/);
  assert.match(patch, /canonical_action\?\.type !== 'app_transaction'/);
  assert.match(patch, /operation\?\.domain === 'csa'/);
  assert.match(patch, /\['activate', 'update', 'deactivate'\]/);
  assert.match(patch, /일반 진행 턴마다 방송이나 문자 내용을 반복하지 않는다/);
});

test('all hospital notice channels fire as one compact announcement burst', () => {
  assert.match(patch, /병원 전체 방송/);
  assert.match(patch, /사내 메신저/);
  assert.match(patch, /업무용 컴퓨터 팝업/);
  assert.match(patch, /병원 TV 안내/);
  assert.match(patch, /직원 휴대전화 문자/);
  assert.match(patch, /한 번의 짧고 강한 공지 장면으로 묶고/);
});

test('only strong CSA changes use national-law framing', () => {
  assert.match(patch, /strength === 'strong'/);
  assert.match(patch, /국가 법령·보건당국 의무 지침/);
  assert.match(patch, /서울중앙병원 공식 운영 지침/);
  assert.match(patch, /강함 규정만 국가 법령 또는 보건당국 의무 지침으로 표현한다/);
  assert.match(patch, /약함·중간은[^\n]+서울중앙병원 공식 운영 지침/);
});

test('notice scope is fixed to the whole hospital and reactions use acceptance', () => {
  assert.match(patch, /모든 상식개변 공지는 병원 전체 적용으로 전달한다/);
  assert.match(patch, /현재 장면의 등록 NPC 전원과 주변 직원은 공지를 인지/);
  assert.match(patch, /상식수용도 0~19/);
  assert.match(patch, /상식수용도 80~100/);
  assert.match(patch, /낮은 상식수용도는 표정·말투·준비 속도와 최소 수행 방식만 바꾸며/);
});

test('deactivation notice preserves memory and requires physical cleanup', () => {
  assert.match(patch, /해제 공지는 해당 의무가 끝났음을 즉시 이해시키지만 기억과 현재 물리 상태를 삭제하지 않는다/);
  assert.match(patch, /몸을 가리기, 옷 입기, 자세 풀기, 거리 두기/);
  assert.match(patch, /추가 복종·성행위·연애·동의·관계 상승을 허가하지 않는다/);
});

test('official notice patch adds no model call database query timer random or frontend dependency', () => {
  assert.doesNotMatch(patch, /requestDeepSeek|attemptDeepSeek|chat\/completions/);
  assert.doesNotMatch(patch, /supabaseRpc|supabaseGet|supabasePost|fetch\s*\(/);
  assert.doesNotMatch(patch, /Math\.random|setInterval|setTimeout/);
  assert.doesNotMatch(patch, /pages\//);
});

test('build generator emits parseable Worker with official notice as final Story authority', () => {
  const build = spawnSync(process.execPath, ['worker/build-csa-deactivation-hotfix.mjs'], {
    cwd: fileURLToPath(repoRoot),
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const generatedPath = fileURLToPath(new URL('../worker/game-proxy-v2.generated.js', import.meta.url));
  const generated = fs.readFileSync(generatedPath, 'utf8');
  assert.match(generated, /function buildCsaOfficialNoticeSection/);
  assert.match(generated, /const csaOfficialNoticeSection = buildCsaOfficialNoticeSection/);
  assert.match(generated, /content: csaOfficialNoticeSection/);
  assert.match(generated, /국가 법령·보건당국 의무 지침/);
  assert.match(generated, /병원 전체 방송/);
  assert.ok(partNames.indexOf('part-13.part') < partNames.indexOf('part-07.part'));

  const syntax = spawnSync(process.execPath, ['--check', generatedPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
});
