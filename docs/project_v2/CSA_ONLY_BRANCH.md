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
  (~68 items across `약함`/`중간`/`강함`, including the expand-CSA-participants
  additions). The frontend never hardcodes actor/target/trigger/duration
  lists — it renders `/api/app-state`'s `csa_presets` payload
  (`actor_options`, `target_options`, `trigger_options`, `duration_options`,
  `categories`, `items`, each item's `content_template`).
- Actor/target options now include `player` (an independent actor
  regardless of job — never assumed to be a patient), `conversation_partner`,
  `another_present_person`, and `nearby_person`, plus the existing role IDs.
  Reusable matrices (`CSA_PRESET_ANY_PERSON_ACTORS/TARGETS`,
  `CSA_PRESET_STAFF_TARGETS`, `CSA_PRESET_PUBLIC_USER_ACTORS`) back most new
  presets instead of ad hoc per-preset lists. `resolveCsaParticipants()` is
  the single resolver (used by the semantic contract, Story instructions,
  choice-route classification, and selected-choice resolution) that turns
  actor_group/target_group into concrete, distinct people — a registered
  NPC, the player, or (only for patient/guardian/visitor/nearby_person, only
  in a plausible public location, at most one per turn) a transient,
  non-persisted anonymous minor NPC. Counterpart-contact presets never
  resolve the same concrete person as both actor and target.
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
- Choice execution route is `csa_direct > voluntary > bold > blocked`
  (`resolveChoiceExecutionRoute`/`resolveCsaDirectCoverage`), and exact CSA
  coverage is now authoritative rather than a probability bonus: a choice is
  `csa_direct` only when its core-action text matches an applicable CSA's
  `direct_meaning_tags`/relevance at the `direct` tier, its actor/target
  resolve to concrete distinct participants right now
  (`resolveCsaParticipants`), and it contains no detected sexual action the
  CSA doesn't itself authorize. `buildChoiceMeta` checks this before ever
  calling `calculateBoldChoiceRate`, so a covered choice gets
  `kind:'csa_direct'`, `success_rate:null`, no random roll, and
  `resolveBoldChoiceAttempt()` never rolls for it. A choice bundling a
  covered action with an uncovered one (e.g. "유니폼을 확인하고 키스한다")
  is never wholly `csa_direct` — it falls through to ordinary severity
  classification keyed on the uncovered action instead. A stored
  `kind:'bold'` choice meta is invalidated and recomputed
  (`isCurrentChoiceMetaValid`'s optional `{save, master}` context) once an
  active CSA newly covers it. The frontend (`pages/ui.js`) shows
  `🌀 상식개변 직접 실행 · {선택지}` for `csa_direct`, checked before the
  bold badge, with no success-rate text.
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

## CSA instant-norm / physical continuity

상식과 판단은 즉시 바뀌지만 물질과 현재 물리 상태는 자동으로 바뀌지 않는다. `buildCsaPhysicalTransitionSection()`이 적용 가능한 CSA가 있거나 이번 턴이 구조화 `app_transaction`일 때 Story 프롬프트 끝부분(recency-favored 위치)에 주입되어, 속옷·의복이 저절로 사라지거나 유니폼이 스스로 조여지거나 규칙/앱이 NPC 몸을 물리적으로 붙잡는 서술을 금지한다 — NPC는 새 규범을 즉시 당연하게 받아들이지만, 복장·자세는 실제 완료된 신체 동작을 통해서만 바뀐다. `buildCsaDirectExecutionPrioritySection`의 100% 직접 실행 보장은 그대로 유지되며, 그 실행이 순간이동이 아니라 실제 동작으로 일어난다는 제약만 추가된다.

`app_transaction` Story 섹션(`buildStructuredActionStorySection`)은 조작이 "이미 적용된 확정 사실"임을 명시하고, `update`는 기존 규범이 이 순간 완전히 소멸하고 새 규범만 유효함을 별도로 강조한다(두 버전을 동시 대안으로 제시하거나 재확인을 구하지 않음). 같은 섹션이 `app_transaction` 턴의 `[3. 선택지]`를 적용 이후 실제 행동 4개로 제한하고 확인/취소/재선택/서서히 적용/앱 재오픈 선택지를 금지한다. `app_transaction` 턴의 user 메시지도 원본 플레이어 입력 대신 "위 Worker 확정 상식개변 결과가 이미 적용된 현재 장면을 진행한다"는 중립 지시로 대체된다(`buildStoryPrompt`).

Extract는 `npc_scene_state_evidence`(DB에 저장되지 않는 transient 필드)를 캐릭터 단위가 아니라 **필드 단위**로 반환한다: `{heroine1: {"clothing.uniform_top": "...", "posture": "...", ...}}`처럼 실제로 바뀐 필드마다 그 필드만의 근거 인용을 넣는다(레거시 캐릭터-단위 문자열도 그 캐릭터의 변경 필드가 정확히 1개일 때만 허용). `runExtractPipeline`의 `retainEvidencedNpcSceneStatePatch()`가 `npc_scene_state_patch`의 각 필드를 이전 저장값(`save.npc_scene_state`)과 비교해 실제로 바뀐 필드만 골라내고, 필드마다 독립적으로 검증한다: `evidenceExists()`로 Story 부분 문자열인지, `CSA_MAGICAL_PHYSICAL_TRANSITION_PATTERN`으로 규범/시스템이 몸을 대신 바꿨다는 표현이 아닌지, `CSA_PLANNING_ONLY_EVIDENCE_PATTERN`으로 "벗어야겠다"처럼 완료되지 않은 계획일 뿐인지, `evidenceIdentifiesCharacter()`로 그 근거가 실제로 해당 NPC를 가리키는지. 한 필드의 근거로 다른 필드를 승인하지 않으며, 거부된 필드만 버리고(이전 저장값 유지) 유효한 형제 필드와 캐릭터의 나머지 상태는 그대로 저장한다. 거부는 `{event: "csa_physical_transition_rejected", character_id, fields, reasons}` 형태로 필드 단위 경고 로그만 남기고, 턴 전체를 422/500으로 실패시키지 않는다.

NPC는 상식개변의 존재·작동 원리·시점 변화를 절대 인식하지 않는다("상식개변", 앱/시스템이 시켰다는 인식, "플레이어가 규칙을 바꿨다"는 인식, "원래는 달랐지만 지금은"이라는 비교, 외부에 조종당한다는 인식 모두 금지 — 병원 규정·근무 수칙·절차·관행·예절 같은 세계 내부 언어는 허용). `buildNpcCsaEpistemicFirewallSection()`이 Story 프롬프트의 `messages` 배열에서 user 메시지 뒤에 오는 별도의 최종 system 메시지로 주입되어(적용 가능한 CSA가 있거나 이번 턴이 `app_transaction`일 때) 생성 직전 가장 가까운 지시가 된다. 같은 위반을 구조화 필드에서도 막는다: `validateNpcEmotion(emotion, characterId, forbidCsaMetaAwareness)`의 3번째 인자가 `true`면 `npc_emotion`의 surface/inner/physical_reaction마다 `detectCsaMetaAwareness()`로 개별 검증해 위반 필드만 `resolveMindMonitorDegradedFallback()`으로 교체하고(정상 형제 필드 유지), `filterCsaMetaAwareDialogue()`가 위반이 있는 NPC 대사만 `dialogue_lines`(TTS 목록)에서 제거하며(플레이어 대사는 이미 `filterMainNpcDialogue()` 단계에서 제외됨), `sanitizeCsaMetaAwarenessFromRelationshipMemory()`/`applyCsaMetaFallbackToTurnSummary()`가 relationship_memory_patch·turn_summary에서 위반 문장만 결정론적으로 제거한다. post-stream Story 재작성이나 repair LLM은 복구하지 않는다(P1 유지).

## Player setup — four LLM-driven candidates, no hard gate

`player_setup.recommendations[]`는 최대 4개의 LLM 생성 후보(각각 안정 ID `candidate_1`~`candidate_4`)를 기본 저장 형태로 쓴다. LLM이 병원 직원/환자/병원 연관 외부인/자유 배경으로 겹치지 않는 성인 남성 후보 4명을 한 번에 완성해서 제안하고, `[3. 선택지]`는 실제 후보 이름·직업을 담은 "번호. 이름 · 직업" 네 줄이 기본이다. Worker는 카드 문장·필드 순서·선택지 문구 exact match를 여전히 검증하지 않지만(`PLAYER_SETUP_CANDIDATES_INVALID`는 없음, 422 없음), `isCompleteSetupCandidateSet()`(4개 전원이 `isCompleteSetupCandidate`: name/age/gender/job/height_cm/weight_kg/penis_length_cm/style/personality/speech_style/background/starting_location/short_feature|play_hook/choice_label 전부 보유)을 통과한 새 세트만 저장된 `player_setup.recommendations`를 교체한다 — 불완전한 새 세트는 조용히 버려지고 기존 정상 세트가 있으면 그대로 유지, 없으면 `player_setup` 자체를 이번 턴에 쓰지 않아 다음 setup 응답이 4후보를 처음부터 다시 생성하게 한다(`buildSavePatch`).

버튼 선택 메타데이터(`player_action = {source, choice_index, choice_text}`)가 `/api/story`·`/api/extract`·`/api/commit-turn` 요청 본문 모두에 실려 온다. `resolveSetupSelection()`이 공통 우선순위로 판정한다: 1) `source==='choice_button'`이고 `choice_index`가 저장 후보 배열의 유효 인덱스면 그 후보를 즉시 선택, 2) `choice_text`가 후보의 `choice_label` 또는 `이름 · 직업`과 일치하면 그 후보 선택, 3) 둘 다 없으면 `parseSetupCandidateSelection()`으로 자유 입력 전체에서 번호(`1`, `①`, `1번`, `후보 1`, `첫 번째` 등)를 찾는다. `buildStoryPrompt`의 mode 판정, `buildExtractPrompt`/`performExtractionPass`/`runExtractPipeline`의 setup 분기, `buildSavePatch`의 확정 로직이 모두 `resolveSetupApproval()` 하나만 호출해 같은 결과를 얻는다. 같은 입력에 수정 요청이 함께 있어도("4번으로 선택하되 배경만 의사로 바꿔줘") 번호/버튼을 먼저 인식하고, "아직 시작하지 말고"/"다시 보여줘" 같은 명시적 보류 문구(`hold_setup`)가 없는 한 즉시 선택+오프닝으로 취급한다(별도 승인 문구 불필요). 승인 시 `mergePlayerProfile(선택된 후보, extract.player_patch || extract.player_recommendation)`로 같은 입력의 수정값만 반영해 `player_setup.selected_id`/`selected_profile`을 확정한다. Extract JSON 파싱/업스트림 실패가 나도 setup 턴은 이전에 저장된 후보를 보존한 채 HTTP 200 degraded 응답으로 fail-open한다 — 하드 실패로 게임을 막지 않는다. 옛 단일-추천 저장(`player_setup.recommendation`/`selected_profile`)은 `resolveSetupRecommendations()`가 길이-1 배열로 읽기 전용 호환만 하며, 새 게임·새 턴은 그 형태를 절대 다시 만들지 않는다.

## Streaming-first engineering priority

게임빌더 v2는 규칙 엔진이 중심인 전통 게임이 아니라 LLM Story 스트리밍 게임이다.

우선순위:
1. `/api/story` SSE 스트리밍과 사용자가 본 서사 보존
2. 게임 진행 연속성
3. Extract 기반 상태 저장
4. 형식 검증

LLM이 자연스럽게 처리할 수 있는 서사 형식, 플레이어 설정 추천, 선택지 문구, 카드 표현을 Worker의 hard gate로 검증하지 않는다. 이들 품질 문제는 warning 또는 best-effort fallback으로 처리하며 이미 스트리밍된 Story를 폐기하거나 Commit을 차단하지 않는다.

Hard failure는 중복 Commit, turn mismatch, 잘못된 structured transaction, DB 저장 실패, 권한 없는 성적 완료 상태 저장처럼 실제 무결성·권한 문제가 있는 경우에만 사용한다.

## NPC canon enforcement (author-only dossier)

`buildCurrentNpcProfileSection`은 `save.last_character_id` 하나만 읽는 기존 단일 프로필 절이며 그대로 유지된다. 같은 턴 초점 전환이나 복수 등장 NPC를 지원하기 위해 `buildAuthorNpcCanonDossier(characterId, character)`가 별도로 master의 실제 값만(추론·placeholder 없음) 담은 프롬프트 전용 요약을 만든다 — 이름/나이/소속/직책/성격/말투/외형/신체 치수/체형/컵/연애 상태/과거 남성 경험 수/과거 오르가즘 경험 수/유두·유륜·음모 상태/선호/작가 전용 숨은 동기/신음 타입(master 우선, `VOCAL_STYLE_BY_NAME` fallback)을 포함한다. `buildNpcPrivateInfo()`(플레이어 앱 은밀정보 해금 게이트)는 별개 관심사로 변경하지 않았다 — author 지식과 player 해금 상태는 분리된 개념이다.

`resolveRelevantNpcCanonIds({playerInput, playerAction, save, characters})`가 (1) 이번 입력에 정확히 언급된 등록 NPC 이름, (2) 선택된 `player_action.choice_text` 내 정확한 이름, (3) `save.last_character_id`, (4) `save.last_npcs_present` 저장 순서 순으로 최대 4명까지 중복 없이 고른다 — master 객체 순서에 의존하지 않는다. `buildRelevantNpcCanonSection(...)`이 이 dossier들을 CSA epistemic firewall 뒤, user 메시지 이후 별도 system 메시지로 주입해(recency 우선) canon이 최근 서사·요약·선택지·일반 플레이어 주장보다 우선하도록 하고, 직접 질문에는 정확한 canonical 값으로 답하되 매 턴 전체 항목을 나열하지 않으며, 각 NPC는 자기 자신의 사실만 안다는 규칙을 명시한다. 두 번째 Story 호출이나 스트림 이후 재작성은 없다.

`npc_emotion.surface/inner`, `turn_summary`, `relationship_memory_patch`에 대해 `detectNpcCanonConflict(character, text)`/`removeCanonConflictSentences(text, character)`가 canonical 필드와 직접 모순되는 경우만(0 경험 vs 경험 주장, 양수 경험 vs 무경험 주장, 숫자 불일치, 기혼 vs 미혼, 미혼 vs 가상 배우자) 좁게 감지한다 — 기존 `applyCsaMetaFallbackToTurnSummary`류와 동일한 fail-open, narrow-contradiction-only 구조를 재사용하며, 위반 필드/문장/항목만 제거하고 정상 형제는 보존한다. repair LLM이나 Story 재작성은 없으며, 로그는 `{event:"npc_canon_conflict", character_id, fields}`만 남긴다(원문 은밀 텍스트 없음).

## Progression EXP rebalance

레벨업 요구 경험치가 `CSA_LEVEL_EXP_REQUIREMENTS = {1:15,2:23,3:50,4:63,5:75,6:105,7:120,8:135,9:150}` 고정 테이블로 바뀌었다(`expForNextLevel`). 기존 레벨/EXP를 낮추거나 저장된 `next_level_exp`를 신뢰하지 않으며, `calculateCsaCapability`를 통해 모든 read 경로(수동 상태줄, `buildAppStatePayload`, player-info, choice-meta 계산)가 항상 이 테이블에서 다시 계산한 값을 쓴다. 레벨 10은 `next_level_exp: 0`이다.

## CSA-direct sexual choice classification (turn-127 핫픽스)

성적 CSA-direct coverage(`resolveCsaDirectCoverage`)는 이제 두 갈래로 나뉜다. 선택지 텍스트에서 정확한 성적 행동(oral/genital_touch/sexual_touch/kiss/penetration/genital_exposure, 우선순위 penetration > oral > genital_touch > sexual_touch > kiss > exposure)이 감지되면, `direct_meaning_tags`/content 키워드 관련성은 더 이상 사용하지 않고 `resolveSexualCsaDirectCoverage`가 semantic contract만으로 판정한다 — `sexual_authorization===true`, `direct_execution===true`, 해당 행동(및 선택지에 함께 감지된 다른 모든 성적 행동 타입)이 `actions`에 포함, 해석된 actor/target 방향이 `directions`와 일치, participant가 지금 실제로 해석되어야 한다. 이전에는 비성적 CSA의 설명용 태그(예: "만족")가 선택지 문구에 우연히 등장하면, 분류기가 그 문장의 실제 성적 행동을 놓쳤을 때 그 비성적 CSA가 잘못 커버로 채택될 수 있었다(사고 원인). `hasMaterialSexualChoiceSignal()`은 정확한 분류기가 행동을 특정하지 못했더라도 성적 신체 부위 + 근접 물리 동작 신호가 함께 있으면 비성적/일반 CSA가 그 선택지를 대신 채가지 못하도록 차단하는 보수적 안전망이며, 그 자체로 csa_direct를 부여하지는 않는다. 비성적 선택지(감지된 행동 없음, 백스톱도 미발동)만 기존 태그/정규식 관련성 경로(`resolveNonsexualCsaDirectCoverage`)를 그대로 사용한다.

`isCurrentChoiceMetaValid`는 이제 저장된 `kind:"csa_direct"` 메타도 매번 현재 save/master로 다시 계산해 `csa_id`/`template_id`/`sexual_action`/`actor_group`/`target_group`을 비교한다 — 하나라도 불일치하면 무효화되어 호출자가 `buildChoiceMeta`로 새로 계산한다. 이는 Supabase에 아무것도 쓰지 않고 다음 `/api/context` 읽기에서 오래된/잘못된 csa_direct 메타를 즉시 복구한다.

## Extract 구조화 선택지 메타 — execution_contract 공유 (2026-08-01)

한국어 정규식 분류기는 더 이상 authoritative가 아니다 — 이제 legacy fallback(구조화 메타가 전혀 없는 저장본, 예: turn 127)과 안전 veto(구조화 메타가 none이어도 텍스트에 명백한 성적 신체 신호가 있으면 비성적 CSA가 채가지 못하게 차단, 그 자체로 csa_direct를 부여하지는 않고 턴을 실패시키지도 않음)로만 쓰인다. 기존 Primary Extract 한 번이 4개 선택지 전부에 대해 `choice_structured_meta: [{choice_index, action_types[], actor_id, target_id, suggested_route, direct_csa_ids[]}]`를 추가로 반환한다(추가 LLM 호출 없음). `resolveStructuredCsaDirectCoverage`가 이 구조화 enum을 활성 CSA semantic contract(`sexual_authorization`/`direct_execution`/`actions`/`directions`)와 `resolveCsaParticipants`로 해석한 실제 참가자에 대조해 독립적으로 재검증한다 — `direct_csa_ids`/`suggested_route`는 참고용 힌트일 뿐 그대로 신뢰하지 않는다. `buildSavePatch`가 `extract.choice_structured_meta`를 `last_choice_structured_meta`로 저장해 다음 턴 읽기(`isCurrentChoiceMetaValid`/`resolveBoldChoiceAttempt`/`resolveSelectedCsaDirectChoice`/`buildCsaOnlyPublicContext`)가 선택지 원문을 다시 해석하지 않고 이 execution_contract를 그대로 재사용하게 한다. 같은 값이 `buildExtractPrompt`의 `[SELECTED EXECUTION CONTRACT]` 섹션을 통해 다음 턴 Extract에도 참고 컨텍스트로 전달된다.

`CSA_DIRECT_COMPLETION_UNVERIFIED`(`classifyCsaIntegrityIssues`)와 `STRUCTURED_SEXUAL_INTEGRITY_UNRESOLVED`(`validateStructuredSexualTurn`) 422는 더 이상 턴 전체를 버리지 않는다. `applyCsaDirectIntegrityStripping`/`applyStructuredSexualTurnStripping`이 검증 실패한 `sexual_resolution`/`sexual_events`만 안전 기본값으로 되돌리고(개별 사건 단위 mismatch는 그 사건만 제거, 인가 자체가 무효면 resolution과 events를 함께 초기화), 서사·요약·선택지·나머지 상태는 그대로 commit된다. `validateCsaDirectResolution`/`resolveStructuredSexualAuthorization` 등 실제 인가 판정 로직 자체는 변경하지 않았다 — 실패 시의 결과(턴 전체 폐기 → 해당 필드만 제거)만 바뀌었다. 하드 실패는 CSA transaction 조작(`APP_VALIDATION_PROOF_INVALID`), unknown id(`NPC_NOT_FOUND` 등), 중복/turn conflict(commit-turn의 `turn conflict` 409), DB commit 무결성 실패(`SUPABASE_ERROR`)에만 남는다.

## NPC canon 오인 방지 · 성적 기록 원자화 · 신음 규칙 확대 (2026-08-01)

`buildRelevantNpcCanonSection()`에 `[CANON 경험 해석 — 오인 방지]` 블록을 추가했다 — `과거남자경험`/`과거오르가즘경험`이 0보다 큰 NPC를 범위 없는 "처음"/"경험 없음"/"동정" 등으로 묘사하지 않고, 범위가 명확한 "처음"(예: 플레이어와는 처음)만 허용하며, 다른 NPC가 메인이 아니라는 이유만으로 그 NPC에 대해 모순된 무경험 단정을 하지 않는다. 이것이 1차 방지 수단이다. `detectNpcCanonConflict()`는 좁은 direct-contradiction 필터를 유지한 채 명확한 두 패턴만 추가했다 — 긍정 파트너 수 대비 "성경험이 처음"/"처녀"/"동정" 같은 모호하지 않은 무경험 주장, 긍정 오르가즘 수 대비 "절정을 느낀 적이 없다" 류 주장. 여전히 bare "처음" 단독은 매칭하지 않는다(비성적 문맥에서 너무 흔함).

`applySexualEvents()`가 리팩터됐다: 사정/오르가즘 같은 완료 사건은 이제 (1) 같은 턴에 accepted된 호환 base 사건이 있거나, (2) 현재 `sexualAuthorization.authorized`+`sexualResolution.completed`가 호환 action과 함께 참이고 완료 근거가 최종 Story에 그대로 존재하며 시도/계획/가정/중단/부정("사정 직전", "싸려고 한다" 등)이 아닐 때 인정된다 — 삽입/구강이 이전 턴에 시작된 경우도 커버한다. 질/항문 사정은 근거 문장에서 위치를 구분해야 하며 위치를 추론하지 않는다. 모든 특정 사정 타입은 같은 패스에서 `player_ejaculation_count`도 함께 증가시켜(우산 카운터) `sexual_history`와 최상위 카운터·`has_received_player_ejaculation`·`has_had_sex_with_player`·`intimate_info_unlocked`가 `normalizeRelationshipState()`를 통해 원자적으로 동기화된다. 일반 `player_ejaculation`과 위치별 사정이 한 턴에 같이 오면 위치별만 인정하고, 같은 턴 안에서 동일 타입+동일 근거의 중복 사건은 한 번만 인정한다. `filterCurrentRelationshipMemoryPatch()`는 이번 요청에서 실제로 accepted된 사정/오르가즘 사건이 없는데 완료를 주장하는 관계 기억 문장만 걸러내고(무관한 유효 기억은 보존), 거부된 완료가 유일한 긍정 기록으로 남지 않게 한다.

레거시로 카운터가 유실된 저장(관계 기억에는 완료 사정이 남아 있지만 모든 카운터·플래그가 0/false인 경우, 예: 박소현)을 위해 `resolveRelationshipCompatibilityFacts()`가 읽기 전용 호환 계층을 추가했다 — 구조화 카운터·플래그가 모두 0일 때만, 계획/중단/가정/부정이 아닌 명확한 완료 사정/성관계 기억 문장에서 최소 1의 호환치를 도출한다(중복 문장도 항상 최소 1). 이는 인가가 아니며 새 사건을 만들지 않는다. `isNpcIntimateInfoUnlocked()`/`buildNpcRelationshipRecord()`가 이 호환치와 top-level/nested `sexual_history`의 최댓값을 함께 반영해, 실제 값이 양수인데 0회로 표시되던 문제를 막는다. `normalizeRelationshipState()`가 이 호환치를 `previous` 최솟값에 접어 넣어, 해당 NPC의 다음 정상 commit에서 실제 저장값으로 self-heal된다 — DB 직접 수정이나 별도 복구 엔드포인트는 없다.

`buildMoanVocalReactionSection()`을 확장해 실제 지속 자극 장면 한정 밀도 목표(메인 자극 NPC 2회 이상, 강한 지속 자극 3~5회, 절정 전후 4~7회 — 강제 개수 아님, 미달로 턴을 실패시키지 않음), 다양성 규칙, A형/B형/C형 캐릭터 성향(마스터 `신음타입` 우선), 화자명·연기지시 형식·`..` 말줄임표·TTS 노래 방지 규칙을 명시했다. `buildAntiRepetitionSection()`은 복사된 문장 구조·반복 문구·동일 행동 블록만 억제 대상이며 지속 자극 중 짧은 음성 음절의 자연스러운 재사용은 막지 않는다는 예외를 추가했다. 둘 다 프롬프트 문구 변경뿐이며 검증기·hard gate·추가 LLM 호출은 추가하지 않았다.

## 성적 기록 authority 방향 분리 · 사건 합성 · 레거시 필드별 복구 · 신음 무제한화 · TTS 재생 복구 (2026-08-01)

CSA의 semantic contract가 기록하는 **규범(norm) 방향**(예: `csa_111_2`의 `directions:['npc_to_player']`)과 실제로 Story에서 벌어지는 **물리적(physical) 방향**(강한 authority CSA 아래 순응하는 NPC에게 플레이어가 직접 신체 행동을 가하면 `player_to_npc`)은 더 이상 같은 필드로 혼동되지 않는다. `buildCsaExecutionContract({csa, contract, action, physicalActorId, physicalTargetId, authorityMode})`가 물리 계층(`physicalActorType/CharacterId`, `physicalTargetType/CharacterId`, `physicalDirection`)과 규범 계층(`normActorCharacterId/Group`, `normTargetType/Group`)을 함께 담는 단일 불변 execution_contract를 만들고, `resolveSexualCsaDirectCoverage`(레거시 정규식 경로, 항상 `authorityMode:'normative'`)와 `resolveStructuredCsaDirectCoverage`(구조화 선택지 경로, 정방향 `'normative'`/역방향 `'player_acts_on_compliant_npc'`)가 이를 공유한다. `resolveDirectTextCsaExecutionContract()`가 자유 텍스트 입력에서도 동일한 계약 모양을 만들어 `buildChoiceMeta`/`isCurrentChoiceMetaValid`/Story 사실 주입/`buildExtractPrompt`의 `[SELECTED EXECUTION CONTRACT]`가 항상 같은 값을 재사용한다. `validateCsaDirectResolution`은 `resolveCsaDirectionAuthorityMode(contract, csa, direction)`로 방향 유효성을 재판정한다 — `contract.directions`에 있으면 `'normative'`, 없더라도 `direction==='player_to_npc'`이고 CSA가 강한 authority 허용목록(`PLAYER_INITIATED_AUTHORITY_REQUIRED_ACTIONS`)에 속하면 `'player_acts_on_compliant_npc'`로 인정한다 — 이전에는 `contract.directions.includes(resolution.direction)` 단일 literal 비교라 물리적 `player_to_npc`가 규범상 `npc_to_player`로만 기록된 CSA에서 항상 실패해 성적 필드가 지워지던 정확한 버그를 고쳤다.

`resolveSynthesizedSexualEvents()`가 Extract의 `sexual_events` 배열에 행이 누락됐지만 (1) 유효한 execution_contract 인가와 (2) 최종 Story 서사의 완료 확인이 모두 있을 때만 vaginal/anal_penetration, oral_sex, npc_orgasm, 위치별 사정을 좁게 보강한다 — 플레이어 입력 선언만으로는 절대 합성하지 않는다. 6개 사정 하위타입은 `sexualEventCompletionPattern`이 동일한 일반 패턴을 공유하므로 한 턴에 최대 하나만 상호배타적으로 선택한다(위치 확인 vaginal/anal 우선, 인가된 action이 oral이면 oral_ejaculation, 아니면 unspecified_ejaculation). Extract가 이미 보고한 사건, 합성 후보, 일반+위치별 사정은 같은 `eligible` 배열을 공유해 정확히 한 번만 계산된다.

`resolveRelationshipCompatibilityFacts()`가 전부-아니면-전무 게이트에서 **필드별 독립 게이트**로 바뀌었다 — 각 필드(질/항문 성관계, NPC 오르가즘, 사정)는 오직 자기 자신의 구조화 카운터가 0일 때만 관계 기억에서 최소 1을 복구하며, `has_had_sex_with_player` 같은 무관한 양성 플래그가 다른 필드 복구를 막지 않는다(배수진/heroine4가 정확히 이 형태였음). 이 작업 중 두 가지 기존 정규식 결함도 함께 고쳤다: (1) `ORGASM_MEMORY_ASSERTION_RE`/`sexualEventCompletionPattern`의 오르가즘 패턴이 "절정에 이르렀다"류만 인식하고 실제로 흔한 "절정에 올랐다"(오르다 동사)를 놓치고 있었다 — 두 패턴 모두 `올랐다|오르며|오르고|오른다|올라`를 추가했다. (2) 일반 "성관계를 가졌다" 문구가 "항문 삽입 성관계를 가졌다" 같은 **항문 전용** 문장에서도 위치 한정 없이 매칭돼 잘못 질 성관계 최소치를 만들고 있었다 — 항문 위치 단어(`항문`/`애널`)가 같은 문장에 있으면 이 일반 폴백을 걸지 않도록 분리했다(`RELATIONSHIP_MEMORY_VAGINAL_SEX_GENERIC_RE` + `RELATIONSHIP_MEMORY_ANAL_LOCATION_MENTION_RE`). (3) 계획/희망 표현 제외 정규식(`RELATIONSHIP_MEMORY_NONFINAL_RE`)의 "하고 싶" 패턴이 "하다" 활용에만 좁게 걸려 "가지고 싶다"류(다른 동사 어간 + "고 싶다") 문장을 놓치고 있었다 — `고\s*싶`로 넓혔다. 이 복구치는 `isNpcIntimateInfoUnlocked`/`buildNpcRelationshipRecord`/`emptySexualHistory`/`normalizeRelationshipState`/`buildRelationshipMemoryFacts` 다섯 지점 모두에 반영되며, 해당 NPC의 다음 정상 commit에서 실제 저장값으로 self-heal된다 — DB 직접 수정이나 별도 복구 엔드포인트는 없다.

`buildMoanVocalReactionSection()`의 수치 목표(2회 이상/3~5회/4~7회 등)를 전부 제거했다 — 신음·숨소리·비명·끊어진 음성 반응의 빈도·반복·분절·길이·비중에 어떠한 상한도, 정해진 비율도, 최소/최대 개수도 없다고 명시하며, 연속 신음·신음만으로 이뤄진 대사 줄·같은 음절의 반복·길게 끊어지는 발성을 모두 명시적으로 허용한다. A형/B형/C형과 마스터 `신음타입`은 여전히 성향 참고용일 뿐 출력 상한이 아니다. TTS 대응을 이유로 Story에서 신음을 줄이지 않는다는 원칙도 명시했다 — 오디오 정규화는 TTS 전용 코드(`pages/tts.js`)에서만 처리한다. `buildAntiRepetitionSection()`은 신음/숨소리/비명/끊어진 음성 반응에는 반복 억제가 전혀 적용되지 않는다고 전면 예외 처리했다(이전 작업의 "짧은 음절만" 좁은 예외를 대체).

`pages/tts.js`: 수동 재생은 `autoTts` OFF에서도 항상 한 번 재생된다(OFF는 향후 자동재생만 막을 뿐 재생 버튼 자체를 막지 않음) — `enqueueLines`가 `manual` 플래그를 job에 실어 `drain()`/`play()`의 `!state.autoTts` 억제 조건이 `!job.manual`을 함께 확인하도록 했다. 재생 버튼 클릭 핸들러는 네트워크 `await` 이전에 `primeAudioElement()`로 실제 `<audio>` 엘리먼트를 동기적으로 먼저 프라이밍해(모바일 제스처 창 안에서) 그 다음 `unlockAudio()`를 호출한다. 마지막 성공 재생 URL을 `lastAudioResult`로 캐시해 같은 배치 키(`this.key(...)`)면 네트워크 재호출 없이 즉시 재생하고(`playCachedAudio`), 캐시가 만료/실패하면 캐시를 버리고 `{force:true, manual:true}`로 정확히 한 번만 재생성한다. `describePlaybackError()`가 `NotAllowedError`/`MediaError`/stalled/abort를 구분된 표시로 보여주며, 모든 재생/생성 실패는 `showStatus`로만 노출되고 절대 게임 진행을 막지 않는다. 기존 화자별 배치(`batchDialogueLines`)·톤 그룹핑(`ttsToneGroup`)·TTS API 호출 시그니처는 변경하지 않았다.

## 성적 기록 원장 단순화 · 병원 호칭 · 입력 초안 유지 (2026-08-01)

성적 기록이 CSA 방향·route·동의·`sexual_resolution.completed`에서 완전히 분리됐다. 기존 `sexual_events`/`sexual_resolution`과 그 인가 검증은 Story 실행 권한 판정 용도로 그대로 남아 있지만, 관계 카운터의 유일한 writer는 `applySexualRecordLedger()`다. Primary Extract의 `sexual_record_events`는 `character_id`, `type`, `actor_type(player|npc|other)`, `actor_character_id`, 완료 근거를 가진 사실 행이며, 최종 Story에서 완료된 사건만 기록한다. 원장은 event 배열 순번이 아니라 `turn:character:type:evidence-hash` ID로 exact 중복을 막고, 다른 evidence의 별개 사건은 각각 보존한다. 위치별 사정은 generic 사정보다 우선하며, actor가 `player`로 명확할 때만 player ejaculation counter 및 player 관계 플래그를 증가시킨다. 인물별로 그룹화하여 해당 NPC 관계 patch만 원자적으로 갱신하고, 모든 factual counter는 10 cap 없이 안전 정수로 증가한다.

레거시로 카운터가 유실된 저장은 두 계층으로 self-heal한다. 2차 history scan은 Commit 요청당 `get_play_history`를 최대 한 번만 호출하고, 현재 NPC·이번 record event NPC·기존에 미복구인 관계를 함께 검사한다. RPC가 성공하여 해당 NPC를 검사했을 때만 `sexual_record_backfill_version:1` 및 `sexual_record_history_scanned_through_turn` marker를 저장한다. 실패 시 marker를 쓰지 않으며 다음 정상 Commit에서만 재시도한다.

병원 호칭: `buildHospitalAddressMatrixSection()`은 간호사끼리 이름+쌤, 수간호사님, 성+교수님, 원장님 규칙과 master의 `formal_title`/`peer_address`/`superior_address` override를 유지한다. NPC→플레이어는 current explicit request, stored override, NPC `player_honorific`, player profile job/rank-derived default, 보수적 fallback 순서로 결정한다(감사 프로필은 `감사관님`). `resolveCurrentTurnPlayerAddressRequests()`가 Story fetch 전에 명시적 현재 요청을 authoritative prompt block으로 반영한다. `이번에만` 요청은 이번 Story에만 적용하고 저장하지 않으며, persistent request만 Extract `address_updates`를 통해 저장한다. 주소 값은 1–20자, 개행·JSON/command 문자 없는 짧은 호칭만 허용하고 malformed field는 Commit을 막지 않고 무시한다.

입력 초안: Story만 입력을 잠근다. Extract/Commit에서는 draft가 계속 편집 가능하지만 send는 비활성화된다. Commit 성공 직후에는 render/media/TTS보다 먼저 phase를 `idle`로 바꾸고 submit을 다시 허용한다. image loading/retry는 chat loading을 호출하지 않으며, `ui.init()`/context reload/409 recovery/실패 discard·feedback 경로는 최신 draft를 우선 보존한다. Enter는 진행 중 phase에서는 default를 막고 draft를 제출하거나 지우지 않는다.
