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
