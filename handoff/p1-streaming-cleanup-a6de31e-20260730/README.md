# P1 — Remove auxiliary post-stream recovery calls without feature regression

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required base SHA:

`a6de31e64d25c71de82f7827148fcc67dd265f94`

Delivery branch:

`handoff/p1-streaming-cleanup-a6de31e-20260730`

Do not merge or deploy this delivery branch. Read this document and implement directly on a new local branch created from the exact production base SHA.

## 1. Goal

Keep the primary gameplay pipeline intact:

1. Story: one DeepSeek SSE call, `stream: true`, direct `new Response(deepseekRes.body, ...)` passthrough.
2. Extract: one primary DeepSeek JSON call after Story completes.
3. Commit: existing atomic Commit and conflict handling.

Remove only auxiliary LLM recovery behavior that runs after the primary Story/Extract path and increases latency or failure amplification.

## 2. Non-negotiable feature preservation

The implementation must preserve all behavior restored in `a6de31e64d25c71de82f7827148fcc67dd265f94`.

- Four LLM-generated player candidates in `player_setup.recommendations[]`.
- Stable candidate IDs `candidate_1` through `candidate_4`.
- Free-text numeric selection through `parseSetupCandidateSelection()`.
- Same-input selection plus edits, e.g. `4번으로 선택하되 배경만 의사로 바꿔줘`.
- Immediate selection+opening unless an explicit setup hold phrase is present.
- No `PLAYER_SETUP_CANDIDATES_INVALID` or exact card/choice-label hard gate.
- Setup Extract fail-open preserving existing candidates.
- Mind Monitor fields and panel: `surface`, `inner`, `physical_reaction`, `state`.
- NPC image shortlist, `image_id`, image lookup route and frontend image rendering.
- TTS endpoint, dialogue extraction, voice selection, playback and replay behavior.
- NPC status, relationship, player information, player inner-thought and sidebar sections.
- Four normal gameplay choices, free text, bold/blocked metadata and mobile choice behavior.
- Feedback rollback/restore, turn conflict handling, app transaction validation, CSA-only runtime and current Supabase schema/RPCs.

No player-setup redesign. No frontend hiding. No deletion of image, TTS, Mind Monitor, dialogue, relationship or choice fields.

## 3. Allowed code scope

Primary target:

- `worker/game-proxy-v2.js`

Documentation may be updated only where needed:

- `docs/project_v2/CSA_ONLY_BRANCH.md`
- `docs/project_v2/STREAM_FIRST_ARCHITECTURE.md`
- `docs/project_v2/HARD_GATE_ALLOWLIST.md`
- `worker/AGENTS.md`

Do not change frontend files in P1. `pages/sidebar.js`, `pages/tts.js`, `pages/ui.js`, `pages/stream.js`, `public/index.js` and `public/games.js` must remain byte-for-byte unchanged unless the task is stopped and a concrete frontend regression is reported first.

No Supabase writes, migrations, RPC changes, resets or game-data edits.

## 4. Implementation requirements

### A. One primary Extract attempt

For ordinary gameplay and player setup:

- Make only one full narrative-to-JSON Extract LLM request.
- Set ordinary Extract `maxAttempts` to `1`.
- Do not run a second full extraction pass.
- Validated structured app transactions remain fail-closed, but must not trigger duplicate or unbounded full Extract calls.

Do not alter the primary Extract prompt fields for Mind Monitor, dialogue, image selection, choices, player setup or CSA state.

### B. Remove JSON-repair LLM call

Remove the auxiliary LLM path used only to repair malformed JSON.

Expected removals include the runtime use of:

- `buildJsonRepairPrompt`
- `repairRawJsonOutput`
- `consumeRecoveryBudget(..., 'json_syntax')`

A small deterministic local cleanup is allowed only if it cannot invent, rewrite or semantically modify content. If parsing still fails, return the existing degraded narrative-only result with HTTP 200 for non-app-transaction turns.

Do not add another model call under a different name.

### C. Keep Mind Monitor; remove only its retry LLM

The primary Extract must continue requesting and returning `npc_emotion`.

- Preserve valid `surface`, `inner`, `physical_reaction` and `state` values from the primary Extract.
- When one field is invalid, keep valid sibling fields.
- Replace only invalid fields through the existing deterministic `MIND_MONITOR_DEGRADED_FALLBACKS` / `resolveMindMonitorDegradedFallback` path.
- Set `mind_monitor_source` to `generated` or `degraded` as appropriate.
- Do not clear `npc_emotion` merely because one field failed.

Remove the auxiliary LLM retry path using:

- `buildMindRepairPrompt`
- `repairMindMonitor`
- `consumeRecoveryBudget(..., 'mind_monitor')`

The Mind Monitor panel and frontend contract are unchanged.

### D. Remove first-encounter repair LLM only

Primary Extract may still produce `first_encounter_stats`.

When it is missing or invalid:

- Do not make an auxiliary LLM call.
- Omit that optional patch and continue the turn.
- Preserve NPC detection, `npc_emotion`, dialogue, relationship and image shortlist processing.
- Do not hard-fail the turn because first-encounter stats are absent.

Remove runtime use of `repairMissingFirstEncounterStats` and related recovery-budget consumption. Remove now-dead helper code only when no other path uses it.

### E. No post-stream narrative replacement

Already streamed Story text must not be replaced after Extract.

- `narrative_replacement` must remain `null` for ordinary gameplay.
- Do not call an LLM to rewrite Story for CSA omissions, meta-awareness or sexual-integrity repair.
- Soft CSA runtime/evaluation/evidence issues become warnings and rejected optional patches.
- Invalid optional `csa_runtime_updates` are discarded rather than rewriting Story.
- Actual unauthorized completed sexual state/event persistence remains fail-closed under the hard-gate allowlist.
- Structured app transaction validation remains fail-closed.

Remove runtime calls to `resolveCsaNarrativeIntegrity`/repair functions from the normal post-Story path. Delete dead prompt/helper code only after confirming it is not used elsewhere.

### F. Preserve choices

- Keep normal Story choice generation and frontend four-choice behavior.
- Keep setup candidate choices and candidate-number parsing.
- Keep bold/blocked classification and safety metadata.
- Do not introduce exact-match validation.
- Do not make an auxiliary LLM call to repair choices.
- Deterministic fallback remains available when no usable choices exist.

### G. Degraded state continuity

When primary Extract fails:

- Commit the streamed narrative through the existing degraded path.
- Preserve previously saved NPC, Mind Monitor, image, relationship, player, setup candidates and CSA state by omitting unavailable optional patches.
- Do not write empty arrays/objects/nulls over existing saved state solely because Extract failed.
- Preserve current setup candidates so the player can still select or modify them later.
- Do not cause image/TTS/sidebar sections to disappear because the current Extract was degraded.

### H. Remove dead recovery-budget code carefully

After all auxiliary LLM recovery calls are removed:

- Remove `createRecoveryBudget`, `consumeRecoveryBudget` and response fields only if no remaining path needs them.
- Do not change API response fields merely for cleanup if the frontend or logs may read them. It is acceptable to retain compatibility fields with neutral values such as `recovery_used: false`, `recovery_kind: null`.
- Prefer minimal behavioral edits over a broad rewrite.

## 5. Hard gates that must remain

Only the existing real integrity gates remain blocking:

- Supabase context/commit unavailable.
- Turn-number mismatch or conflicting duplicate turn.
- Invalid validated structured app transaction/proof/range/ID.
- Mutation of nonexistent or inactive CSA state.
- Actual completed sexual state/event persistence without valid authorization.
- DB transaction failure.

Do not create new natural-language, formatting, card, Mind Monitor, image, TTS, first-encounter or optional Extract hard gates.

## 6. Static verification

Run all of the following without calling real gameplay endpoints:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/ui.js
node --check pages/stream.js
node --check public/index.js
node --check public/games.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

Verify required symbols remain:

- `stream: true`
- `new Response(deepseekRes.body`
- `/api/image`
- `/api/tts`
- `npc_emotion`
- `dialogue_lines`
- `image_id`
- `player_recommendations`
- `parseSetupCandidateSelection`
- `resolveSetupApproval`
- `candidate_1`
- `MIND_MONITOR_DEGRADED_FALLBACKS`
- `resolveMindMonitorDegradedFallback`

Verify forbidden runtime calls are gone from normal execution:

- `repairRawJsonOutput(`
- `repairMindMonitor(`
- `repairMissingFirstEncounterStats(`
- post-Story `resolveCsaNarrativeIntegrity(` call
- ordinary full Extract retry with `maxAttempts: 2`

Helper definitions may be removed. If a symbol remains only as an unused definition, remove it before commit unless an exported/static test contract requires it.

Confirm frontend files are unchanged:

```powershell
git diff --exit-code a6de31e64d25c71de82f7827148fcc67dd265f94 -- pages/sidebar.js pages/tts.js pages/ui.js pages/stream.js public/index.js public/games.js
```

## 7. Git procedure

1. Confirm clean worktree except existing `.wrangler/` and `worker/.wrangler/` caches.
2. Fetch origin.
3. Confirm `origin/feature/csa-only` is exactly `a6de31e64d25c71de82f7827148fcc67dd265f94` before starting.
4. Create a new local branch from that exact SHA, for example `apply/p1-streaming-cleanup-a6de31e`.
5. Implement directly. Do not merge the delivery branch.
6. Run static verification.
7. Commit once:

`refactor: remove auxiliary post-stream recovery calls`

8. Fetch again. If `origin/feature/csa-only` moved, stop and report; do not force-push or rebase blindly.
9. Push as a normal fast-forward to `feature/csa-only` only after all checks pass.
10. Deploy only `game-proxy-v2` because P1 must not change frontend runtime files.

## 8. Completion report

Report:

1. Starting SHA.
2. Final SHA.
3. Commit message.
4. Exact changed files.
5. Which auxiliary LLM paths were removed.
6. Confirmation that four-candidate setup, Mind Monitor, image, TTS, choices and sidebar contracts remain.
7. Static verification output including `ESM_IMPORT_OK`.
8. API Worker Version ID and `/api/version` tag.
9. Confirmation that frontend was not redeployed.
10. Confirmation that Supabase/game data/Story/Extract/Commit/Reset were untouched.

Required final line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
