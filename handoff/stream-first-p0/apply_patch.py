#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
from pathlib import Path

BASE_SHA = "5c18e161622e4ceb27d502b48933d411004a14bd"
ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
WORKER = ROOT / "worker" / "game-proxy-v2.js"


def fail(message: str) -> None:
    raise SystemExit(f"PATCH_ABORTED: {message}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one literal match, found {count}")
    return text.replace(old, new, 1)


def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        fail(f"{label}: expected exactly one regex match, found {count}")
    return updated


head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
if head != BASE_SHA:
    fail(f"BASE_SHA_MISMATCH expected={BASE_SHA} actual={head}")

status = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True)
if status.strip():
    fail("DIRTY_WORKTREE")

text = WORKER.read_text(encoding="utf-8")

text = replace_regex_once(
    text,
    r'''function resolveCsaAppUiRoute\(input, characters = \{\}\) \{.*?\n\}''',
    r'''function normalizeExplicitAppCommand(input = '') {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?。！？]+$/g, '')
    .trim()
    .toLowerCase();
}

function resolveCsaAppUiRoute(input) {
  const command = normalizeExplicitAppCommand(input);
  if (!command) return null;

  if (['/app', '/앱', '상식개변 앱 열기', '상식개변 어플 열기'].includes(command)) {
    return { tab: 'home', character_id: null, notice: '상식개변 앱을 엽니다.' };
  }
  if (['/app help', '/앱 도움말', '상식개변 앱 사용법', '상식개변 앱 매뉴얼'].includes(command)) {
    return { tab: 'manual', character_id: null, notice: '상식개변 앱 매뉴얼을 엽니다.' };
  }
  return null;
}''',
    "explicit app route only",
)

text = replace_regex_once(
    text,
    r'''// A degraded turn must never silently no-op an app-mutating player request.*?\n\}\n\n// Everything that would otherwise create or change persistent state is''',
    r'''// A degraded turn preserves the streamed narrative and advances the turn while
// omitting optional state changes. Only a validated structured app transaction
// remains fail-closed because it intentionally mutates persistent app state.

// Everything that would otherwise create or change persistent state is''',
    "remove degraded first-encounter gateway",
)

text = replace_once(
    text,
    "    player_recommendation: null,\n    player_recommendations: [],\n",
    "    player_recommendation: null,\n",
    "remove degraded player_recommendations",
)
text = replace_once(
    text,
    "  if (!isPlainObject(normalized.player_recommendation)) normalized.player_recommendation = null;\n  if (!Array.isArray(normalized.player_recommendations)) normalized.player_recommendations = [];\n",
    "  if (!isPlainObject(normalized.player_recommendation)) normalized.player_recommendation = null;\n",
    "remove normalized player_recommendations",
)

new_failure_block = r'''  // Streaming-first: once Story has streamed, Extract failure is non-fatal
  // unless this is a validated structured app transaction. Optional state is
  // omitted and the narrative is committed with a deterministic degraded extract.
  const recoveryBudget = createRecoveryBudget();
  const isStructuredAppTransaction = structuredPlan?.canonical_action?.type === 'app_transaction';
  const degradedAllowed = !isStructuredAppTransaction;

  const firstPass = await performExtractionPass(env, {
    narrativeText: narrative_text, playerInput: player_input, compatCtx: effectiveCtx, shortlistedImages, nextTurn, requestId,
    recoveryBudget, maxAttempts: degradedAllowed ? 1 : 2, structuredPlan
  });
  Object.assign(timing, firstPass.timing);
  if (!firstPass.ok) {
    if (!degradedAllowed) {
      return { body: firstPass.response, status: firstPass.status };
    }

    const degradedReason = firstPass.response?.error_code || 'EXTRACT_FAILED';
    const narrativeChoices = extractChoicesFromNarrative(narrative_text);
    let degradedExtract = buildDegradedExtract(narrative_text, degradedReason);

    if (!isSetupComplete(compatCtx.save)) {
      degradedExtract = normalizeExtract({
        ...degradedExtract,
        character_id: 'narrator',
        npcs_present: [],
        dialogue_lines: [],
        player_recommendation: null,
        choices: narrativeChoices.slice(0, 4),
        csa_runtime_updates: [],
        sexual_events: [],
        relationship_events: [],
        sexual_resolution: { action: 'none', route: 'none', completed: false }
      });
    } else if (structuredPlan?.canonical_action?.type === 'find_npc' && structuredPlan.plan) {
      const target = structuredPlan.plan;
      degradedExtract = normalizeExtract({
        ...degradedExtract,
        character_id: target.character_id,
        npcs_present: [target.character_id],
        world_state_patch: { ...target.target_world_state }
      });
    }

    timing.total_ms = Date.now() - totalStart;
    console.warn(JSON.stringify({
      event: 'extract_degraded_fail_open',
      endpoint: '/api/extract',
      request_id: requestId,
      game_id,
      turn_number: nextTurn,
      reason: degradedReason,
      setup_turn: !isSetupComplete(compatCtx.save),
      structured_action_type: structuredPlan?.canonical_action?.type || null
    }));

    return {
      body: {
        extract: degradedExtract,
        extract_degraded: true,
        extract_degraded_reason: degradedReason,
        narrative_replacement: null,
        request_id: requestId,
        raw: '',
        mind_monitor_retried: false,
        mind_monitor_errors: [],
        choices_repaired: false,
        choices_fallback_used: narrativeChoices.length === 0,
        first_encounter_repaired: false,
        json_repaired: false,
        content_addition: null,
        validation_warnings: [],
        choice_validation_warnings: [],
        csa_meta_awareness_detected: false,
        csa_meta_awareness_repaired: false,
        csa_meta_awareness_fields: [],
        recovery_used: recoveryBudget.used,
        recovery_kind: recoveryBudget.kind,
        timing
      },
      status: 200
    };
  }

  let { extract,'''
text = replace_regex_once(
    text,
    r'''  // H2: caps this turn.*?\n  let \{ extract,''',
    new_failure_block,
    "unified extract fail-open",
)

text = replace_once(
    text,
    "  if (isSetupComplete(compatCtx.save)\n    && (extract.sexual_resolution?.action !== 'none' || extract.sexual_resolution?.completed === true)) {\n",
    "  const hasPersistedSexualCompletion = extract.sexual_resolution?.completed === true\n    || (Array.isArray(extract.sexual_events)\n      && extract.sexual_events.some(event => sexualActionForEventType(event?.type) !== 'none'));\n  if (isSetupComplete(compatCtx.save) && hasPersistedSexualCompletion) {\n",
    "completed-only sexual hard gate",
)

text = replace_regex_once(
    text,
    r'''function isApprovalInput\(input = ''\) \{.*?\n\}''',
    r'''function isApprovalInput(input = '') {
  const raw = String(input || '').trim();
  if (['①', '1'].includes(raw)) return true;
  const normalized = raw
    .replace(/^\s*(?:①|1[.)]?)\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?。！？]+$/g, '')
    .trim();
  const phrases = new Set([
    '추천 설정으로 시작', '추천 설정으로 시작한다',
    '이 설정으로 시작', '이 설정으로 시작한다',
    '이걸로 시작', '이걸로 시작한다',
    '이대로 시작', '이대로 시작한다',
    '이 캐릭터로 시작', '이 캐릭터로 시작한다',
    '이 프로필로 시작', '이 프로필로 시작한다',
    '시작', '시작해', '시작하자', '게임 시작'
  ]);
  return phrases.has(normalized);
}''',
    "approval phrases",
)

text = replace_once(
    text,
    "  const age = isIntegerInRange(value.age, [MIN_ADULT_AGE, MAX_ADULT_AGE]);\n  if (age !== null) result.age = age;\n  const heightCm = isIntegerInRange(value.height_cm, PLAYER_HEIGHT_RANGE_CM);\n  if (heightCm !== null) result.height_cm = heightCm;\n  const weightKg = isIntegerInRange(value.weight_kg, PLAYER_WEIGHT_RANGE_KG);\n  if (weightKg !== null) result.weight_kg = weightKg;\n  const penisLengthCm = isIntegerInRange(value.penis_length_cm, PLAYER_PENIS_LENGTH_RANGE_CM);\n  if (penisLengthCm !== null) result.penis_length_cm = penisLengthCm;\n",
    "  const age = normalizePositiveInteger(value.age, { min: MIN_ADULT_AGE });\n  if (age !== null) result.age = age;\n  const heightCm = normalizePositiveInteger(value.height_cm);\n  if (heightCm !== null) result.height_cm = heightCm;\n  const weightKg = normalizePositiveInteger(value.weight_kg);\n  if (weightKg !== null) result.weight_kg = weightKg;\n  const penisLengthCm = normalizePositiveInteger(value.penis_length_cm);\n  if (penisLengthCm !== null) result.penis_length_cm = penisLengthCm;\n",
    "basic player numeric normalization",
)
text = replace_regex_once(
    text,
    r'''const MIN_ADULT_AGE = 19;.*?function buildDefaultPlayerSetupChoices\(\) \{\n  return \[\.\.\.PLAYER_SETUP_CHOICES\];\n\}''',
    r'''const MIN_ADULT_AGE = 19;

function normalizePositiveInteger(value, { min = 1 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  return rounded >= min ? rounded : null;
}

// Player setup never depends on choices. The free-text input remains usable
// even when the LLM omits [3. 선택지] entirely.
function buildDefaultPlayerSetupChoices() {
  return [];
}''',
    "remove fixed setup choices and upper bounds",
)

text = replace_regex_once(
    text,
    r'''function buildPlayerSetupGenerationSection\(\) \{.*?\n\}\n\n// Same no-placeholder''',
    r'''function buildPlayerSetupGenerationSection() {
  return `\n\n[PLAYER SETUP — SINGLE RECOMMENDATION, LLM-DRIVEN]\n이 단계는 플레이어 캐릭터 한 명을 정하는 짧은 준비 단계다. 병원 장면이나 등록 NPC 조우는 아직 시작하지 않는다.\n- 상식개변 앱을 2~4문장으로 짧게 소개한 뒤 병원 세계관에 자연스럽게 들어갈 성인 남성 플레이어 한 명을 완성해서 제안한다.\n- 이름, 나이, 성별, 직업, 전공/직급, 신체 정보, 외형, 성격, 말투, 배경, 시작 장소, 플레이 특징은 자연스럽게 정한다. 일부 항목이 빠져도 게임을 멈추거나 사과하지 않는다.\n- 사용자가 조건을 말하면 그 조건을 우선해 전체 프로필을 다시 제안한다. 항목을 하나씩 질문하거나 결정을 다음 턴으로 미루지 않는다.\n- [3. 선택지]는 생략할 수 있다. 편의를 위해 넣는다면 짧은 승인 또는 수정 선택지만 제공하며, 자유 입력은 항상 허용한다.\n- 사용자가 설정을 명확히 승인하기 전에는 병원 첫 장면과 NPC 조우를 시작하지 않는다.`;
}

// Same no-placeholder''',
    "single recommendation generation prompt",
)
text = replace_regex_once(
    text,
    r'''function buildPlayerSetupRedisplaySection\(recommendation = \{\}, playerInput = ''\) \{.*?\n\}\n\n// Applies broadly''',
    r'''function buildPlayerSetupRedisplaySection(recommendation = {}, playerInput = '') {
  const profile = normalizePlayerProfile(recommendation);
  const details = buildPlayerProfileDetailLines(profile).join('\n');
  return `\n\n[PLAYER SETUP — CURRENT RECOMMENDATION]\n\n현재 저장된 추천:\n${details || '(아직 저장된 세부 추천이 없음)'}\n\n이번 사용자 입력:\n${String(playerInput || '').slice(0, 1500)}\n\n규칙:\n- 사용자가 변경할 내용을 말했다면 현재 추천을 기준으로 요청을 반영한 전체 프로필을 다시 제시한다.\n- 사용자가 원하는 캐릭터를 직접 설명했다면 명시한 값을 우선하고 빠진 값만 자연스럽게 보완한다.\n- 구체적인 변경이 없더라도 질문으로 멈추지 말고 현재 추천을 자연스럽게 다시 제시한다.\n- [3. 선택지]는 생략할 수 있으며 자유 입력은 항상 허용한다.\n- 설정 승인 전에는 병원 장면과 NPC 조우를 시작하지 않는다.`;
}

// Applies broadly''',
    "single recommendation redisplay prompt",
)
text = replace_regex_once(
    text,
    r'''function buildPlayerSetupOnlyStoryPrompt\(playerInput = ''\) \{.*?\n\}\n\nfunction buildPlayerSetupOnlyExtractPrompt''',
    r'''function buildPlayerSetupOnlyStoryPrompt(playerInput = '') {
  const input = typeof playerInput === 'string' && playerInput.trim() ? playerInput.trim() : '(없음)';
  return {
    mode: 'player_setup',
    messages: [
      {
        role: 'system',
        content: `Create only the initial player setup for a hospital common-sense-change app. Briefly introduce the app, then propose one complete adult male player character. Respect concrete user conditions. Do not start hospital gameplay, create NPC scenes, relationships, sexual actions, or CSA effects. Do not ask a sequence of questions and do not postpone the recommendation.

Use [1. 서사 및 행동] and [2. 플레이어 상황판]. [3. 선택지] is optional; free-text input is always valid. Include natural values when useful: name, age, gender, job, major/rank, body details, appearance, personality, speech style, background, starting location, and a short play feature. Missing optional fields are acceptable and are never an error.

Player input: ${input}`
      },
      { role: 'user', content: 'Generate or revise the single player recommendation now.' }
    ]
  };
}

function buildPlayerSetupOnlyExtractPrompt''',
    "lightweight setup story prompt",
)
text = replace_once(
    text,
    "- Copy the narrative's [3. 선택지] lines into choices as-is.\n",
    "- If [3. 선택지] exists, copy its lines into choices as-is. If absent, use an empty array.\n",
    "optional setup extract choices",
)
text = replace_regex_once(
    text,
    r'''  const playerSetupReminder = mode === 'player_setup'\n    \? `.*?`\n    : '';''',
    r'''  const playerSetupReminder = mode === 'player_setup'
    ? `

[REMINDER — PLAYER SETUP PHASE]
지금 이 응답 안에서 완성형 플레이어 캐릭터 한 명을 즉시 제안하거나, 저장된 추천을 기준으로 사용자 요청을 반영해 다시 제안한다. 항목별 질문으로 멈추지 않는다. [3. 선택지]는 생략할 수 있고 자유 입력은 항상 허용한다.
`
    : '';''',
    "setup reminder choices optional",
)

WORKER.write_text(text, encoding="utf-8")

files = {
    ROOT / "AGENTS.md": '''# 게임빌더 v2 개발 원칙\n\n1. 이 프로젝트는 규칙 엔진 중심 게임이 아니라 LLM 인터랙티브 서사 게임이다.\n2. `/api/story` SSE 스트리밍과 사용자가 이미 본 Story 보존이 최우선이다.\n3. 자연어 형식, 선택지 개수·문구, 카드 표현, 마인드 모니터 품질, 선택적 Extract 필드 누락은 runtime hard failure가 아니다.\n4. Extract는 Story에서 저장 가능한 값을 best-effort로 옮긴다. 없는 값은 patch에서 생략하거나 이전 값을 유지한다.\n5. 추가 LLM repair 호출, post-stream Story 재작성, 새 integrity gateway를 임의로 추가하지 않는다.\n6. 전체 턴을 막을 수 있는 조건은 `docs/project_v2/HARD_GATE_ALLOWLIST.md`에 명시된 항목뿐이다.\n7. `stream:true`와 `new Response(deepseekRes.body, ...)` SSE passthrough를 유지한다.\n8. 사용자 명시 없이 Story/Extract/Commit/Reset을 호출해 기능 테스트하거나 게임 데이터를 변경하지 않는다.\n9. Codex/Claude Code는 제공된 패치를 적용·정적 검사·커밋·푸시·배포만 하며 설계를 확장하지 않는다.\n''',
    ROOT / "worker" / "AGENTS.md": '''# Worker 전용 규칙\n\n- Story가 스트리밍된 뒤에는 DB 저장 불가, turn conflict, 잘못된 structured app transaction, 권한 없는 실제 완료 상태 저장이 아니면 HTTP 200 fail-open으로 진행한다.\n- 자유 입력 자연어를 키워드 정규식으로 앱 명령으로 가로채지 않는다. 앱 라우팅은 명시적 명령 또는 검증된 structured action만 허용한다.\n- Extract 실패는 일반 턴·플레이어 설정 생성·수정·승인 모두 degraded Commit으로 이어진다.\n- 미완료 시도·거절·중단·대화는 완료 상태 검증 422 사유가 아니다.\n- 선택적 상태가 불명확하면 상태 patch를 버리고 Story를 저장한다.\n- 추가 baseline/recovery LLM 호출이나 narrative replacement 경로를 만들지 않는다.\n- `/api/commit-turn`의 순번·동일 턴 충돌·원자적 저장은 유지한다.\n''',
    ROOT / "docs" / "project_v2" / "STREAM_FIRST_ARCHITECTURE.md": '''# Streaming-first architecture\n\n## 우선순위\n1. Story SSE 스트리밍\n2. 이미 표시된 Story 보존과 다음 턴 진행\n3. Extract 기반 부가 상태 저장\n4. 출력 형식과 품질 검증\n\n## 처리 원칙\n- Story는 사용자에게 표시되는 게임 본체다. Extract는 저장 보조 계층이다.\n- Extract가 실패하면 일반 턴은 narrative-only degraded Commit을 수행한다. NPC 수치, 관계, 이미지, CSA runtime 등 선택 상태는 이전 값을 유지한다.\n- 플레이어 설정은 단일 LLM 추천과 자유 입력 수정으로 끝나는 준비 단계다. 선택지는 선택 사항이다.\n- Worker는 자연어의 표현 차이를 다시 판정하거나 Story를 사후 교체하지 않는다.\n- 앱 상태 변경은 검증된 structured action으로만 수행한다. 자유 입력은 Story로 전달한다.\n\n## 금지 구조\n- 카드/선택지 exact match 422\n- 선택 필드 누락 422\n- 일반 Extract 실패 422\n- 첫 만남 수치 누락 때문에 Story 폐기\n- 미완료 행동 때문에 완료 상태 검증 422\n- 자연어 키워드 조합만으로 APP_UI_REQUIRED 반환\n''',
    ROOT / "docs" / "project_v2" / "HARD_GATE_ALLOWLIST.md": '''# Runtime hard gate allowlist\n\n다음 항목만 전체 턴을 중단할 수 있다.\n\n1. Supabase context/commit 자체가 불가능함\n2. turn number가 현재 저장 상태와 불일치함\n3. 같은 turn number에 다른 content가 들어오는 충돌\n4. structured app transaction의 validation proof, 범위, 레벨, 슬롯, ID가 유효하지 않음\n5. 존재하지 않거나 비활성화된 CSA를 실제 저장 상태에서 변경하려 함\n6. 실제 완료된 성적 상태/event를 저장하려 하지만 CSA_DIRECT 또는 VOLUNTARY authorization이 없음\n7. DB transaction 실패\n\n아래 항목은 hard gate가 아니다.\n\n- Story/Extract 형식 차이\n- 선택지 누락·개수·문구 차이\n- 플레이어 설정 필드 일부 누락\n- 마인드 모니터 품질 문제\n- first encounter 수치 누락\n- CSA runtime 관찰·evidence·evaluation 누락\n- 미완료 시도, 거절, 중단, 대화\n- 이미지·TTS·상태 패널용 데이터 누락\n''',
}
for path, content in files.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        fail(f"refusing to overwrite existing new contract file: {path.relative_to(ROOT)}")
    path.write_text(content, encoding="utf-8")

print("PATCH_APPLIED")
