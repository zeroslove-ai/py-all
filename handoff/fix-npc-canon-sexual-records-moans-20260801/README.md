# NPC canon · sexual records · vocal reaction hotfix handoff

## 1. Repository and immutable base

- Repository: `zeroslove-ai/py-all`
- Production branch: `feature/csa-only`
- Exact production base at handoff creation:
  `b72d95b8c16aa40ee121d9b7e042a43a1603af1a`
- Base commit:
  `fix: honor player initiated csa choices and compact labels`
- Handoff branch:
  `handoff/fix-npc-canon-sexual-records-moans-20260801`
- Implementation branch to create from the exact production base:
  `apply/fix-npc-canon-sexual-records-moans-20260801`

Before editing, fetch origin and verify that `origin/feature/csa-only` is still exactly the base SHA above. If it moved, stop without rebasing, resetting, merging, or force-pushing and report the new SHA.

Do not implement on the handoff branch. Read this document, then create the implementation branch from the exact production base.

## 2. Scope

This is one API Worker hotfix containing three related fixes:

1. Prevent registered NPC master canon from being misread as sexual inexperience.
2. Correct completed ejaculation/orgasm records, counters, relationship flags, and intimate-info unlocks when the base sexual action began in a prior turn.
3. Relax the overly sparse moan/vocal-reaction prompt while preserving character-specific style, dialogue format, punctuation, TTS safety, and narrative quality.

Expected runtime file:

- `worker/game-proxy-v2.js`

Expected documentation file:

- `docs/project_v2/CSA_ONLY_BRANCH.md`

Frontend files should remain byte-identical. Do not modify Supabase schema, RPCs, migrations, game data, saves, turns, TTS routing, `pages/stream.js`, or any live gameplay endpoint behavior outside this narrow scope.

## 3. Confirmed production evidence

### 3.1 최유리 canon drift

The registered master data for `heroine3` / 최유리 contains:

- `과거남자경험: 3`
- `과거오르가즘경험: 5`
- current relationship: single

Recent Story output nevertheless framed her as generally inexperienced through unscoped phrases such as “처음이잖아”, “처음이니까”, “낯선 감각”, and repeated “서툴다” framing. “플레이어와 병원 업무로 하는 것은 처음” can be valid only when the scope is explicit. The scene as a whole must not imply that she has no prior sexual experience.

The master data is present. This is a Story prompt/canon-interpretation failure, not missing DB data.

### 3.2 박소현 ejaculation record loss

For `heroine9` / 박소현, stored turn 145 Story and relationship memory explicitly record completed vaginal ejaculation. However the current relationship state remains:

- top-level `player_ejaculation_count: 0`
- nested `sexual_history.player_ejaculation_count: 0`
- nested `sexual_history.vaginal_ejaculation_count: 0`
- `has_received_player_ejaculation: false`
- `has_had_sex_with_player: false`
- `intimate_info_unlocked: false`

The direct cause is the active `applySexualEvents()` path. Ejaculation/orgasm events are currently discarded when `baseEvents.length === 0`, even when the compatible authorized penetration/oral action began in a previous turn and the current Story plus structured resolution confirm completion.

The relationship-memory patch can survive while the event/counter is rejected, creating contradictory state: narrative memory says the event happened, while counters and unlock flags remain zero/false.

### 3.3 Current moan rule is too weak

`buildMoanVocalReactionSection()` currently gives only broad qualitative guidance and no output-density target. Combined with the general anti-repetition contract, the model often emits one or zero short vocal reactions even during sustained stimulation.

The fix must increase quantity and variety through prompt guidance only. Do not add a hard validator, minimum-count gate, Story rejection, post-stream rewrite, or extra LLM call.

## 4. NPC canon implementation requirements

Keep the existing author-only dossier architecture and relevant-NPC selection. Strengthen the final recency-priority system instruction produced by `buildRelevantNpcCanonSection()` and/or the dossier interpretation rules.

### 4.1 Canonical experience rules

For every relevant registered NPC, not only `last_character_id`:

- If canonical `과거남자경험` is greater than zero, do not describe the NPC with unscoped claims equivalent to:
  - first sexual experience
  - no experience
  - virgin/inexperienced
  - never having touched or seen a man
  - the overall sexual sensation being categorically unfamiliar
- If canonical `과거오르가즘경험` is greater than zero, do not claim the NPC has never climaxed or does not know what climax feels like.
- Do not infer that a positive partner count proves experience with every specific act, technique, partner type, or situation.
- When an act-specific history is not stored, do not invent either “experienced” or “first time”. Remain neutral.
- A scoped first-time statement is allowed only when the scope is explicit and supported, for example:
  - first time with the player
  - first time under the hospital-duty framing
  - first time performing an explicitly identified act, only if stored facts support that claim
- Shyness, awkwardness, embarrassment, or poor technique can still occur, but must not be justified by false general inexperience.
- If the player states a false premise such as “너 처음이지?”, the NPC/narrator must not confirm it as fact. Answer from canon, naturally correct it, or clearly narrow the meaning.
- Another NPC must not assert a contradictory fact about the target NPC merely because the target is not the current main NPC.

### 4.2 Narrow conflict cleanup

Preserve the existing fail-open policy:

- No Story hard failure.
- No second Story call.
- No repair LLM.
- No post-stream narrative rewrite.

Extend `detectNpcCanonConflict()` / related field cleanup only where useful for Extract-owned fields such as `npc_emotion`, `turn_summary`, and `relationship_memory_patch`. It must remain a narrow direct-contradiction filter, not a broad Korean semantic gate.

The primary prevention mechanism is the late, authoritative relevant-NPC canon system message.

## 5. Sexual event and relationship-record implementation requirements

### 5.1 Compatible completion authorization

Refactor the active `applySexualEvents()` path so a completion event does not require a newly emitted same-turn base event when an exact compatible structured authorization already exists.

A completion event can be accepted when either:

1. A compatible base event was accepted in the same turn, or
2. All of the following are true:
   - current `sexualAuthorization.authorized === true`
   - current `sexualResolution.completed === true`
   - resolution is for the current registered NPC and current scene participants
   - authorized action is compatible with the completion event
   - completion evidence exists verbatim in the final Story under the existing evidence rules
   - the event is not an attempt, plan, hypothetical, interruption, denial, or “just before” state

Compatibility:

- `vaginal_ejaculation` requires authorized `penetration` and vaginal completion evidence.
- `anal_ejaculation` requires authorized `penetration` and anal completion evidence.
- `oral_ejaculation` requires authorized `oral`.
- `facial_ejaculation`, `body_ejaculation`, and `unspecified_ejaculation` require a currently authorized sexual base action plus exact completion/location evidence; do not infer a location absent from Story.
- `npc_orgasm` requires an authorized current sexual action and exact completed-orgasm evidence.
- A generic `player_ejaculation` event must not double-count a location-specific ejaculation in the same turn.

Do not restore natural-language authorization. The structured resolution/authorization remains authoritative; textual evidence only proves that the authorized completion actually appeared in Story.

### 5.2 Atomic relationship update

For every accepted event, keep the existing event-ID deduplication and ensure all related fields update together in the same save patch.

For accepted vaginal ejaculation, at minimum:

- `sexual_history.player_ejaculation_count += 1`
- `sexual_history.vaginal_ejaculation_count += 1`
- top-level `player_ejaculation_count` mirrors the resulting nested value
- `has_received_player_ejaculation = true`
- `has_had_sex_with_player = true`
- `intimate_info_unlocked = true`
- one normalized sexual event is stored

For accepted NPC orgasm:

- nested and top-level NPC orgasm counters remain synchronized
- `has_had_sex_with_player = true`
- `intimate_info_unlocked = true`

Never increment twice for duplicate Extract events, generic-plus-specific duplicates, retry/replay of the same committed turn, or repeated relationship-memory sentences.

### 5.3 Relationship-memory consistency

A relationship-memory entry that asserts a completed ejaculation/orgasm must not survive as the sole positive record when the corresponding completion event was rejected.

Filter or downgrade such memory patches using the accepted-event result from the same request. Preserve unrelated valid relationship memories.

### 5.4 Read compatibility and current broken save

Do not issue a direct Supabase update and do not edit the current save manually.

Add a conservative read-compatibility layer for legacy/broken relationship shapes:

- Top-level and nested counters are both recognized; use the maximum valid value for public relationship-record display and unlock checks.
- If all structured counters/flags are zero but the NPC's own stored `relationship_memory` contains an unambiguous completed-event memory, derive only a minimum compatibility fact for display/unlock and the next normal save normalization:
  - explicit completed vaginal intercourse memory may imply minimum vaginal-sex experience 1
  - explicit completed vaginal-ejaculation receipt memory may imply minimum player-ejaculation 1 and vaginal-ejaculation 1
- Reject planning, “about to”, interrupted, hypothetical, negated, or desired-event wording.
- Multiple duplicate memories imply only a minimum of one, never a count per sentence.
- This compatibility path is not authorization and must never create a new event from current free text.
- On the next ordinary valid commit for that NPC, `normalizeRelationshipState()` may persist the compatibility minimums as a self-heal. No standalone migration or save-repair endpoint.

Use the exact current heroine9 snapshot in a deterministic test: it should read as at least one completed vaginal ejaculation, unlock intimate info, and not produce more than one inferred count.

### 5.5 Public record payload

`buildNpcRelationshipRecord()` must expose the maximum valid values across legacy top-level and nested `sexual_history` counters so the app does not display `0회` when the authoritative nested value is positive.

Keep private-info fields locked unless a legitimate structured counter/flag or the narrow legacy compatibility minimum exists.

## 6. Moan and vocal-reaction rule relaxation

Expand `buildMoanVocalReactionSection()` and clarify the interaction with `buildAntiRepetitionSection()`.

This is prompt guidance, not a validation gate.

### 6.1 Density targets

When direct sexual stimulation is actually continuing in the final scene:

- Main stimulated NPC: normally include at least 2 distinct vocal-reaction beats distributed across the scene.
- Strong sustained stimulation: normally 3–5 beats.
- Climax or immediate pre-climax: normally 4–7 beats, including short sounds, broken speech, breathing, and post-climax residual breathing where appropriate.
- Do not stack all reactions in one line; distribute them around actions and dialogue.
- Preserve meaningful dialogue. Vocal reactions supplement speech instead of replacing all dialogue.
- Mere nudity, observation, embarrassment, proximity, discussion, or light nonsexual contact does not trigger this density guidance.
- In multi-NPC scenes, only NPCs actually receiving direct stimulation get repeated moans. Observers may react verbally or physically but must not moan as though stimulated.

These are natural-generation targets. Never reject a turn because a numeric target was missed.

### 6.2 Diversity

Allow varied combinations appropriate to the character and intensity:

- short involuntary sounds
- breath-led reactions
- speech interrupted by physical reaction
- incomplete words at genuinely intense moments
- stronger or longer vocal reactions only as intensity rises
- residual breathing/recovery after climax instead of an immediate return to neutral speech

Do not copy a fixed sample string repeatedly. The same root syllable may recur with natural variation; only exact mechanical repetition is discouraged.

### 6.3 Character-specific style

Preserve master `신음타입` as the primary style seed, with the existing name fallback only when master lacks it.

Current fallback groups remain:

- A형 수치심 순응: 임수정, 배수진, 박소현
- B형 적극 쾌감: 최유리, 윤아름
- C형 의무+쾌감: 한소영, 강세라, 김지은, 서지아, 한세아

Rules:

- A형: suppression, embarrassment, broken restraint, and gradual loss of composure; do not erase conflict or imply consent from sound alone.
- B형: brighter and more openly pleasure-responsive, while staying within current relationship and authorization boundaries.
- C형: controlled duty/rationalization first, with vocal instability increasing only to the actual physical intensity.
- Master-specific wording overrides fallback grouping.
- Do not transplant another NPC's signature pattern.
- `신음타입` sample text is a style seed, not a mandatory literal phrase.

### 6.4 Relax anti-repetition without damaging prose

Clarify that the anti-repetition contract targets copied sentence structures, repeated full phrases, identical action blocks, and stale narrative choreography. It must not suppress normal recurrence of short vocal syllables during continuing stimulation.

- Exact same full moan string repeated back-to-back: avoid.
- Natural variants sharing a root syllable: allowed.
- Do not impose “one moan expression per turn”.
- Do not replace valid vocal reactions with neutral dialogue solely to avoid repetition.
- Keep narrative progression, actions, emotion, and decisions; do not produce a page of sounds only.

### 6.5 Dialogue, punctuation, and TTS safety

Preserve the authoritative dialogue format for every direct vocalization:

`화자명 (짧은 연기지시): “대사”`

Preserve the punctuation contract:

- pause ellipsis is exactly `..`
- no `…`, `……`, `...`, or longer dot runs
- do not wrap every line in `..`
- do not break every word with pauses

Preserve TTS safety:

- avoid long repeated vowels and repeated special symbols that can cause singing-like delivery
- do not require hearts or emoji to convey intensity
- keep speakable Korean syllables and natural punctuation
- do not modify TTS routing, voice selection, direction priority, or speaker extraction
- narrator/player/other-NPC TTS behavior remains unchanged

Moans, arousal, orgasm, consent, affection, and CSA acceptance remain separate concepts. More vocal output must not automatically change relationship stats, consent, authorization, or orgasm counters.

## 7. Deterministic tests

Add or extend a static/Node test script without calling live gameplay APIs.

Required cases:

1. `heroine3` canon with partner count 3 and orgasm count 5 produces a relevant-NPC prompt that forbids unscoped “first/no experience” framing.
2. Scoped “플레이어와는 처음” remains allowed when supported; generic “성경험이 처음” is a conflict.
3. Another present NPC cannot falsely state that heroine3 is generally inexperienced.
4. Same-turn vaginal penetration plus vaginal ejaculation counts exactly once.
5. Prior-turn penetration/current-turn authorized completed vaginal ejaculation counts exactly once without a same-turn base event.
6. “사정 직전”, “싸려고 한다”, interrupted, hypothetical, and negated cases do not count.
7. Generic player ejaculation plus vaginal ejaculation in one turn does not double-count.
8. Replayed duplicate event ID does not double-count.
9. Rejected ejaculation memory patch does not survive as the sole positive completion record.
10. heroine9 legacy snapshot with explicit completed vaginal-ejaculation memory derives minimum one for display/unlock only, never more than one.
11. `buildNpcRelationshipRecord()` reads max(top-level, nested history).
12. Private info unlocks after legitimate accepted ejaculation or orgasm.
13. Moan prompt contains density guidance, character-specific style, anti-repetition exception, dialogue format, `..` punctuation rule, and TTS anti-singing constraints.
14. Moan changes add no validator, hard failure, repair call, or extra DeepSeek/fetch call.
15. Existing CSA structured-choice, execution-contract, integrity stripping, Story SSE, TTS, image, feedback, and atomic commit behavior remains unchanged.

Static checks:

```bash
node --check worker/game-proxy-v2.js
git diff --check
```

Run only deterministic local/static tests. Do not invoke `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, `/api/feedback`, or any Supabase write.

## 8. Commit, merge, and deployment

Target commit message:

`fix: preserve npc canon records and expand vocal reactions`

Workflow:

1. Create `apply/fix-npc-canon-sexual-records-moans-20260801` from exact base `b72d95b8c16aa40ee121d9b7e042a43a1603af1a`.
2. Implement and run static checks only.
3. Re-fetch origin immediately before push.
4. Confirm `origin/feature/csa-only` is still exact base.
5. Push the implementation branch.
6. Fast-forward `feature/csa-only` only. No merge commit, force push, reset, or rebase.
7. Deploy `game-proxy-v2` with the final short SHA tag.
8. Frontend should be byte-identical; do not redeploy `gamebuilder-v2` unless an unexpected justified frontend change was required, which should be treated as scope drift and reported before deployment.
9. Never create or deploy deleted `game-builder-v2`.
10. Verify `/api/version` reports the final SHA/tag and perform GET-only checks for the three play URLs. Do not click choices or submit gameplay input.

## 9. Final report requirements

Report:

- starting SHA
- final SHA
- commit message
- changed files
- exact cause and fix for all three areas
- deterministic test counts and static checks
- API Worker version ID/tag
- frontend byte-identical confirmation
- `/api/version` result
- DB/RPC/migration/save/turn changes: none
- live Story/Extract/Commit/Reset calls: none

Include this exact line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
