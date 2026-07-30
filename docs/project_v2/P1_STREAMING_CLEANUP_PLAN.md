# P1 — Streaming cleanup without feature regression

Base functional SHA when this work branch was created:

`453aa935501f7798b38bd373669826af34584c7b`

Work branch:

`work/p1-streaming-cleanup-20260730`

This branch is preparation-only while the four-candidate player-setup/sidebar hotfix is being completed on `feature/csa-only`. Do not deploy this branch. After the hotfix report supplies its final SHA, recreate or rebase the P1 work on top of that exact SHA before implementation and deployment.

## Non-negotiable preservation contract

P1 must not remove, hide, disable, bypass, or change the observable contract of any existing gameplay feature below.

1. Four LLM-generated player setup candidates.
2. Selecting a candidate by number.
3. Selecting a candidate and editing fields in the same input, for example `4번으로 선택하되 배경만 의사로 바꿔줘`.
4. Mind Monitor panel and its `surface`, `inner`, `physical_reaction`, and `state` values.
5. NPC image shortlist, `image_id`, image lookup, and frontend image rendering.
6. TTS endpoint, dialogue extraction, replay button, voice selection, and playback flow.
7. NPC status, relationship panel, player information, player inner-thought panel, and sidebar visibility.
8. Four normal gameplay choices, bold/blocked metadata, free-text input, and mobile choice behavior.
9. Story SSE passthrough: `stream: true` and direct `new Response(deepseekRes.body, ...)`.
10. Feedback rollback/restore, atomic Commit, turn conflict handling, app transaction validation, CSA-only runtime, and current Supabase schema/RPCs.

No frontend file may be changed in P1 unless a concrete regression is first demonstrated in the post-hotfix code and the change is strictly necessary to preserve an existing feature. Image, TTS, setup, sidebar, and UI code are otherwise out of scope.

## P1 objective

Reduce post-Story latency and failure amplification without weakening the primary Story, primary Extract, Mind Monitor, image, TTS, choices, setup, or Commit flows.

The primary calls remain:

1. One Story LLM call with SSE streaming.
2. One primary Extract LLM call after Story completes.

P1 targets only auxiliary recovery behavior after the primary Extract has returned or failed.

## Allowed implementation changes

### 1. Remove full Extract regeneration

- Ordinary gameplay must not issue a second full narrative-to-JSON Extract call.
- `maxAttempts` for ordinary gameplay must be one.
- Validated structured app transactions may remain fail-closed, but must not trigger an unbounded or duplicated full Extract pipeline.

### 2. Remove LLM JSON syntax repair

- Do not call another LLM solely to repair malformed JSON.
- Use local parsing cleanup only when deterministic and semantics-preserving.
- If parsing still fails, use the existing degraded narrative-only Commit path.

### 3. Keep Mind Monitor, remove only its auxiliary LLM retry

- The primary Extract must continue requesting and returning `npc_emotion`.
- Valid primary Mind Monitor fields must be preserved.
- Invalid fields use the existing deterministic per-field fallback.
- Do not clear valid sibling fields because one field failed.
- Do not hide the Mind Monitor panel.
- Do not change `pages/sidebar.js` or the frontend contract.

### 4. Remove first-encounter LLM repair only

- The primary Extract must continue accepting `first_encounter_stats`.
- If missing, omit that optional patch and continue the turn.
- Do not remove NPC detection, NPC emotion, image shortlist, relationship handling, or the first-encounter schema.

### 5. Eliminate post-stream narrative replacement

- Already streamed Story text must never be replaced by a later LLM repair.
- `narrative_replacement` remains `null` for ordinary gameplay.
- CSA meta-awareness and structured-runtime observations become warnings or rejected optional patches unless they fall within the hard-gate allowlist.
- Actual unauthorized completed sexual state/event persistence remains fail-closed.

### 6. Preserve choices

- Do not remove normal choice generation or the four-choice UI contract.
- Do not alter the player-setup four-candidate selection flow restored by the hotfix.
- P1 may prevent auxiliary LLM choice repair calls, but it must retain deterministic fallback and the existing bold/blocked safety metadata.

### 7. Preserve degraded display continuity

When primary Extract fails:

- Commit the streamed narrative through the existing degraded path.
- Do not write null/empty optional state over previously saved NPC, Mind Monitor, image, relationship, or player information.
- Do not cause frontend panels, image, or TTS controls to disappear merely because optional Extract fields were unavailable.
- TTS for the current turn may be unavailable only when the primary Extract produced no usable dialogue lines; the existing saved/display state must not be erased.

## Explicitly forbidden changes

- No player-setup redesign.
- No change from four candidates to one candidate.
- No setup-only sidebar hiding.
- No removal of Mind Monitor fields or panel.
- No removal of image shortlist, image lookup, or image rendering.
- No removal or suppression of TTS.
- No Supabase writes, migrations, RPC changes, resets, or game-data edits.
- No Story/Extract/Commit/Reset gameplay calls by the implementation agent.
- No broad Worker rewrite.
- No new natural-language hard gates.
- No exact-match validation of setup card wording or choice labels.
- No deployment before the user-provided hotfix final SHA is confirmed and P1 is rebased onto it.

## Required static verification

1. `node --check worker/game-proxy-v2.js`
2. `node --check` all unchanged frontend JS entry files.
3. ESM import of `worker/game-proxy-v2.js`.
4. `git diff --check`.
5. Confirm `stream: true` remains.
6. Confirm direct `new Response(deepseekRes.body, ...)` remains.
7. Confirm `/api/image` and `/api/tts` routes remain.
8. Confirm `npc_emotion`, `dialogue_lines`, `image_id`, and four-candidate setup identifiers remain after the hotfix base is incorporated.
9. Confirm no frontend files changed unless separately justified by a proven regression.
10. Confirm only intended P1 files changed.

## Integration sequence after hotfix completion

1. Receive the hotfix final SHA and changed-file list.
2. Verify `feature/csa-only` points to that SHA.
3. Compare hotfix against `453aa935501f7798b38bd373669826af34584c7b`.
4. Recreate P1 work from the hotfix SHA; do not merge this preparation branch blindly.
5. Re-audit setup, sidebar, Mind Monitor, image, and TTS code before editing.
6. Implement P1 only in the Worker unless a proven frontend continuity bug requires a minimal frontend fix.
7. Run static verification.
8. Commit once.
9. Push fast-forward to `feature/csa-only` only after the user confirms the hotfix is functionally acceptable or explicitly orders P1 deployment.
10. Deploy only workers whose runtime files changed.

## Planned commit

`refactor: remove auxiliary post-stream recovery calls`

Required final report line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
