# Relationship record ledger · hospital address · draft input handoff

## 1. Immutable base and workflow

- Repository: `zeroslove-ai/py-all`
- Production branch: `feature/csa-only`
- Exact production base:
  `a09018e26b3c0092d195edb69da324c9dcbd0ff5`
- Base commit:
  `fix: align authority records and restore manual tts playback`
- Handoff branch:
  `handoff/fix-record-ledger-address-draft-input-20260801`
- Implementation branch to create:
  `apply/fix-record-ledger-address-draft-input-20260801`

Read this document from the handoff branch, then create the implementation branch from the exact production SHA. Do not implement on the handoff branch.

Before editing and immediately before pushing, fetch origin and verify that `origin/feature/csa-only` is still exactly the base SHA. If it moved, stop and report the new SHA. No rebase, reset, force push, or merge commit.

## 2. Scope

This hotfix contains three changes:

1. Replace the over-coupled sexual relationship counter path with a simple factual event ledger driven by the existing Primary Extract call plus a narrow deterministic fallback.
2. Enforce hospital NPC-to-NPC address rules every turn and persist explicit player-requested NPC-to-player address overrides such as `오빠`.
3. Allow the user to type the next action while Extract and Commit are running, while keeping submission disabled until the current turn finishes.

Expected runtime files:

- `worker/game-proxy-v2.js`
- `pages/index.html`
- `pages/ui.js`
- `pages/state.js` only if a small explicit turn-phase field is useful
- `docs/project_v2/CSA_ONLY_BRANCH.md`

Do not change Supabase schema, RPCs, migrations, Story SSE streaming, image behavior, TTS routing/playback, feedback rollback semantics, CSA app transactions, or atomic Commit.

Do not call live Story, Extract, Commit, Reset, Feedback, or TTS endpoints. Do not write to Supabase during implementation or testing.

## 3. Confirmed production evidence: counters still fail after `a09018e`

Current production game:

- game ID: `9ed5b835-9948-4cad-ac25-3ebff7348574`
- current turn: `215`
- current main NPC: `heroine4` / 배수진

Turn 214 final Story and turn summary unambiguously completed an anal ejaculation into heroine4. The Story contains completed action wording equivalent to:

- the player inserts into the anus
- ejaculates deeply
- warm fluid fills the inside
- semen flows out afterward

Turn 214 summary likewise states that heroine4 experienced her first anal ejaculation.

Nevertheless the current raw save after turn 215 still contains for heroine4:

- `sexual_events: []`
- `sexual_history.anal_sex_count: 0`
- `sexual_history.player_ejaculation_count: 0`
- `sexual_history.anal_ejaculation_count: 0`
- top-level `player_ejaculation_count: 0`
- `has_received_player_ejaculation: false`

The same class of contradiction remains for heroine3 and heroine9: completed events exist in committed Story/history, but counters and ledgers are zero.

## 4. Exact cause: factual recording is still coupled to authorization metadata

The current architecture still makes the historical record depend on optional structured fields that the Extract model may omit independently:

- `sexual_resolution.completed === true`
- exact `sexual_resolution.completion_evidence`
- and/or a populated `sexual_events[]`

`resolveSynthesizedSexualEvents()` is not a true fallback because it also returns nothing unless:

- authorization is present,
- resolution is completed,
- completion evidence is present,
- and the evidence is an exact substring of Story.

Therefore the LLM can correctly understand the scene enough to write `turn_summary`, while leaving `sexual_resolution` or `sexual_events` empty. In that case the Worker records no event at all. The counter path is still indirectly coupled to CSA direction, execution-contract validation, and optional duplicate Extract fields.

That coupling is the design error.

Authorization answers: **was the action allowed and how should Story execute it?**

Relationship recording answers: **what completed event is visibly present in the final committed Story?**

These must be separate layers.

## 5. Required relationship-record architecture

### 5.1 One simple factual ledger

Use the existing Primary Extract call. Do not add another LLM call.

Keep or replace the current `sexual_events` output with one authoritative factual field. Preferred shape:

```json
{
  "sexual_record_events": [
    {
      "character_id": "heroine4",
      "type": "anal_ejaculation",
      "completed": true,
      "evidence": "final Story verbatim evidence"
    }
  ]
}
```

Allowed types:

- `vaginal_penetration`
- `anal_penetration`
- `oral_sex`
- `npc_orgasm`
- `player_orgasm`
- `vaginal_ejaculation`
- `anal_ejaculation`
- `oral_ejaculation`
- `facial_ejaculation`
- `body_ejaculation`
- `unspecified_ejaculation`

The model instruction must be direct:

- Read only the final Story.
- Report every newly completed record event in this turn.
- Do not report plans, attempts, ongoing-but-not-completed states, remembered past events, dialogue claims, or the player's requested input by itself.
- Use the registered NPC who physically received/performed the completed event.
- Evidence must be copied from final Story.

### 5.2 Recording validation is factual, not authorization validation

An event ledger row is accepted when all of the following are true:

- type is in the finite enum
- `completed === true`
- character is a registered NPC
- character is actually present or is unambiguously the attributed registered NPC in the final Story
- evidence exists verbatim in final Story
- the evidence sentence/context is not planned, hypothetical, interrupted, negated, remembered past history, or merely “about to”
- location-specific events have matching location evidence

Do **not** require any of the following for historical counting:

- `sexual_resolution.completed`
- `sexual_resolution.completion_evidence`
- CSA route
- CSA direction
- CSA trigger evaluation
- execution-contract authority mode
- consent status
- same-turn base event

Those remain relevant to Story authorization and integrity. They must not erase a factual record after the final Story visibly completed the event.

CSA integrity stripping may neutralize disputed authorization fields, but must not delete a separately validated factual `sexual_record_events` ledger.

### 5.3 Narrow deterministic fallback

The LLM is primary, but it has already proven capable of omitting one optional JSON field while correctly summarizing the same event. Therefore add a deterministic fallback for only obvious completed events in final Story.

Fallback rules:

- Scan the final Story, not player input.
- Require the current registered NPC name or a uniquely attributed current-NPC segment.
- Require clear completed-action wording.
- Exclude plans, wishes, attempts, “직전”, interruption, negation, prior-memory narration, and dialogue that merely discusses an event.
- Use exact location words for vaginal versus anal ejaculation.
- Never infer facial/body/oral location without explicit wording.
- Never create more than one ejaculation event for one physical ejaculation in one turn.
- The fallback creates the same normalized ledger row as Extract, then goes through the same dedupe and counter path.

Turn 214 heroine4 must deterministically produce exactly:

- one `anal_ejaculation`
- umbrella `player_ejaculation_count +1`
- `anal_ejaculation_count +1`
- no vaginal ejaculation
- no duplicate unspecified ejaculation

### 5.4 Atomic counters and event IDs

Every accepted record event gets one deterministic ID:

`turn:<turnNumber>:<characterId>:<eventType>`

If multiple genuinely distinct same-type events can occur in one turn, add a stable evidence hash/index. Do not use model-generated IDs.

Deduplicate across:

- Extract row versus deterministic fallback
- generic versus location-specific ejaculation
- Commit retry/replay
- duplicated Extract rows
- next-turn self-heal

Apply accepted events atomically:

For penetration:

- increment the matching nested counter once
- set matching first-turn field when null
- set `has_had_sex_with_player = true`
- set `intimate_info_unlocked = true`

For NPC orgasm:

- increment nested and top-level NPC orgasm counters once
- set `has_had_sex_with_player = true`
- set `intimate_info_unlocked = true`

For location-specific player ejaculation:

- increment the matching location counter once
- increment umbrella `player_ejaculation_count` once
- mirror top-level `player_ejaculation_count`
- set `has_received_player_ejaculation = true`
- set `has_had_sex_with_player = true`
- set `intimate_info_unlocked = true`

`relationship_memory_patch` must be generated/filtered from the accepted factual ledger result so memory and counters cannot disagree.

### 5.5 Existing broken production records self-heal without direct DB edits

Do not manually update production saves.

On each ordinary context/commit path, use the already loaded recent committed memories to reconstruct missing minimum facts when the save ledger/counter is zero.

Use committed memory metadata:

- turn number
- character ID
- final narrative text
- turn summary

Reconstruct only high-confidence events with deterministic IDs. Fold them into the same ledger/counter normalizer. Do not count duplicate mentions in narrative and summary twice.

Required current fixtures:

- heroine4 turn 190: minimum vaginal penetration record
- heroine4 turn 206: minimum NPC orgasm record
- heroine4 turn 207: minimum vaginal ejaculation record and second NPC orgasm only if the final Story independently completes it
- heroine4 turn 211: minimum anal penetration record
- heroine4 turn 214: minimum anal ejaculation record
- heroine3 turn 168/183: anal penetration and completed orgasm as supported by final committed Story
- heroine9 turn 133/145: vaginal penetration and vaginal ejaculation as supported by final committed Story

This self-heal must be idempotent and persist only during the next normal valid Commit. A read-only public context may display compatibility minima immediately, but no standalone repair endpoint or direct SQL update is allowed.

## 6. Hospital address contract

### 6.1 Existing master truth

The master already contains `rulebook_address`, including:

- nurse ↔ nurse: given name + `쌤`
- ordinary nurse → head nurse: `수간호사님`
- nurse/staff → ordinary doctor: `선생님`
- department-head doctor: `교수님` or formal department-head title
- all staff → hospital director: `원장님`

However individual character objects currently do not contain populated:

- `formal_title`
- `peer_address`
- `superior_address`
- `player_honorific`

The Worker currently injects only a short general address fallback every turn and the detailed rulebook periodically. This leaves multi-NPC dialogue too dependent on free LLM inference.

### 6.2 Deterministic NPC-to-NPC address matrix

Build an authoritative address matrix for the registered NPCs currently present in the scene and inject it every Story turn near the end of the system prompt.

Derive role/rank from existing master fields such as `소속`, without changing master data.

Strict defaults:

- ordinary nurse → ordinary nurse: Korean given name without surname + `쌤`
  - 배수진 → 최유리: `유리쌤`
  - 최유리 → 배수진: `수진쌤`
  - 배수진 → 박소현: `소현쌤`
- ordinary nurse → head nurse: `수간호사님`
- staff/nurse → department-head doctor:
  - 서지아: `서 교수님`
  - 한세아: `한 교수님`
- staff → hospital director: `원장님`
- if master later supplies individual `formal_title`, `peer_address`, or `superior_address`, that explicit field wins over derived defaults

Do not let friendliness, sexual context, CSA, or relationship growth silently replace these workplace addresses. A deliberate saved address override is required.

This is prompt authority, not a Story hard-failure validator. Do not add a broad Korean-language post-Story rejection gate.

### 6.3 Persistent NPC-to-player address overrides

Add a save field such as:

```json
{
  "npc_player_address_overrides": {
    "heroine4": {
      "address": "오빠",
      "source": "player_request",
      "set_turn": 216
    }
  }
}
```

Use the existing Primary Extract call to return:

```json
{
  "address_updates": [
    {
      "speaker_id": "heroine4",
      "target_type": "player",
      "operation": "set",
      "address": "오빠",
      "scope": "persistent",
      "evidence": "앞으로 오빠라고 불러"
    }
  ]
}
```

Supported behavior:

- `앞으로 오빠라고 불러` → persistent set for the explicitly addressed NPC
- `유리랑 수진이는 앞으로 오빠라고 불러` → set for both resolved registered NPCs
- `이번에만 오빠라고 불러` → current-turn Story instruction only, no persistent save change
- `다시 감사관님이라고 불러` → set explicit new value or clear override back to default
- unspecified target → apply only to the current main NPC when context is unambiguous; otherwise ignore the update without failing the turn

Validation:

- speaker is a registered NPC
- target is player
- evidence exists in player input
- address is a short non-empty plain-text term after trimming quotes/punctuation
- unknown/malformed updates are ignored field-locally
- never fail Story or Commit because an address update is invalid

The active Story address contract must include both:

- NPC-to-NPC workplace addresses
- each current NPC's resolved player address: persistent override first, otherwise existing default/title behavior

NPC-to-NPC workplace address and NPC-to-player personal address are independent.

## 7. Draft input during Extract and Commit

### 7.1 Required user behavior

Current `ui.setLoading(true)` disables both the text input and send button for Story, Extract, and Commit. The user must be able to prepare the next action while `상태 분석 중` and `턴 저장 중` are displayed.

Required phases:

- `story`: current behavior may keep the text field disabled
- `extract`: text field enabled, send button disabled
- `commit`: text field enabled, send button disabled
- `idle`: text field and send button enabled immediately after successful Commit
- `blocked_failure`: preserve the draft, but keep submission disabled until retry/discard/restore resolves

The draft typed during Extract/Commit must not be cleared by:

- loading label changes
- sidebar re-render / repeated `ui.init()`
- context refresh after Commit
- image/TTS preparation
- rendering new choices

Pressing Enter while Extract/Commit is still running must not submit a second turn and must not clear the draft. Prevent submission and leave the text untouched.

When Commit finishes:

- enable submission immediately
- keep the prepared draft exactly as typed
- do not automatically send it
- choices and direct input now compete normally; whichever the user intentionally submits first wins

### 7.2 Implementation direction

Separate `input editable` from `turn submit allowed`.

Do not use one `active` boolean in `ui.setLoading()` to control both.

Preferred small API:

```js
ui.setTurnPhase('story' | 'extract' | 'commit' | 'idle' | 'blocked_failure')
```

or equivalent independent methods:

```js
ui.setChatDraftEditable(true|false)
ui.setTurnSubmissionEnabled(true|false)
```

`state.isStreaming` remains the authoritative duplicate-turn guard. The UI phase only changes editability and button state.

Do not weaken server turn-number conflict checks.

## 8. Deterministic tests

Add a new static/Node test script and update only superseded old assertions.

Required record tests:

1. Exact production turn-214 heroine4 Story creates exactly one `anal_ejaculation` factual event even when `sexual_resolution` and Extract `sexual_events` are empty.
2. Turn 214 increments anal and umbrella ejaculation counters once.
3. Turn 214 does not create vaginal or unspecified ejaculation.
4. Extract event plus fallback event dedupes to one.
5. Commit retry/replay does not increment twice.
6. Planned, desired, interrupted, negated, remembered, and “직전” wording does not count.
7. Player input alone does not count without final Story completion.
8. Turn 211 explicit first anal insertion self-heals minimum anal penetration 1.
9. Turn 207 explicit vaginal ejaculation self-heals once.
10. Turn 206 explicit NPC orgasm self-heals once.
11. heroine3 and heroine9 supplied production fixtures self-heal only supported event types.
12. relationship memory and counters derive from one accepted ledger result.
13. CSA integrity stripping cannot erase a separately factual accepted record event.
14. Existing authorization validation remains unchanged for Story execution.

Required address tests:

15. nurse-to-nurse uses given-name + `쌤` for every current pair.
16. ordinary nurse to head nurse uses `수간호사님`.
17. nurse/staff to 서지아/한세아 uses surname + `교수님`.
18. explicit master individual title fields override derived rules.
19. heroine4 explicit `앞으로 오빠라고 불러` persists `오빠` only for heroine4.
20. heroine3 remains on default player address when heroine4 alone changes.
21. multiple named NPCs can receive one override request.
22. `이번에만` does not persist.
23. clear/default restoration works.
24. malformed/ambiguous update is ignored without failing the turn.
25. Story prompt contains the resolved active address matrix every turn.

Required input tests:

26. Story phase disables draft editing as before.
27. Extract phase enables text editing but disables submission.
28. Commit phase enables text editing but disables submission.
29. Enter during Extract/Commit preserves draft and starts no second turn.
30. Successful Commit enables submission immediately and preserves draft.
31. sidebar/context/image/TTS/choice rendering does not clear draft.
32. blocked retry/discard state preserves draft but prevents submit.
33. `state.isStreaming` and server conflict protection still prevent duplicate turns.
34. mobile and desktop use identical phase behavior.

Regression requirements:

35. Story SSE direct streaming remains byte-for-byte behaviorally unchanged.
36. TTS manual replay fix from `a09018e` remains unchanged.
37. CSA physical/norm execution contract remains unchanged.
38. feedback rollback/restore remains unchanged.
39. image and choice rendering remains unchanged except chat editability state.
40. no additional LLM request is added.

Static checks:

```bash
node --check worker/game-proxy-v2.js
node --check pages/ui.js
node --check pages/state.js
# validate index.html inline script using the repository's existing method
git diff --check
```

## 9. Commit, push, and deployment

Target commit:

`fix: simplify relationship records and persist address rules`

Workflow:

1. Create `apply/fix-record-ledger-address-draft-input-20260801` from exact base `a09018e26b3c0092d195edb69da324c9dcbd0ff5`.
2. Implement and run deterministic/static tests only.
3. Re-fetch origin immediately before push.
4. Confirm `origin/feature/csa-only` is still exact base.
5. Push implementation branch.
6. Fast-forward `feature/csa-only` only.
7. No force push, reset, rebase, or merge commit.
8. Deploy `game-proxy-v2` and `gamebuilder-v2` because Worker and frontend change.
9. Never create or deploy deleted `game-builder-v2`.
10. Verify `/api/version` and GET-only reachability for production/external/E2E play URLs.
11. Do not click choices or submit gameplay input.

## 10. Final report

Report:

- starting SHA
- final SHA
- commit message
- changed files
- exact counter failure cause and simplified factual-ledger fix
- production fixture outcomes for turns 206, 207, 211, and 214
- address matrix and saved override behavior
- Extract/Commit draft-input behavior
- deterministic test counts and static checks
- API and frontend Worker version IDs/tags
- `/api/version` result
- DB/RPC/migration/direct-save changes: none
- live gameplay/TTS endpoint calls: none

Include this exact line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
