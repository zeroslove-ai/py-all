#!/usr/bin/env node
// REFERENCE ONLY - DO NOT DEPLOY OR RUN AS THE WORKER BUILD INPUT.
/**
 * GameBuilder v2 Worker patch generator
 *
 * Base:
 * zeroslove-ai/py-all
 * commit 20bca0bd949133223c44173668a98e0950ea19eb
 *
 * Usage:
 *   node make-game-proxy-v2-modified.js
 *
 * Output:
 *   game-proxy-v2.modified.js
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const SOURCE_URL =
  "https://raw.githubusercontent.com/zeroslove-ai/py-all/20bca0bd949133223c44173668a98e0950ea19eb/worker/game-proxy-v2.js";

const OUTPUT_PATH = path.resolve(process.cwd(), "game-proxy-v2.modified.js");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`[${label}] target text not found`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`[${label}] target text occurs more than once`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function insertBeforeOnce(source, marker, insertion, label) {
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(`[${label}] insertion marker not found`);
  }
  if (source.indexOf(marker, index + marker.length) >= 0) {
    throw new Error(`[${label}] insertion marker occurs more than once`);
  }
  return source.slice(0, index) + insertion + source.slice(index);
}

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download source: ${response.status} ${response.statusText}`);
  }

  let source = await response.text();

  // 1) Extract 결과를 받은 직후 등록 캐릭터만 허용한다.
  source = replaceOnce(
    source,
    `  let extract = result.extract;
  let validation = validateNpcEmotion(extract.npc_emotion, extract.character_id);`,
    `  let extract = sanitizeRegisteredExtract(
    result.extract,
    ctx?.master?.characters || {},
    ctx?.save?.last_character_id
  );
  let validation = validateNpcEmotion(extract.npc_emotion, extract.character_id);`,
    "sanitize initial extract"
  );

  // 2) 마인드 모니터 재시도 결과에도 같은 검증을 적용한다.
  source = replaceOnce(
    source,
    `      result = await requestExtractModel(env, retryPrompt);
      extract = result.extract;
      validation = validateNpcEmotion(extract.npc_emotion, extract.character_id);`,
    `      result = await requestExtractModel(env, retryPrompt);
      extract = sanitizeRegisteredExtract(
        result.extract,
        ctx?.master?.characters || {},
        ctx?.save?.last_character_id
      );
      validation = validateNpcEmotion(extract.npc_emotion, extract.character_id);`,
    "sanitize retried extract"
  );

  // 3) commit-turn에서도 클라이언트 extract를 다시 검증한다.
  source = replaceOnce(
    source,
    `  const safeExtract = { ...extract, is_sexual: extract.is_sexual === true };
  safeExtract.image_id = selectImageId(flattenImageCatalog(ctx?.image_catalog || []), safeExtract.character_id, safeExtract.image_id, ctx?.save?.last_image_id, safeExtract.is_sexual);`,
    `  const safeExtract = sanitizeRegisteredExtract(
    { ...extract, is_sexual: extract.is_sexual === true },
    ctx?.master?.characters || {},
    ctx?.save?.last_character_id
  );
  safeExtract.image_id = safeExtract.character_id === 'narrator'
    ? null
    : selectImageId(
        flattenImageCatalog(ctx?.image_catalog || []),
        safeExtract.character_id,
        safeExtract.image_id,
        ctx?.save?.last_image_id,
        safeExtract.is_sexual
      );`,
    "sanitize commit extract"
  );

  // 4) Story 프롬프트에 등록 캐릭터 전용 상호작용 규칙을 상시 포함한다.
  source = replaceOnce(
    source,
    `[대사] NPC 대사는 **캐릭터명** (연기지시): "대사 내용" 형식으로만.
[모니터] 매턴 [1.표면의식]/[2.잠재의식] 각 100~200자, 대화체로 작성.;`,
    `[대사] NPC 대사는 **캐릭터명** (연기지시): "대사 내용" 형식으로만.
[등록 캐릭터 전용] 이름, 개별 대사, 성격, 마인드 모니터, NPC 수치, 이미지와 관계 기록을 가질 수 있는 상호작용 NPC는 master.characters에 등록된 heroine만 허용한다. 등록되지 않은 의사·간호사·환자·보호자·직원은 이름 없는 배경 인물로만 묘사하고, 플레이어에게 먼저 말을 걸거나 선택지 대상·현재 타겟이 될 수 없다. 플레이어가 배경 인물에게 접근하면 장소와 소속에 맞는 등록 히로인이 응대한다. 3병동은 heroine1·2·3·4·9·10, 6병동은 heroine5·6, 의사 중심 장면은 heroine7·8만 사용한다. 외형만 보고 heroine ID를 추측하거나 새 고유 NPC 이름을 만들지 않는다.
[모니터] 매턴 [1.표면의식]/[2.잠재의식] 각 100~200자, 대화체로 작성.;`,
    "story registered-character rule"
  );

  // 5) Extract delta 계약을 보강한다.
  source = replaceOnce(
    source,
    `[NPC STAT DELTA CONTRACT]
npc_stat_changes만 반환한다. 근거가 약하면 0이며 모든 수치를 억지로 바꾸지 않는다. 호감도·신뢰도 delta는 -5~+5(평범한 대화는 보통 -2~+2), 최면깊이는 실제 최면 시도·성공·실패·활성 암시 작동 때만 -5~+5이고 일반 대화는 0, 순응도는 일반 턴 -3~+3·최면 사건 -5~+5, 최면저항력은 항상 delta 0이다. ±4~5는 중요한 전환 사건에만 쓴다. reason은 서사에서 확인되는 근거 한 문장이다.`,
    `[NPC STAT DELTA CONTRACT]
npc_stat_changes만 반환한다. 서사에 숫자가 직접 없어도 현재 턴의 NPC 대사·행동·표정·판단 변화를 근거로 delta를 판단한다. 의미 있는 호의·편안함·자발적인 대화 지속은 호감도 +1~+2, 의심 완화·정직성 확인·도움 수용은 신뢰도 +1~+2, 부탁 수용·명확한 자기합리화·유도에 자연스럽게 따름은 순응도 +1~+3을 우선 검토한다. 무례·불쾌감은 호감도 -1~-2, 거짓말 발각·모순·신분 의심은 신뢰도 -1~-3, 명확한 거부·반발은 순응도 -1~-3을 검토한다. 실제 반응 변화가 명백한데 모든 값을 기계적으로 0으로 반환하지 않는다. 단순 묘사 반복이나 변화 없는 대화는 0이다. 호감도·신뢰도 delta는 -5~+5(평범한 대화는 보통 -2~+2), 최면깊이는 실제 최면 시도·성공·실패·각성·활성 암시 작동 때만 -5~+5이고 일반 대화는 0, 순응도는 일반 턴 -3~+3·최면 사건 -5~+5, 최면저항력은 항상 delta 0이다. ±4~5는 중요한 전환 사건에만 쓴다. reason은 서사에서 확인되는 근거 한 문장이다.`,
    "delta inference contract"
  );

  // 6) 등록 캐릭터 검증 헬퍼를 buildSavePatch 앞에 추가한다.
  const helper = `
function sanitizeRegisteredExtract(extract, characters = {}, previousCharacterId = null) {
  const normalized = normalizeExtract(extract);
  const registeredIds = new Set(Object.keys(isPlainObject(characters) ? characters : {}));
  const registeredNames = new Map();

  for (const [id, character] of Object.entries(isPlainObject(characters) ? characters : {})) {
    const name = character?.name || character?.['이름'];
    if (typeof name === 'string' && name.trim()) {
      registeredNames.set(name.trim(), id);
    }
  }

  const requestedCharacterId =
    typeof normalized.character_id === 'string' ? normalized.character_id.trim() : '';

  let characterId;
  if (registeredIds.has(requestedCharacterId)) {
    characterId = requestedCharacterId;
  } else if (requestedCharacterId === 'narrator') {
    characterId = 'narrator';
  } else if (registeredIds.has(previousCharacterId)) {
    characterId = previousCharacterId;
    console.warn('Unregistered character_id replaced with previous registered character:', {
      requestedCharacterId,
      replacement: characterId
    });
  } else {
    characterId = 'narrator';
    console.warn('Unregistered character_id replaced with narrator:', {
      requestedCharacterId
    });
  }

  normalized.character_id = characterId;
  normalized.npcs_present = Array.isArray(normalized.npcs_present)
    ? [...new Set(normalized.npcs_present.filter(id => registeredIds.has(id)))]
    : [];

  if (characterId !== 'narrator' && !normalized.npcs_present.includes(characterId)) {
    normalized.npcs_present.unshift(characterId);
  }

  normalized.dialogue_lines = Array.isArray(normalized.dialogue_lines)
    ? normalized.dialogue_lines.filter(line => {
        if (!isPlainObject(line) || typeof line.speaker !== 'string') return false;
        return registeredNames.has(line.speaker.trim());
      })
    : [];

  if (characterId === 'narrator') {
    normalized.npc_emotion = {};
    normalized.npc_stat_changes = {};
    normalized.npc_relationship_state = null;
    normalized.image_id = null;
    normalized.is_sexual = false;
  }

  return normalized;
}

`;

  source = insertBeforeOnce(
    source,
    "function buildSavePatch(",
    helper,
    "registered-character helper"
  );

  // 7) 결과 파일 상단에 기준과 수정 설명을 추가한다.
  source = source.replace(
    "// worker.js — 게임빌더_v2 프록시 Worker (동적 프롬프트)",
    `// worker.js — 게임빌더_v2 프록시 Worker (동적 프롬프트)
// Modified from commit 20bca0bd949133223c44173668a98e0950ea19eb
// Added: registered-character hard validation and stronger NPC delta inference`
  );

  await fs.writeFile(OUTPUT_PATH, source, "utf8");

  console.log(`Created: ${OUTPUT_PATH}`);
  console.log(`Bytes: ${Buffer.byteLength(source, "utf8")}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
