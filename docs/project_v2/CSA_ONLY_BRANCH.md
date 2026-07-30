# CSA-only branch

## CSA scope

CSA scope is fixed to hospital-wide. Stored scope values are normalized to
`scope_type=world`, `scope_id=world`, and `scope_label=병원 전체`.
Location data remains available for narrative continuity and NPC tracking, but
it is never used to validate, create, update, deactivate, or apply a CSA.

- Branch: `feature/csa-only`
- Preserved baseline: `archive/pre-csa-only` (`3e9716dd6c424dff8f850102eed76884d4e907fa`)
- The sole app-managed gameplay effect is spatial common-sense alteration (CSA).
- CSA is created, updated, and deactivated only by a signed structured app action.
- Scope is hospital-wide (`world`) at every level, with no ward/floor/building tier. Strength unlocks: Lv.1 weak, Lv.3 medium, Lv.7 strong (fixed ceiling — no tier beyond strong; raised from the earlier Lv.5 per the preset-catalog rebalance). Active-slot count unlocks separately from strength: Lv.1 2 slots, Lv.3 3 slots, Lv.5 4 slots, Lv.10 5 slots (see `getCsaLimits`; `calculateCsaCapability`/`APP_STRENGTH_UNLOCKS` hold the live strength gate).
- CSA expiration or deactivation stops the current norm only; it does not rewrite memories or physical scene state.
- NPC stats are separate: affinity is personal emotional regard for the player; CSA acceptance is only the naturalness and initiative of executing an active CSA's direct meaning; sexual arousal is temporary physical response. No stat implies either of the other two or sexual consent. `성적민감도초기` remains a fixed master-side response trait only; legacy saved `성적민감도` is preserved but ignored by new logic.
- Sexual actions outside a CSA's exact direct scope use an independent gate: current intimacy stage, explicit current consent, active boundaries, recent refusal, and location are required. Affinity, CSA acceptance, arousal, and prior sexual history do not open that gate. CSA-performed events remain factual history but never raise voluntary intimacy stage.
- Deactivating a CSA removes its normality immediately but never deletes memory or restores clothing/position. Confirmed participants progress through `shock → processing → integrated` aftereffects on their own later encounters; this does not itself change affinity or clear boundaries.
- Active CSA direct execution has precedence over the sexual gate. Once actor/target/trigger/duration are satisfied, its exact direct action executes at 100% regardless of acceptance, affinity, arousal, intimacy stage, boundary, refusal, personality, or public setting. Those values only shape the in-scope attitude and presentation; they never refuse or omit the direct CSA action.
- The sexual gate applies only outside an active CSA's exact scope. Story and Commit use the same deterministic decision source for voluntary sexual actions; CSA-direct events are factual history only and never clear boundaries or raise voluntary intimacy stage.
- `romantic_interest` is a non-sexual relationship stage: it is entered from an on-scene NPC's explicit romantic-interest Story evidence and never requires a sexual voluntary roll. `kissed` and later sexual stages still require a successful voluntary decision, action-specific current consent, and an actually completed event.
- An active CSA direct action executes regardless of whether the scene is public. `public_normalization` describes how surrounding people interpret the public setting; it is not an authorization condition for the direct action itself.
- Sexual-event Commit requires both Worker event authorization and action-specific consent evidence on the voluntary path. `last_explicit_consent` remains a this-turn-only audit record, not a future automatic permission.
- An explicit-consent sentence needs action-bound permission, desire, or agreement. A generic positive phrase elsewhere in the same sentence does not authorize the action; explanation, counselling, and questions are not consent.
- Player-input CSA authorization and completed-event CSA authorization are separate. Medical or staff-performed CSA rules never authorize a reverse-direction player action merely because both actions share a broad category.
- Completed CSA events require matching actor group, player target group, and confirmed runtime state. Omission repair only repairs a preset whose current trigger is evidenced; it never creates a physical action merely because an always-active rule exists.
- Explanations, counselling, questions, and sexual terminology discussion are neither sexual action attempts nor CSA request triggers.
- Explicit consent and romantic interest require dialogue or explicit prose attributed to the current NPC; a player quote in a sentence naming that NPC is not NPC consent or interest.
- `on_request` is tied to the preset's direct action or meaning tags, not generic request wording. Custom CSA remains supported only when its explicit action and direction pass the same conservative checks.
- Story continues to return DeepSeek's successful SSE body directly. The synchronous gate helpers make no database, network, or additional model call and do not buffer the stream.
- CSA acceptance never grants general obedience, romance, consent, authority, or success outside an active CSA's direct meaning.
- A positive affinity change requires an independent relationship event in the current turn. CSA execution, bodily response, lack of immediate refusal, or sexual activity alone is not sufficient evidence.
- Legacy mental-effect save keys are **LEGACY STORAGE ONLY — CSA-only 모드에서는 숨김·주입·표시·갱신하지 않음**.
- No database migration is required.

## CSA presets (structured creation)

The CSA app offers two creation modes: **프리셋으로 만들기** (default) and
**직접 작성** (free text, unchanged from before). A preset selection is not
a content-string shortcut — it stores a structured execution contract
alongside `content`, so Story can execute the rule as a real, persistent
action instead of narrating it once and forgetting it.

- Single source of truth: `CSA_PRESET_CATALOG` in `worker/game-proxy-v2.js`
  (~38 items across `약함`/`중간`/`강함`). The frontend never hardcodes
  actor/target/trigger/duration lists — it renders `/api/app-state`'s
  `csa_presets` payload (`actor_options`, `target_options`,
  `trigger_options`, `duration_options`, `categories`, `items`, each item's
  `content_template`).
- `csa_active` entries gain two optional fields: `source_type`
  (`'preset'|'custom'`) and, for presets, `preset` (`template_id`,
  `actor_group`, `target_group`, `trigger`, `duration`, `modifier`,
  `required_action`, `public_normalization`, `persistent`,
  `direct_meaning_tags`). Entries without `preset` (all pre-existing saves)
  keep working exactly as before — `source_type` defaults to `'custom'`.
- The Worker never trusts a client-sent preset `content` string: `/api/app-validate`
  → `planAppTransaction` → `validateCsaPresetOperation` re-derives canonical
  `content` from the catalog's `content_template` and the selected
  actor/target/trigger/duration/modifier, and rejects out-of-catalog
  template/actor/target/trigger/duration combinations. A preset's
  `minimum_strength` is a fixed catalog value — presets never invoke the
  DeepSeek strength classifier (`classifyAppOperationStrengths`) unless
  none is needed at all; a modifier that smuggles in strong-tier explicit
  sexual vocabulary is rejected structurally (`csaPresetModifierExceedsTemplate`,
  no LLM call).
- Story receives a compact per-preset "실행 계약" block (ID/강도/규칙/주체/
  대상/발동/필수 행동/지속/공개성/현재 실행 상태) instead of a bare content
  line — see `buildCsaPresetExecutionBlock`. Custom (non-preset) CSAs keep
  the original one-line format.
- Execution continuity across turns is tracked in a new save field,
  `csa_runtime_state` (keyed by `csa_id`; see `docs/project_v2/SCHEMA.md`),
  fed by a new Extract field `csa_runtime_updates` (see
  `docs/project_v2/EXTRACT_PROMPT.md`). The Worker never trusts an
  out-of-scope `csa_id`/`character_id`; a CSA that stops being an active
  preset is auto-marked `ended` without any Extract input.
- `[PERSISTENT COMMON-SENSE SITUATION]` and `[PUBLIC COMMON-SENSE SCENE]`
  are new top-priority Story blocks (shown whenever any CSA is applicable)
  enforcing multi-turn persistence and hospital-wide public normalization.
  `[CSA WEAK SYNERGY]` is shown whenever 2+ CSAs are applicable, so several
  weak rules compose without auto-escalating strength.
- Bold-choice CSA relevance (`resolveCsaDirectRelevance`) prefers a preset's
  `direct_meaning_tags` over the legacy `CSA_CHOICE_RELEVANCE_TOPICS` regex
  table; the regex table remains the fallback for custom CSAs only. Public
  place / being watched / on-duty wording is never a relevance or
  bold-probability penalty.
- Preset `required_action` omissions are self-reported by Extract into
  `csa_omission` for observability only (logged, never repaired or
  Commit-blocking as of P1's auxiliary-recovery-call removal). See
  `detectPresetRequiredActionOmissions` (deliberately scoped to
  `target_group:'player'` presets, since staff-on-NPC presets depend on a
  trigger judgment that can't be verified structurally).

## CSA-first sexual authorization

- CSA direct는 voluntary gate의 예외가 아니라 먼저 평가되는 독립 경로다.
  유효한 semantic contract의 exact actor/target/action/trigger가 구조화
  Extract 결과와 일치하면 consent, intimacy stage, boundary, refusal,
  random roll을 보지 않고 집행한다.
- CSA 밖의 sexual completion은 default deny다. 현재 NPC의 구조화된
  voluntary consent, stage, boundary, recent refusal, Story 완료 evidence가
  모두 검증될 때만 저장한다. Worker는 한국어 긍정 정규식으로 이를 추측하지 않는다.
- custom CSA는 activate/update의 기존 semantic validation에서
  `semantic_contract`를 받고 서명된 canonical action과 함께 저장한다.
  ambiguous contract는 `CUSTOM_CSA_SEXUAL_SCOPE_AMBIGUOUS`로 거절하며,
  legacy custom은 Story 배경 규칙으로만 남고 sexual direct authorization에는 쓰지 않는다.

## Structured CSA integrity before Commit

- 모든 applicable CSA는 Extract의 `csa_trigger_evaluations`에 정확히 한 번 있어야 한다(`validateCsaTriggerEvaluationSet`). 누락·중복·알 수 없는 ID, `CSA_RUNTIME_NOT_VERIFIED`, `CSA_INTERRUPTION_EVIDENCE_MISSING`, `CSA_CONTRACT_NOT_EXACT`는 `classifyCsaIntegrityIssues`가 soft로 분류해 관찰 로그·`validation_warnings`로만 남기고 Commit을 막지 않는다(P1: 관련 LLM repair 호출 없음, Story 재작성 없음).
- sexual CSA direct 실행은 간이 `route/completed/id` 비교가 아니라 full semantic contract, actor/target, trigger, runtime, Story evidence 검증을 통과해야 한다. 실제 완료된 성적 상태/사건 저장이 CSA_DIRECT 또는 VOLUNTARY authorization 없이 시도될 때만(`SEXUAL_COMPLETION_UNAUTHORIZED` 등 hard 코드, 완료 표시 시의 `CSA_DIRECT_NOT_VERIFIED`) 422로 Commit을 막는다 — 그 외에는 fail-open이다.
- 플레이어의 명시적 요청이나 위생 처리처럼 규범 자체는 유효하지만 이번 턴만 물리적으로 중단된 경우, `csa_trigger_evaluations[].status`는 `satisfied|continuing|temporarily_interrupted|not_satisfied|ended` 중 `temporarily_interrupted`를, `csa_runtime_updates[].status`/저장된 `csa_runtime_state[csaId].status`는 `inactive|active|paused|ended` 중 `paused`를 쓸 수 있다. evidence가 없는 `temporarily_interrupted`나 검증 실패한 optional `csa_runtime_updates` 항목은 `retainValidatedCsaRuntimeUpdates`가 조용히 버리고 경고만 남긴다(Story를 다시 쓰지 않는다). `evidence` 비교(`evidenceExists`)는 개행·연속 공백·전각/반각 따옴표 차이만 흡수하는 문자 정규화(NFKC) 후 원문 substring 비교이며, 의미 기반 추측이나 키워드 매칭은 하지 않는다.
- `csa_runtime_updates`는 매 턴 전체 스냅샷이 아니라 델타다: 이전 턴부터 이미 `active`였고 이번 턴에도 변화가 없으면 중복 update를 생략할 수 있다. 그래서 정합성 검사(`auditStructuredCsaExecution`, `validateCsaDirectResolution`)는 이번 턴 delta만 보지 않고, 저장된 `save.csa_runtime_state`에 이번 delta를 적용한 **effective runtime**(`buildEffectiveCsaRuntimeState`)을 기준으로 판단한다 — 저장된 active가 이번 턴 delta로 변경되지 않았으면 계속 active로 취급한다.
- CSA 메타 인식(NPC가 상식개변/앱/시스템이 자신을 조작한다고 인식하는 서사)은 감지·로그(`csa_meta_awareness_observed`)만 하며, P1부터는 LLM repair나 narrative 재작성을 하지 않는다 — 이미 스트리밍된 Story는 그대로 유지된다.
- 과감 선택지 메타(`last_choice_meta`)가 현재 턴/현재 계약과 맞지 않는 stale 값(다른 턴 `choice_id`, `severity` 누락, `sexual_action:"none"`인데 `kind:"bold"`인 경우 등)이면 `isCurrentChoiceMetaValid`가 이를 거부하고, `/api/context`의 공개 view(`buildCsaOnlyPublicContext`)와 실제 판정(`resolveBoldChoiceAttempt`) 모두 저장된 값 대신 현재 choices/save로 다시 계산한 in-memory 메타를 쓴다 — DB에는 쓰지 않는 표시/판정 전용 재분류다. `severity:"blocked"`는 `kind:"bold"`와 분리된 별도 `kind:"blocked"`이며, bold 확률 굴림 대상이 아니다.

## Player setup — four LLM-driven candidates, no hard gate

`player_setup.recommendations[]`는 최대 4개의 LLM 생성 후보(각각 안정 ID `candidate_1`~`candidate_4`)를 기본 저장 형태로 쓴다. LLM이 병원 직원/환자/병원 연관 외부인/자유 배경으로 겹치지 않는 성인 남성 후보 4명을 한 번에 완성해서 제안하고, `[3. 선택지]`는 실제 후보 이름·직업을 담은 "번호. 이름 · 직업" 네 줄이 기본이다. Worker는 카드 문장·필드 순서·선택지 문구 exact match를 검증하지 않으며(`PLAYER_SETUP_CANDIDATES_INVALID`는 없음), 일부 후보의 필드 누락이나 4개 미만 생성도 턴을 막지 않는다(`normalizeSetupCandidates`가 있는 만큼만 최대 4개 보존).

`parseSetupCandidateSelection()`이 자유 입력 전체에서 번호(`1`, `①`, `1번`, `후보 1`, `첫 번째` 등)를 찾는다 — exact string만 허용하지 않는다. 같은 입력에 수정 요청이 함께 있어도("4번으로 선택하되 배경만 의사로 바꿔줘") 번호를 인식하고, `resolveSetupApproval()`이 "아직 시작하지 말고"/"다시 보여줘" 같은 명시적 보류 문구(`hold_setup`)가 없는 한 번호 선택을 즉시 선택+오프닝으로 취급한다(별도 승인 문구 불필요). 승인 시 `mergePlayerProfile(선택된 후보, extract.player_patch || extract.player_recommendation)`로 같은 입력의 수정값만 반영해 `player_setup.selected_id`/`selected_profile`을 확정한다. Extract JSON 파싱/업스트림 실패가 나도 setup 턴은 이전에 저장된 후보를 보존한 채 HTTP 200 degraded 응답으로 fail-open한다 — 하드 실패로 게임을 막지 않는다. 옛 단일-추천 저장(`player_setup.recommendation`/`selected_profile`)은 `resolveSetupRecommendations()`가 길이-1 배열로 읽기 전용 호환만 하며, 새 게임·새 턴은 그 형태를 절대 다시 만들지 않는다.

## Streaming-first engineering priority

게임빌더 v2는 규칙 엔진이 중심인 전통 게임이 아니라 LLM Story 스트리밍 게임이다.

우선순위:
1. `/api/story` SSE 스트리밍과 사용자가 본 서사 보존
2. 게임 진행 연속성
3. Extract 기반 상태 저장
4. 형식 검증

LLM이 자연스럽게 처리할 수 있는 서사 형식, 플레이어 설정 추천, 선택지 문구, 카드 표현을 Worker의 hard gate로 검증하지 않는다. 이들 품질 문제는 warning 또는 best-effort fallback으로 처리하며 이미 스트리밍된 Story를 폐기하거나 Commit을 차단하지 않는다.

Hard failure는 중복 Commit, turn mismatch, 잘못된 structured transaction, DB 저장 실패, 권한 없는 성적 완료 상태 저장처럼 실제 무결성·권한 문제가 있는 경우에만 사용한다.
