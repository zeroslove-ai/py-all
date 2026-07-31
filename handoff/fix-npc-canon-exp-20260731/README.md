# Implementation handoff — NPC canon enforcement and EXP rebalance

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`14d0242d50d50d530dbe9719d9a8c7e469c7bccc`

This HEAD already contains the completed CSA participant/target expansion, 30 new presets, anonymous minor-NPC resolver, and `csa_direct > voluntary > bold > blocked` route. Preserve all of it.

Delivery-only branch:

`handoff/fix-npc-canon-exp-20260731`

Do not merge this delivery branch. Read this file and implement directly on a new local branch created from the exact production HEAD above.

## 1. Remaining scope only

The previous CSA expansion is already implemented and deployed. Do not redo it.

Implement only:

1. Story must consistently use registered NPC master canon, including relevant public body facts and author-only private facts.
2. App/sidebar private-information locking must remain unchanged.
3. Structured fields must not preserve direct contradictions of master canon.
4. Increase level-up EXP requirements using the exact threshold table below.

## 2. Verified production regressions

Read-only production inspection of game `9ed5b835-9948-4cad-ac25-3ebff7348574` showed:

- Turn 119: `heroine10` 임수정 was treated as having no prior male experience, matching master data.
- Turn 123: Story contradicted the same master data and claimed she had one prior experience.
- Turn 124: focus switched from `heroine10` to already-present `heroine9` 박소현, but Story generation still only had the previous `last_character_id` dossier.
- Turn 125: Story invented an exact seven-year marriage duration for 박소현, which does not exist in master data, and used generic body prose instead of her established `75C` and body type where relevant.

Relevant master facts:

### heroine10 — 임수정

- age 25
- 3병동 간호사
- 160 cm / 48 kg
- slender/pure body type
- 70A
- relationship: none
- past male partners: 0
- past orgasms: 0
- inverted nipple
- small pink areola
- light/small pubic hair

### heroine9 — 박소현

- age 35
- 3병동 간호사
- 162 cm / 55 kg
- plump/firm body type
- 75C
- glasses and gold wedding ring
- married; marital ennui
- past male partners: 1
- past orgasms: 1
- medium nipple
- large dark-brown areola
- abundant pubic hair
- preference: stimulation outside routine; vulnerable to someone who awakens her

## 3. Confirmed code cause

Current `buildCurrentNpcProfileSection(save, characters)`:

- reads only `save.last_character_id`;
- emits one dossier inside the long Story system prompt;
- exposes private canon to Story only when `buildNpcPrivateInfo()` says the app UI is unlocked;
- cannot reliably support a same-turn focus switch to another already-present NPC;
- competes with recent memories and a truncated general master snapshot.

`buildNpcPrivateInfo()` is correct for the player-facing app and must remain unchanged. Story-author knowledge and player-visible unlock are separate concerns.

## 4. Author-only canonical dossier

Create a new prompt-only helper separate from `buildNpcPrivateInfo()`, for example:

`buildAuthorNpcCanonDossier(characterId, character)`

Include only real values present in the registered master object:

- character ID
- name
- age
- affiliation/job/rank
- personality
- speech style
- observable appearance
- height
- weight
- body type
- cup size
- relationship status
- past male partner count
- past orgasm count
- nipple
- areola size
- areola color
- pubic hair
- preference
- hidden author motivation
- master `신음타입`

Rules:

- no placeholder values;
- no inferred marriage duration, counts, sizes, medical history, or sexual history;
- master `신음타입` is authoritative; `VOCAL_STYLE_BY_NAME` is fallback only when master lacks it;
- this dossier is prompt-only;
- never include hidden author fields in `/api/context`, `/api/app-state`, frontend state, turn records, logs, response metadata, player status, or sidebar.

Do not change `buildNpcPrivateInfo()`, private-info unlock rules, or `pages/csa-app.js` locking behavior.

## 5. Relevant-NPC selector

Create one deterministic selector, for example:

`resolveRelevantNpcCanonIds({ playerInput, playerAction, save, characters })`

Priority:

1. exact registered NPC names in current player input;
2. exact registered NPC names in selected `player_action.choice_text`;
3. `save.last_character_id`;
4. `save.last_npcs_present` in stored order;
5. deduplicate and cap at four registered NPCs.

Contextual focus changes such as “다른 지원자” must still include all currently present registered NPC dossiers up to the cap, allowing Story to choose a valid new focus without losing that NPC's canon.

Do not use master-object enumeration order.

## 6. Final recency-favored Story block

Build a compact `buildRelevantNpcCanonSection(...)` and inject it as a separate final system message after the user message, near/after the existing CSA epistemic firewall.

It must be closer to generation than recent memories, summaries, and the truncated master snapshot.

Required rules inside the block:

- registered master canon overrides conflicting recent narrative, summaries, previous choices, and ordinary in-character claims;
- direct questions about stored facts receive the exact canonical truth;
- never invent exact years, counts, sizes, partner history, marital duration, or medical/sexual history;
- do not dump all dossier fields every turn;
- when a body part is visible, touched, compared, examined, or directly discussed, naturally use one or two relevant concrete traits;
- when focus switches during the same turn, immediately use the new NPC's dossier;
- each NPC knows her own facts;
- one NPC does not automatically know another NPC's private facts unless revealed, observed, or already established in scene memory;
- narrator knowledge is not automatically public in-world knowledge;
- ordinary role-play assertions from the player do not overwrite master canon;
- explicit out-of-world data editing is outside this hotfix.

Do not add another Story call. Do not add post-stream narrative replacement.

## 7. Narrow structured conflict protection

Prevent wrong facts from contaminating future turns through:

- `npc_emotion.surface`
- `npc_emotion.inner`
- `turn_summary`
- `relationship_memory_patch`

At minimum detect direct contradictions for:

- canonical partner count 0 versus a claim of prior male experience;
- canonical positive partner count versus a claim of never having had a male partner;
- married versus single/unmarried;
- single/no-partner versus an invented husband/spouse;
- exact numeric claims that conflict with canonical partner/orgasm counts.

Behavior:

- `npc_emotion`: replace only the conflicting field through the existing deterministic Mind Monitor fallback; keep valid sibling fields;
- `relationship_memory_patch`: remove only the conflicting entry;
- `turn_summary`: remove only the conflicting sentence; use a short neutral deterministic fallback only if nothing remains;
- log only `{event:"npc_canon_conflict", character_id, fields}`;
- do not log intimate raw text;
- do not fail the turn;
- do not call any repair LLM;
- do not rewrite the streamed Story.

Require a direct contradiction against a stored canonical field. Do not add broad keyword filters that erase valid dialogue or current-turn events.

## 8. EXP threshold rebalance

Replace the formula-only threshold with this single authoritative table:

```js
const CSA_LEVEL_EXP_REQUIREMENTS = Object.freeze({
  1: 15,
  2: 23,
  3: 50,
  4: 63,
  5: 75,
  6: 105,
  7: 120,
  8: 135,
  9: 150
});
```

`expForNextLevel(level)` must read from this table.

Compatibility requirements:

- do not downgrade an existing level;
- do not subtract existing EXP;
- do not rewrite `game_save`;
- no migration or RPC change;
- preserve saved `level` and `exp`;
- recompute `next_level_exp` from the table in every capability/read path instead of trusting stale saved `player_progress.next_level_exp`;
- future `calculateProgress()` loops carry remaining EXP across levels using each threshold exactly once;
- level 10 reports `next_level_exp: 0`.

Current production save is level 8, EXP 20. After deployment, read-only payloads must show:

- level 8
- EXP 20
- next-level requirement 135

No production data write is required.

## 9. Preservation requirements

Preserve all functionality present at `14d0242`, especially:

- expanded actor/target option IDs and matrices;
- `resolveCsaParticipants()` behavior;
- 30 new CSA presets and all old preset IDs;
- anonymous minor NPC public/private-location rules;
- `csa_direct > voluntary > bold > blocked`;
- stale bold-to-csa_direct recomputation;
- csa_direct UI rendering without probability;
- physical continuity and field-level evidence;
- NPC CSA epistemic firewall;
- Primary Extract 5000 tokens / 75000 ms / failure-only second attempt;
- Story SSE passthrough and direct response streaming;
- no auxiliary JSON/Mind Monitor/first-encounter/CSA repair LLMs;
- four complete player candidates and `player_action` identity;
- images, TTS, Mind Monitor, arousal persistence;
- sexual authorization gates outside exact CSA direct scope;
- feedback rollback and commit conflict handling.

No Supabase/RPC/migration/game-data/save modifications.

## 10. Deterministic tests

Required assertions:

1. `heroine10` partner count 0 is present in the final author dossier.
2. A direct question about heroine10 experience is instructed to use the canonical zero value.
3. Previous main heroine10 plus currently present heroine9 causes both dossiers to be injected.
4. Exact input mention of heroine9 puts heroine9 first.
5. Heroine9 dossier contains married, partner count 1, 75C, body type, and no invented marriage duration.
6. A relevant exposed-body scenario has access to 75C/body type without forcing a full profile dump.
7. Another NPC is not instructed to know heroine9's private history automatically.
8. App `private_info` remains locked for a never-intimate NPC.
9. Author-only hidden fields do not appear in public context/app-state payloads.
10. A conflicting `npc_emotion` field alone is replaced; valid siblings survive.
11. A conflicting relationship-memory entry alone is removed.
12. A conflicting summary sentence alone is removed.
13. No Story rewrite and no new LLM call exists.
14. `expForNextLevel(1..9)` returns `15,23,50,63,75,105,120,135,150`.
15. `{level:8, exp:20}` stays level 8/EXP 20 and reports 135.
16. Existing levels are never downgraded.
17. Multi-level EXP carry uses the new threshold of each crossed level once.
18. Level 10 returns 0.
19. Manual/app-state/player-info progress values use the same Worker calculation.
20. All `14d0242` CSA direct-participant tests remain passing.

Use deterministic/offline tests only. Do not call real Story, Extract, Commit, Reset, choices, feedback, or save endpoints.

## 11. Expected files and deployment

Expected implementation files:

- `worker/game-proxy-v2.js`
- minimal relevant docs

Frontend source should remain unchanged unless a real server-payload rendering defect is discovered. The EXP display already consumes Worker-provided values.

Commit:

`fix: enforce npc canon and rebalance progression`

Before push, verify `origin/feature/csa-only` is still exactly:

`14d0242d50d50d530dbe9719d9a8c7e469c7bccc`

If it moved, stop and report. Use normal fast-forward push only. No force push, reset, or rebase.

Deploy `game-proxy-v2` only when only Worker source changed. Do not redeploy `gamebuilder-v2` when frontend files are byte-identical. Never create or deploy deleted `game-builder-v2`.

Final report must contain exactly:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
