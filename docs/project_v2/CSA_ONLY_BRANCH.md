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
- Preset `required_action` omission checks reuse the existing
  `csa_omission` repair pass (one shared recovery-budget LLM call per
  turn) — no new LLM call is introduced. See
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

- 모든 applicable CSA는 Extract의 `csa_trigger_evaluations`에 정확히 한 번 있어야 한다. 누락·중복·알 수 없는 ID는 recovery 대상이며, 복구 뒤에도 남으면 Commit을 차단한다.
- sexual CSA direct 실행은 간이 `route/completed/id` 비교가 아니라 full semantic contract, actor/target, trigger, runtime, Story evidence 검증을 통과해야 한다.
- repair는 Story 본문과 함께 structured resolution/runtime/event/relationship field도 갱신한다. setup 완료 상태에서 structured Extract를 만들지 못하면 fail-closed한다.
- 플레이어의 명시적 요청이나 위생 처리처럼 규범 자체는 유효하지만 이번 턴만 물리적으로 중단된 경우, `csa_trigger_evaluations[].status`는 `satisfied|continuing|temporarily_interrupted|not_satisfied|ended` 중 `temporarily_interrupted`를, `csa_runtime_updates[].status`/저장된 `csa_runtime_state[csaId].status`는 `inactive|active|paused|ended` 중 `paused`를 쓸 수 있다. `temporarily_interrupted`는 `evidence`(player_input 또는 최종 서사의 중단 근거)가 없으면 `CSA_INTERRUPTION_EVIDENCE_MISSING`으로 정합성 검증에 실패한다 — 단순히 규범을 언급하지 않거나 잊은 경우에는 쓸 수 없다. 이 상태는 규범을 해제·거부하는 것이 아니라 다음 턴에 조건이 다시 맞으면 `continuing`으로 돌아갈 수 있는 일시 정지이며, 새 DB column·RPC·migration은 없다. `evidence` 비교(`evidenceExists`)는 개행·연속 공백·전각/반각 따옴표 차이만 흡수하는 문자 정규화(NFKC) 후 원문 substring 비교이며, 의미 기반 추측이나 키워드 매칭은 하지 않는다.
- `csa_runtime_updates`는 매 턴 전체 스냅샷이 아니라 델타다: 이전 턴부터 이미 `active`였고 이번 턴에도 변화가 없으면 중복 update를 생략할 수 있다. 그래서 정합성 검사(`auditStructuredCsaExecution`, `validateCsaDirectResolution`)는 이번 턴 delta만 보지 않고, 저장된 `save.csa_runtime_state`에 이번 delta를 적용한 **effective runtime**(`buildEffectiveCsaRuntimeState`)을 기준으로 판단한다 — 저장된 active가 이번 턴 delta로 변경되지 않았으면 계속 active로 취급한다. trigger evaluation이 `ended`인데 effective runtime이 여전히 `active`로 남아 있는 불일치도 `CSA_RUNTIME_NOT_VERIFIED`로 막는다.
- CSA 정합성 repair(`repairCsaNarrativeIntegrity`)는 실제로 수정한 필드만 담은 `changed_fields`를 함께 반환하며, Worker는 `changed_fields`에 없는 필드를 절대 적용하지 않는다 — repair가 실수로 빈 배열을 반환해도 기존 정상 구조화 필드를 지우지 않는다. `csa_trigger_evaluations`/`csa_runtime_updates`는 전체 교체가 아니라 `csa_id`(runtime은 `csa_id`+`character_id`) 기준 병합이라, repair가 일부 CSA만 다시 판단해도 손대지 않은 나머지 applicable CSA의 평가는 그대로 유지된다. repair 체인에는 이번 턴 `player_input` 원문도 전달돼, 플레이어가 명시적으로 요청한 중단·이동을 repair가 되돌리지 않게 한다.
- 과감 선택지 메타(`last_choice_meta`)가 현재 턴/현재 계약과 맞지 않는 stale 값(다른 턴 `choice_id`, `severity` 누락, `sexual_action:"none"`인데 `kind:"bold"`인 경우 등)이면 `isCurrentChoiceMetaValid`가 이를 거부하고, `/api/context`의 공개 view(`buildCsaOnlyPublicContext`)와 실제 판정(`resolveBoldChoiceAttempt`) 모두 저장된 값 대신 현재 choices/save로 다시 계산한 in-memory 메타를 쓴다 — DB에는 쓰지 않는 표시/판정 전용 재분류다. `severity:"blocked"`는 `kind:"bold"`와 분리된 별도 `kind:"blocked"`이며, bold 확률 굴림 대상이 아니다.
