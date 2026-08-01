# Sexual records · TTS replay · unrestricted vocal output hotfix

## 1. Immutable base and workflow

- Repository: `zeroslove-ai/py-all`
- Production branch: `feature/csa-only`
- Exact production base:
  `77796d28699588ce834430341746fa4611dfc0c9`
- Base commit:
  `fix: preserve npc canon records and expand vocal reactions`
- Handoff branch:
  `handoff/fix-sexual-records-tts-unrestricted-vocals-20260801`
- Implementation branch to create:
  `apply/fix-sexual-records-tts-unrestricted-vocals-20260801`

Read this document from the handoff branch, then create the implementation branch from the exact production SHA. Do not implement on the handoff branch.

Before editing and immediately before pushing, fetch origin and verify that `origin/feature/csa-only` is still exactly the base SHA. If it moved, stop and report the new SHA. No rebase, reset, force push, or merge commit.

## 2. Confirmed production state

Current production save:

- game: `9ed5b835-9948-4cad-ac25-3ebff7348574`
- current turn: `202`
- current main NPC: `heroine4` / 배수진
- present NPCs: heroine4, heroine3, heroine9

### 2.1 Sexual record failure is reproduced

The final Story clearly completed all of the following:

- heroine4 first vaginal penetration around turns 188–190
- heroine4 orgasm at turn 192
- heroine4 vaginal ejaculation receipt at turn 196
- heroine3 anal penetration and orgasm/anal ejaculation at turn 183
- heroine9 vaginal penetration and vaginal ejaculation in earlier turns

But current raw save still shows for heroine4:

- `sexual_events: []`
- `sexual_history.vaginal_sex_count: 0`
- `sexual_history.npc_orgasm_count: 0`
- `sexual_history.player_ejaculation_count: 0`
- `sexual_history.vaginal_ejaculation_count: 0`
- top-level `npc_orgasm_count: 0`
- top-level `player_ejaculation_count: 0`
- `has_received_player_ejaculation: false`

The relationship memory does contain completed-event sentences, including the turn-196 vaginal ejaculation, so the save is internally contradictory.

### 2.2 Exact architectural cause

The previous hotfix fixed `applySexualEvents()` only after a structured sexual completion reaches it. In production, the relevant `sexual_resolution` and `sexual_events` are being stripped before record application.

Current active CSA `csa_111_2` has normative semantics:

- CSA actor group: `everyone_in_hospital`
- CSA target group: `player`
- required action: `prioritize_player_sexual_relief`
- normative direction: NPC/group → player

Current player-initiated choices are structurally classified as:

- physical actor: `player`
- physical target: current NPC, e.g. `heroine4`
- physical direction: `player_to_npc`
- action: `penetration`

`resolveStructuredCsaDirectCoverage()` has a reverse-match exception for this authority case, so choice routing becomes `csa_direct`. However it returns only the CSA's normative actor/target groups. The later execution/validation pipeline still treats the CSA's normative direction as the physical action direction.

Therefore:

1. choice routing authorizes the player-initiated action;
2. Story writes player → NPC penetration;
3. Extract returns player → NPC sexual resolution/events;
4. `validateCsaDirectResolution()` compares that physical direction against the CSA's normative NPC → player direction;
5. semantic mismatch triggers field-level stripping;
6. Story commits, but `sexual_resolution` and `sexual_events` are empty by the time `applySexualEvents()` runs;
7. opening/orgasm/ejaculation counters never increment.

This is not primarily an `applySexualEvents()` counter bug anymore. It is a mismatch between:

- the **physical execution contract**, and
- the **CSA normative compliance contract**.

### 2.3 Current legacy compatibility layer is too coarse

`resolveRelationshipCompatibilityFacts()` currently returns zero compatibility facts whenever any structured intimacy flag/counter is already positive.

That fails for partially broken saves such as heroine4:

- `has_had_sex_with_player: true`
- `intimate_info_unlocked: true`
- but vaginal opening, orgasm, and ejaculation counters are still zero.

Compatibility must be evaluated per field, not all-or-nothing.

### 2.4 TTS manual replay bug

Current `pages/tts.js` has two direct playback problems.

1. Replay while voice toggle is OFF:
   - replay click calls `enqueueLines(..., {force:true})`;
   - jobs are queued;
   - `drain()` discards every job when `state.autoTts === false`;
   - pressing replay can visibly do nothing.

2. Mobile user-gesture loss:
   - replay click calls `unlockAudio()`;
   - it resumes an `AudioContext`, but does not prime the real `<audio>` element;
   - it then awaits a network TTS request;
   - `audio.play()` happens after the click activation window is gone;
   - Android/browser autoplay policy can reject playback even though the user explicitly pressed replay.

Also, replay stores only the last batch and regenerates it every time instead of immediately replaying a successfully generated URL.

## 3. Required architecture fix: separate physical execution from CSA normative compliance

Do not weaken authorization and do not restore broad free-text trust.

Introduce one immutable execution contract shape that explicitly separates two layers.

Suggested shape:

```js
{
  route: 'csa_direct',
  action: 'penetration',
  csa_id: 'csa_111_2',

  // What physically happens in Story
  physical_actor_type: 'player',
  physical_actor_character_id: null,
  physical_target_type: 'npc',
  physical_target_character_id: 'heroine4',
  physical_direction: 'player_to_npc',

  // Why the CSA authorizes/complies
  authority_mode: 'player_acts_on_compliant_npc',
  norm_actor_character_id: 'heroine4',
  norm_actor_group: 'everyone_in_hospital',
  norm_target_type: 'player',
  norm_target_group: 'player'
}
```

Exact field names may differ, but these distinctions must exist structurally and be preserved unchanged across Story, Extract, and final validation.

### 3.1 Reverse authority match

For the existing strong authority allowlist only:

- `treat_player_sexual_request_as_order`
- `prioritize_player_sexual_relief`
- `designated_staff_complies_immediately`
- `perform_designated_position_efficiently`
- `multi_staff_collaborate_on_request`
- `sex_with_player_is_duty`
- `treat_player_sexual_conduct_as_authority`

When structured meta says player physically acts on a present eligible NPC:

- physical actor remains player;
- physical target remains that NPC;
- physical direction remains `player_to_npc`;
- the target NPC is separately recorded as the CSA-compliant norm actor;
- the player is separately recorded as the CSA beneficiary/norm target.

Never rewrite the physical actor into the NPC merely to satisfy the CSA's normative actor group.

### 3.2 Shared contract

The same immutable object must be used by:

- selected choice fact injection into Story;
- direct-text pre-Story policy when an exact strong-authority match is available;
- Extract `[SELECTED EXECUTION CONTRACT]` or equivalent;
- `sexual_resolution` validation;
- CSA trigger evaluation validation;
- sexual-event record application.

No stage may independently reinterpret the Korean sentence into a different actor/target/direction.

### 3.3 Validation rules for authority mode

For `authority_mode === 'player_acts_on_compliant_npc'`:

- physical resolution must be `player_to_npc`;
- physical target must be the current present registered NPC;
- that NPC must satisfy the active CSA actor group;
- CSA target group must resolve to player;
- action must be included in the active CSA semantic contract;
- CSA must have `sexual_authorization === true` and `direct_execution === true`;
- required action must be in the narrow authority allowlist;
- completion evidence must still exist in final Story;
- unknown CSA IDs, absent NPCs, unsupported actions, or participant mismatch remain invalid.

Do not require the physical direction to equal the CSA normative direction in this authority mode. Instead validate physical and normative participants against their own contract fields.

Trigger evaluations should also distinguish:

- physical action direction, and
- norm-compliance actor/beneficiary.

Do not force one field to represent both.

### 3.4 Direct text parity

The fix must work for both:

- choice buttons with `last_choice_structured_meta`, and
- explicit direct-text inputs such as player → NPC penetration, orgasm, or ejaculation continuation.

Direct text may use the existing deterministic classifier only as a legacy/action signal. Authorization still comes from the active CSA semantic contract and resolved participants.

A direct-text turn under the exact strong authority contract must produce the same immutable authority execution contract as an equivalent structured choice.

## 4. Sexual records must not depend on a perfect optional event array

After authorization is corrected, keep `sexual_events` as the primary structured event input, but add deterministic fail-open synthesis for missing event rows.

### 4.1 Synthesize only from validated structured completion

When all of the following are true:

- execution contract is valid;
- `sexual_resolution.completed === true`;
- physical participants match the current NPC;
- exact completion evidence exists in final Story;
- evidence is not a plan, attempt, hypothetical, negation, interruption, or “just before” state;

then Worker may synthesize a missing event that is directly implied by the validated resolution/evidence.

Supported synthesis:

- explicit vaginal penetration completion → `vaginal_penetration`
- explicit anal penetration completion → `anal_penetration`
- explicit oral completion → `oral_sex`
- explicit completed NPC orgasm → `npc_orgasm`
- explicit completed vaginal ejaculation → `vaginal_ejaculation`
- explicit completed anal ejaculation → `anal_ejaculation`
- explicit completed oral/facial/body ejaculation → matching exact type

Do not infer location when Story does not state it.
Do not synthesize from player input alone.
Do not synthesize from relationship memory alone for the current event.
Do not synthesize an orgasm from moaning, arousal, shaking, or high arousal stats.

### 4.2 Event deduplication

One physical completion must increment once even when reported through several routes:

- Extract sexual event
- synthesized fallback event
- generic + location-specific ejaculation
- duplicate evidence strings
- retry/replay of an already committed turn

Use a canonical per-turn key containing at least:

- turn
- character
- canonical event type
- normalized completion evidence or stable event ordinal

Specific ejaculation type wins over generic player ejaculation.

### 4.3 Atomic normalized relationship update

For accepted vaginal penetration:

- `vaginal_sex_count += 1`
- set `first_vaginal_turn` if absent
- `has_had_sex_with_player = true`
- `intimate_info_unlocked = true`

For accepted anal penetration:

- `anal_sex_count += 1`
- set `first_anal_turn` if absent
- same relationship/unlock flags

For accepted NPC orgasm:

- nested and top-level NPC orgasm counters synchronized
- relationship/unlock flags true

For accepted location-specific ejaculation:

- matching location counter += 1
- umbrella `player_ejaculation_count += 1`
- nested/top-level umbrella counters synchronized
- `has_received_player_ejaculation = true`
- `has_had_sex_with_player = true`
- `intimate_info_unlocked = true`

All of these must be produced from one normalized relationship result and committed atomically.

## 5. Per-field compatibility and self-heal for already broken saves

Do not directly edit Supabase and do not add a migration or repair endpoint.

Replace the all-or-nothing compatibility check with per-field minimum recovery.

For each field independently:

- if structured vaginal count is zero and an unambiguous stored completed vaginal penetration memory exists, derive minimum `vaginal_sex_count = 1`;
- if structured anal count is zero and explicit completed anal penetration memory exists, derive minimum `anal_sex_count = 1`;
- if structured NPC orgasm count is zero and explicit completed NPC orgasm memory exists, derive minimum `npc_orgasm_count = 1`;
- if structured player ejaculation count/location count is zero and explicit completed location-specific ejaculation memory exists, derive minimum 1 for the umbrella and exact location;
- positive unrelated flags must not block recovery of a missing counter;
- duplicate memory sentences still imply only minimum 1;
- use the earliest reliable memory turn as `first_vaginal_turn` / `first_anal_turn` when missing;
- planned, attempted, interrupted, negated, hypothetical, “직전”, and ambiguous memories do not count.

Apply these minimums to:

- public relationship display;
- private-info unlock;
- prompt relationship facts;
- `emptySexualHistory()` / normalization input;
- next ordinary valid commit self-heal.

The next normal commit for heroine4 must persist at least:

- vaginal sex count 1
- NPC orgasm count 1
- player ejaculation count 1
- vaginal ejaculation count 1

based on the existing unambiguous completed memories, without counting each repeated sentence as another event.

Equivalent minimum recovery must work for heroine3 and heroine9.

## 6. Remove creative restrictions on moans and vocal reactions

The user explicitly wants the creative restrictions removed because output is still too sparse.

### 6.1 Remove all numeric caps and quotas

Delete the current `2+ / 3–5 / 4–7` target language.

Do not impose:

- maximum number of vocal reactions;
- minimum spacing between them;
- one reaction per paragraph;
- one use per syllable/root;
- a fixed ratio of normal dialogue to moans;
- a ban on consecutive vocal-reaction lines;
- a ban on repeated short syllables;
- a ban on long or broken vocalizations as a creative rule.

### 6.2 New permissive Story guidance

During actual direct sexual stimulation:

- vocal reactions may be as frequent, repetitive, fragmented, or dominant as the scene naturally supports;
- write the actual vocalizations instead of summarizing them only as “신음이 흘러나왔다”;
- multiple consecutive moan-only utterances are allowed;
- repeated roots and syllables are allowed;
- broken words, incomplete sentences, breath sounds, cries, and post-climax residual sounds are allowed;
- intensity may escalate freely with the actual scene;
- master `신음타입` and A/B/C fallback are flavor references only, never caps or mandatory restraint patterns;
- anti-repetition rules do not apply to moans, breath sounds, cries, or fragmented vocal reactions at all.

### 6.3 Keep only structural/safety separations

Do not add any creative suppression, but preserve these non-negotiable separations:

- direct vocalization must remain parseable with speaker name and stage direction so TTS can identify it;
- only the NPC actually being stimulated vocalizes as such;
- moans do not prove consent, affection, orgasm, CSA acceptance, or a relationship-stat increase;
- orgasm counters still require explicit completed-orgasm evidence;
- narrator text and other NPC dialogue remain distinguishable.

The global `..` formatting contract may remain for renderer consistency, but it must not be used to reduce the number or length of vocal reactions.

Remove Story-prompt wording that tells the model to avoid long repeated vowels or singing-like delivery. Audio-specific cleanup belongs only in TTS normalization, not in Story generation.

## 7. TTS manual replay and mobile playback fix

Expected frontend file:

- `pages/tts.js`

Possible API file only if genuinely needed:

- `worker/game-proxy-v2.js`

### 7.1 Manual replay must bypass auto mode

A user pressing replay is an explicit manual playback request.

- Add a `manual` flag to replay jobs.
- `drain()` and `play()` must allow manual jobs even when `state.autoTts === false`.
- Voice OFF means “do not autoplay future dialogue”, not “disable the replay button”.
- Pressing replay while OFF must play once without turning auto mode ON.

### 7.2 Prime the actual media element inside the click gesture

`unlockAudio()` must unlock/prime the real `<audio id="audio-player">`, not only an `AudioContext`.

Use a safe browser-compatible approach such as:

- immediately play a tiny silent data/blob source in the replay click handler, then pause/reset it; or
- another deterministic media-element priming method that executes before awaiting network work.

Do this only on explicit user interaction.

### 7.3 Cache last successful audio result

After successful TTS generation, cache at least:

- last batch identity/key
- audio URL
- text/voice metadata

Replay behavior:

1. If a valid cached URL exists, play it immediately from the click handler.
2. If it fails or is absent/expired, regenerate once and play.
3. Do not silently discard the request.
4. Show a visible status for generation, loading, blocked playback, decode failure, or expired URL.

### 7.4 Robust playback lifecycle

- Call `audio.load()` after assigning a new source.
- Wait for `canplay`/`loadeddata` or a bounded timeout before playback when needed.
- Handle `NotAllowedError`, `MediaError`, `stalled`, and `abort` distinctly.
- Re-resolve the live audio element before playback as current code already does.
- Do not let TTS failure block the game.
- Preserve same-speaker batching unless it directly prevents replay.
- Do not change voice IDs or TTS Worker routing without evidence.

## 8. Required deterministic tests

No live Story/Extract/Commit/Reset/Feedback/TTS API calls.
No Supabase writes.

### 8.1 Execution contract and records

1. Choice structured meta `actor=player,target=heroine4,action=penetration` under active csa_111_2 produces authority mode with physical direction `player_to_npc` and normative actor heroine4/beneficiary player.
2. The same action through direct text produces the same contract.
3. Final validation accepts that physical direction under the narrow strong-authority mode.
4. Ordinary weak/medium CSA cannot use this reverse authority exception.
5. Unsupported action, absent NPC, unknown CSA ID, or wrong group remains invalid.
6. Valid vaginal penetration with missing `sexual_events` row synthesizes one vaginal event.
7. Valid completed NPC orgasm with missing row synthesizes one orgasm event.
8. Valid completed vaginal ejaculation with missing row synthesizes one vaginal ejaculation and one umbrella player ejaculation.
9. “사정 직전”, “싸려고 한다”, interrupted, negated, hypothetical, or input-only declarations synthesize nothing.
10. Explicit anal completion never increments vaginal counters and vice versa.
11. Duplicate Extract + synthesized event counts once.
12. Generic + specific ejaculation counts once, using the specific location.
13. Existing field-level integrity stripping still removes truly invalid structured fields without failing the whole turn.

### 8.2 Broken-save compatibility

14. Current heroine4 raw snapshot derives minimum vaginal sex 1, NPC orgasm 1, vaginal ejaculation 1, player ejaculation 1 despite `has_had_sex_with_player=true` already being present.
15. Current heroine3 snapshot derives minimum anal sex/orgasm/anal ejaculation from its explicit completed memories, without duplicate inflation.
16. Current heroine9 snapshot derives minimum vaginal sex/vaginal ejaculation/player ejaculation.
17. Earliest reliable memory turn populates missing first opening turn.
18. Planned/interrupted memories do not recover a counter.
19. Next normal normalization persists compatibility minimums without incrementing them again.

### 8.3 Vocal prompt

20. No numeric moan limits or target ranges remain.
21. Anti-repetition explicitly excludes vocal reactions completely.
22. Consecutive/repeated/fragmented/moan-only lines are explicitly allowed.
23. Master vocal type is flavor only, not a restraint cap.
24. No vocal count validator, hard failure, Story rewrite, or extra LLM call is added.

### 8.4 TTS

25. Replay while auto TTS OFF queues and plays one manual job.
26. Auto OFF still suppresses future autoplay jobs.
27. Explicit replay primes the actual audio element before network await.
28. Cached URL is replayed immediately when valid.
29. Expired/failed cached URL regenerates once.
30. Playback and generation errors remain visible and never block gameplay.
31. Existing batching and speaker extraction remain functional.

Static checks:

```bash
node --check worker/game-proxy-v2.js
node --check pages/tts.js
git diff --check
```

Run existing regression scripts as well.

## 9. Files and deployment

Expected changed files:

- `worker/game-proxy-v2.js`
- `pages/tts.js`
- `docs/project_v2/CSA_ONLY_BRANCH.md`

`pages/index.html` should change only if media-element priming requires a justified markup adjustment. Avoid unrelated frontend edits.

Target commit:

`fix: align authority records and restore manual tts playback`

Deployment:

- deploy `game-proxy-v2`
- deploy `gamebuilder-v2` because `pages/tts.js` changes
- never create/deploy deleted `game-builder-v2`

Verify:

- `/api/version` final API SHA/tag
- three play URLs GET 200
- frontend deployed version/asset reflects new `tts.js`
- no gameplay input or choice clicking by the agent

## 10. Final report

Report:

- starting SHA
- final SHA
- commit
- changed files
- exact execution-contract mismatch and correction
- synthesized-event/backfill behavior
- per-field compatibility behavior for heroine3/4/9
- unrestricted vocal-prompt changes
- TTS replay/mobile gesture fix
- deterministic test totals
- API Worker version ID/tag
- frontend Worker version ID/tag
- DB/RPC/migration/save/turn writes: none
- live gameplay/TTS endpoint calls: none

Include exactly:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
