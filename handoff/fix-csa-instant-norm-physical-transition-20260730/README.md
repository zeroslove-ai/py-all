# Hotfix — CSA social norm applies immediately; physical state changes only through real action

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`440c20ad5a42617e875cb045dc96f917f1ba4e72`

Functional Worker base inside that HEAD:

`6bf9ab6a6bfcb3b6cdb5f62554df2d364d7281e3`

Delivery-only branch:

`handoff/fix-csa-instant-norm-physical-transition-20260730`

Do **not** merge this delivery branch. Read this document, then implement directly on a new local branch created from the exact production HEAD above.

## 1. User-visible bugs to fix

### Bug A — social rules are incorrectly treated as magical matter transformation

Examples of wrong output:

- A new no-underwear rule activates and underwear instantly vanishes.
- A tight-uniform rule activates and the uniform instantly shrinks or becomes tight.
- A rule physically grabs or restrains an NPC: `규정이 그녀를 붙잡았다`.

Correct model:

- **The social norm, belief, and judgment change immediately.**
- **Existing matter and current physical state do not change automatically.**
- When current clothing/posture conflicts with the new norm, the NPC regards the norm as obvious and correct, notices their current noncompliance, and performs a plausible physical action to comply.

Example:

- Correct thought: `내가 왜 아직 속옷을 입고 있지? 근무 규정에 맞게 정리해야 해.`
- Incorrect thought: `이 노팬티 규정은 이상해. 왜 따라야 하지?`
- Correct physical sequence: notice the garment, find a private moment or changing room, actually remove/change/adjust it, then continue.
- Incorrect physical sequence: garment disappears, uniform resizes itself, or an invisible rule moves the body.

### Bug B — a validated app update is narrated as an undecided proposal

A user updated an existing CSA item in the app. Instead of applying the update in the same turn, Story narrated hesitation such as:

- gradually deciding whether to change it;
- asking whether to keep the old rule;
- offering choices to apply another version or choose a different rule.

This is wrong. A Worker-validated `app_transaction` is not a suggestion, attempt, draft, or confirmation request.

- `activate`: the new social norm is active **now**, in this Story turn.
- `update`: the old social norm is replaced **now**; the new norm is active now. The old normative obligation no longer applies.
- `deactivate`: the norm stops applying **now**. Memories and already-existing physical state remain until a person physically changes them.

The Story must narrate the immediate in-world consequence and then continue the scene. It must never ask the player whether to apply the already-validated change.

## 2. Non-negotiable behavior contract

### A. Instant cognition, non-magical matter

Add a highest-priority Story contract with this exact conceptual rule:

> 상식은 즉시 바뀌지만 물질은 자동으로 변하지 않는다. 현재 물리 상태와 새 규범이 충돌하면 NPC는 새 규범을 원래부터 당연한 상식으로 받아들이고, 실제 행동으로 현재 상태를 규범에 맞춘다.

The contract must explicitly forbid:

- clothes/underwear disappearing;
- clothing automatically shrinking, tightening, loosening, opening, closing, or changing design;
- buttons/zippers/belts moving by themselves;
- bodies being moved, fixed in place, or restrained by an invisible `rule`, `system`, `app`, `force`, or `regulation`;
- retroactively claiming the NPC had already complied before the transaction when the current saved scene state says otherwise.

### B. Allowed emotion and self-rationalization

The NPC may experience:

- embarrassment about currently violating an obvious norm;
- urgency to correct clothing or posture;
- awkwardness because correction requires privacy, time, or interruption of work;
- bodily exposure, contact, or social attention;
- self-rationalization about why they accidentally failed to comply.

The NPC must not doubt that the norm itself is valid. Preserve personality and resistance outside the norm's direct meaning.

### C. Visible NPC versus off-screen NPC

For an NPC currently visible in the active scene:

- preserve the saved physical state at the instant the CSA changes;
- show the actual transition action before saving a different clothing/posture state;
- if immediate compliance is physically impossible, keep the old physical state for now and narrate the NPC planning or seeking the earliest plausible way to comply.

For an off-screen NPC:

- they may next appear already compliant only when enough time and access plausibly existed;
- do not rewrite the physical state of a currently visible NPC off-screen within the same uninterrupted moment.

### D. Update and deactivate continuity

For `update`:

- old norm: immediately no longer active;
- new norm: immediately active;
- physical residue caused by the old norm remains until changed through real action;
- do not present old and new rules as simultaneous alternatives;
- do not ask the user which version to use.

For `deactivate`:

- normative pressure ends immediately;
- memories and current physical state remain;
- the NPC may decide to change clothes/posture based on personality and situation, but no automatic restoration occurs.

### E. Post-transaction choices

When `structuredPlan.canonical_action.type === 'app_transaction'`, `[3. 선택지]` must contain exactly four **in-world follow-up actions after the transaction has already applied**.

Forbidden choices include:

- apply/confirm/cancel the same update;
- gradually introduce the update;
- choose whether to keep the old rule;
- replace it with another rule;
- open/manage/edit/deactivate/strengthen the app item;
- ask the player which version they want.

App management remains exclusively in the app UI.

## 3. Required implementation areas

Primary file:

- `worker/game-proxy-v2.js`

Documentation may be minimally updated:

- `docs/project_v2/CSA_ONLY_BRANCH.md`
- `docs/project_v2/STREAM_FIRST_ARCHITECTURE.md`

Do not change Supabase, RPCs, migrations, game data, reset state, image data, TTS data, or frontend runtime files unless a concrete frontend defect is found and reported before editing.

### 3.1 Structured app transaction must be an established fact in Story

Inspect and update the current flow around:

- `handleStory`
- `buildStructuredEffectiveSave`
- `buildStoryPrompt`
- `buildStructuredActionStorySection`

Requirements:

1. Keep using the post-plan effective save for Story.
2. Add a final, recency-favored, highest-priority app-transaction outcome section after general continuity rules.
3. Include the canonical operation outcome, not merely the user's display text.
4. Mark the transaction as already validated and already effective for this Story turn.
5. For `update`, explicitly state that the old rule is replaced and must not continue as an alternative social norm.
6. The user-role message for a structured app transaction must not sound like a request awaiting a decision. Use a neutral instruction equivalent to:
   `위 Worker 확정 상식개변 결과가 이미 적용된 현재 장면을 진행한다.`
7. Do not classify the structured transaction as a player attempt or ask for confirmation.
8. Keep `stream: true` and direct `new Response(deepseekRes.body, ...)` passthrough unchanged.

If the current `buildStoryPrompt` only receives the effective save and cannot describe the old-to-new update clearly, pass the pre-plan save or a compact local transition summary from `handleStory`. Do not change the public client payload or DB schema for this.

### 3.2 Add a physical continuity section to Story

Strengthen or add a dedicated function, for example:

- `buildCsaPhysicalTransitionSection(...)`

Inject it when either:

- an active CSA applies to the current scene; or
- the current turn contains an app transaction.

It must have higher priority than generic direct-execution wording and must distinguish:

- immediate normative/cognitive application;
- actual physical compliance action;
- saved current physical state.

Do not weaken direct CSA execution. A triggered required action still occurs at 100%, but it occurs through an actual bodily/clothing action rather than magic.

Examples:

- `대화를 시작하면 무릎 위에 앉는다`: the NPC physically walks/moves/sits; the rule does not teleport them.
- `속옷 없이 근무한다`: the NPC notices current noncompliance and removes/changes clothing in a plausible place; underwear does not vanish.
- `밀착 유니폼`: the NPC changes into or manually adjusts an appropriate garment; the current uniform does not morph.

### 3.3 Extract and scene-state persistence must require physical evidence

Inspect the existing Extract schema/prompt and save path for:

- `npc_scene_state`
- clothing fields such as `uniform_top`, `uniform_bottom`, `underwear_top`, `underwear_bottom`
- posture/current action
- the scene-state merge in `buildSavePatch` or its helper

Implement a minimal fail-open evidence safeguard:

1. Existing physical state is the default.
2. A clothing/posture field may change only when the generated Story contains an explicit completed physical transition by that NPC.
3. Add transient extraction evidence if necessary. Recommended shape: a short exact quote or field-to-quote map used only during Worker validation; do not persist it in `game_save`.
4. Validate that each evidence quote is an exact substring of the Story and actually describes the relevant NPC performing the transition.
5. Reject magical/non-action evidence such as:
   - `규칙이 적용되자 속옷이 사라졌다`
   - `유니폼이 저절로 타이트해졌다`
   - `규정이 그녀를 붙잡았다`
6. If evidence is absent or invalid, discard only the unsupported scene-state field update, preserve the previous field, log a warning such as `csa_physical_transition_rejected`, and continue the turn. Never fail the whole turn.
7. If there was no previous stored field, do not initialize it directly to `removed/open/tight/...` merely because a CSA became active. Require Story evidence for the physical transition.
8. A narrative that only says the NPC notices the mismatch or plans to change does **not** count as completed transition evidence.
9. A narrative that says the NPC entered a changing room, actually removed/changed/adjusted the garment, and returned does count.

Avoid broad natural-language hard gates. This safeguard applies only to optional physical scene-state persistence and is fail-open for the turn.

### 3.4 Extract contract for app transactions

Strengthen `buildStructuredActionExtractSection` and the scene-state extraction contract:

- canonical app transaction is already applied, not pending;
- record the new active CSA state through the existing structured plan, not model speculation;
- Extract must not create choices that reconsider the transaction;
- Extract must distinguish `norm active` from `physical compliance completed`;
- do not set scene-state clothing/posture changes without completed narrative evidence;
- do not reintroduce any P1 auxiliary repair LLM call.

## 4. Preserve all recently restored behavior

Must remain unchanged:

- four complete player candidates and all required player fields;
- `resolveSetupSelection`, button `player_action`, and same-input selection plus edits;
- Primary Extract exactly one attempt;
- no JSON repair LLM;
- no Mind Monitor repair LLM;
- no first-encounter repair LLM;
- no post-stream CSA narrative repair/replacement;
- Mind Monitor primary fields and deterministic per-field fallback;
- image shortlist, `image_id`, `/api/image`, frontend image rendering;
- TTS, `dialogue_lines`, `/api/tts`, playback and replay;
- NPC stats, relationship, sidebar, feedback rollback, Commit conflict handling;
- bold/blocked choice metadata and player agency;
- validated structured app transactions remain fail-closed on proof/DB/integrity failures.

Do not restore removed legacy hypnosis/personal-suggestion runtime behavior.

## 5. Static verification

Do not call real `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, choice, save, or feedback endpoints.

Run:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/ui.js
node --check pages/stream.js
node --check pages/api.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

Confirm required symbols remain:

- `stream: true`
- `new Response(deepseekRes.body`
- `/api/image`
- `/api/tts`
- `npc_emotion`
- `dialogue_lines`
- `image_id`
- `player_recommendations`
- `resolveSetupSelection`
- `player_action`
- `MIND_MONITOR_DEGRADED_FALLBACKS`

Confirm runtime calls remain absent:

- `repairRawJsonOutput(`
- `repairMindMonitor(`
- `repairMissingFirstEncounterStats(`
- post-Story `resolveCsaNarrativeIntegrity(` invocation
- ordinary full Extract retry with `maxAttempts: 2`

Confirm the final diff does not modify frontend runtime files unless an actual frontend bug was first proven:

```powershell
git diff --exit-code 440c20ad5a42617e875cb045dc96f917f1ba4e72 -- pages/sidebar.js pages/tts.js pages/ui.js pages/stream.js pages/api.js pages/index.html
```

Targeted source/static assertions must prove:

- an app update is described as already active, not pending;
- update replaces old norm immediately;
- choices after app transaction cannot reconsider/manage the transaction;
- physical state cannot change without explicit completed action evidence;
- invalid physical evidence preserves the previous state and does not fail the turn;
- the prompt includes the instant-norm/non-magical-matter contract.

## 6. Git and deployment procedure

1. Confirm `origin/feature/csa-only` is exactly `440c20ad5a42617e875cb045dc96f917f1ba4e72` before starting.
2. Create a new local branch from that exact SHA, for example:
   `apply/fix-csa-transition-20260730`
3. Implement directly. Do not merge this delivery branch.
4. Run static verification.
5. Commit once:
   `fix: apply csa norms immediately without magical state changes`
6. Fetch again. If `origin/feature/csa-only` moved, stop and report; do not force-push or blindly rebase.
7. Push a normal fast-forward to `feature/csa-only`.
8. Deploy only `game-proxy-v2` unless a frontend file was genuinely changed.
9. Do not write to Supabase or mutate test/operating game state.

## 7. Completion report

Report:

- starting SHA;
- final SHA and commit message;
- changed files;
- exact Story/Extract/scene-state changes;
- how update/activate/deactivate behave now;
- how unsupported magical scene-state updates are rejected fail-open;
- static verification output;
- API Worker Version ID and `/api/version` tag;
- whether frontend was untouched and not redeployed;
- confirmation that Supabase/game data/endpoints were not mutated;
- exact phrase:
  `기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
