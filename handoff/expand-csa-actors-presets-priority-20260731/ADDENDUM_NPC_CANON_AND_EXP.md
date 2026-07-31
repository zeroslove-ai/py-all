# Addendum — authoritative NPC canon in Story and higher level EXP requirements

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`d44ead50d22b2cb89eb18df88aeb7d36f6245e80`

Delivery-only branch:

`handoff/expand-csa-actors-presets-priority-20260731`

Read this addendum together with:

`handoff/expand-csa-actors-presets-priority-20260731/README.md`

Do **not** merge the delivery branch. Implement both documents on one new local branch created from the exact production HEAD above.

## 1. Additional goals

Add these requirements to the existing CSA participant/preset/direct-choice implementation:

1. Story must consistently use registered NPC master data, including public body facts and author-only private canon such as sexual-history counts, relationship status, intimate anatomy, preferences, and vocal style.
2. NPC information shown as locked in the app remains locked. Story-author access and player UI unlock are separate concerns.
3. Increase EXP required for every level transition according to the exact table in section 7, without downgrading or rewriting existing saves.

## 2. Verified recent-turn regressions

Read-only production DB inspection of game:

`9ed5b835-9948-4cad-ac25-3ebff7348574`

confirmed the following.

### Turn 119 — correct canon existed in the generated state

The main NPC was `heroine10` 임수정. Her Mind Monitor treated her as having no prior male experience, which matches master data.

### Turn 123 — direct contradiction of master canon

The player asked whether 임수정 was still inexperienced. Story answered that she had one prior experience.

Master data for `heroine10` says:

- relationship: none
- past male partners: `0`
- past orgasms: `0`
- body: `70A`, 160 cm, 48 kg, slender/pure
- nipple: inverted
- areola: small, pink
- pubic hair: light/small

The turn therefore changed a fixed character fact inside Story even though the master row had the correct value.

### Turn 124 — main NPC switched but the new NPC dossier was not injected

Before turn 124:

- `last_character_id = heroine10`
- `last_npcs_present = [heroine10, heroine4, heroine3, heroine9]`

The player requested another volunteer and Story switched the main focus to `heroine9` 박소현. The current prompt builder had injected only the previous `last_character_id` profile, so the newly focused NPC did not receive her complete established dossier in the generation prompt.

### Turn 125 — invented exact biographical detail and generic body description

The player referred to 박소현 as married. Story invented an exact marriage duration of seven years, which is not in master data.

Master data for `heroine9` says:

- age 35
- 3병동 간호사
- body: `75C`, 162 cm, 55 kg, plump/firm
- glasses and gold wedding ring
- married, marital ennui
- past male partners: `1`
- past orgasms: `1`
- nipple: medium
- areola: large, dark brown
- pubic hair: abundant
- preference: stimulation outside routine; vulnerable to someone who awakens her

The exposed-body scene still used mostly generic prose instead of the relevant established body traits.

## 3. Confirmed code cause

Current `buildCurrentNpcProfileSection(save, characters)`:

- reads only `save.last_character_id`;
- emits one current-NPC block;
- includes public body fields;
- includes private fields only through `buildNpcPrivateInfo(...)`;
- therefore hides private canon from Story whenever the app unlock condition is false.

`buildNpcPrivateInfo(...)` is correctly designed for the app UI and must remain locked until the relationship unlock condition is met. It must not be repurposed as the Story author's only source of canon.

The general master snapshot is also truncated before the long prompt is assembled, so later character entries are not reliable prompt context.

Extract receives enough data to detect some contradictions, but it cannot repair an already streamed Story. P1 forbids post-stream narrative replacement. The main prevention must therefore occur before Story generation.

## 4. Separate author canon from player-visible unlock

### 4.1 Keep UI privacy behavior unchanged

Do not change:

- `buildNpcPrivateInfo()` app payload semantics;
- locked/unlocked display in `pages/csa-app.js`;
- relationship requirements for revealing intimate information to the player;
- saved relationship counters merely to unlock data.

Locked information must not become visible in the app, sidebar, player status panel, or raw public context because Story has access to it.

### 4.2 Add an author-only NPC canonical dossier

Create a new helper separate from `buildNpcPrivateInfo()`, for example:

`buildAuthorNpcCanonDossier(characterId, character)`

It may read the registered master character object directly and return a compact prompt-only representation containing real values only:

- `character_id`
- name
- age
- affiliation/job/rank where present
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
- hidden author-only motivation
- `신음타입`

Do not fabricate placeholders or infer missing values.

`신음타입` from the master character is authoritative. The existing `VOCAL_STYLE_BY_NAME` map may remain only as a fallback for characters whose master profile lacks a vocal type.

This dossier is prompt-only. Never put hidden author fields into `/api/context`, `/api/app-state`, frontend state, turn records, logs, or response metadata.

## 5. Relevant-NPC selection and prompt placement

### 5.1 Select more than the previous main NPC

Create a deterministic relevant-NPC selector, for example:

`resolveRelevantNpcCanonIds({ playerInput, playerAction, save, characters })`

Priority:

1. registered NPCs explicitly named in the current player input;
2. registered NPC explicitly named by the selected choice text;
3. `save.last_character_id`;
4. `save.last_npcs_present` in stored order;
5. deduplicate and cap at four registered NPCs.

Do not use master object enumeration order to choose the first dossier.

This must cover a same-turn focus switch such as `heroine10 → heroine9` when both were already present, even if the current input uses a role or contextual reference rather than repeating the exact full name.

For contextual focus changes such as “다른 지원자”, include all registered currently present NPC dossiers up to the cap so Story can choose a valid new focal NPC without losing that NPC's canon.

### 5.2 Final recency-favored system block

Build one compact section, for example:

`buildRelevantNpcCanonSection(...)`

Inject it as a separate final system message after the user message, near the existing NPC CSA epistemic firewall. It must be closer to generation than recent memories and the truncated master snapshot.

Required rules inside the block:

- master canon overrides conflicting recent narrative, summaries, old choices, and ordinary in-character claims;
- a direct question about a stored fact must receive the exact canonical truth;
- do not invent exact years, counts, sizes, prior partners, marital duration, or medical/sexual history;
- do not recite all dossier fields every turn;
- when a body part is visible, touched, compared, examined, or directly discussed, naturally use one or two relevant concrete traits;
- when the main focus switches during the turn, immediately use the new NPC's dossier;
- each NPC knows her own facts;
- one NPC does not automatically know another NPC's private facts until those facts were revealed, observed, or already established in scene memory;
- narrator knowledge does not equal public in-world knowledge;
- player assertions inside ordinary role-play do not overwrite registered master canon;
- an explicit out-of-world user correction or requested character-data edit remains a separate operation and is not part of this hotfix.

Do not add another Story call or a post-stream rewrite.

## 6. Deterministic structured-field conflict protection

Pre-generation prompt prevention is the main fix. Add a narrow, fail-open structured protection layer for fields that can contaminate future turns.

Create canonical checks for current registered NPC facts in:

- `npc_emotion.surface`
- `npc_emotion.inner`
- `turn_summary`
- `relationship_memory_patch`

At minimum detect direct contradictions for:

- past partner count zero versus claims of prior male experience/not being sexually inexperienced;
- positive past partner count versus claims of never having had a male partner;
- married versus single/unmarried claims;
- single/no-partner versus invented husband/spouse;
- exact numeric claims that conflict with stored counts.

Behavior:

- `npc_emotion`: replace only the conflicting field with the existing deterministic Mind Monitor fallback; preserve valid sibling fields;
- `relationship_memory_patch`: remove only the conflicting entry;
- `turn_summary`: remove only the conflicting sentence, with a short neutral deterministic fallback only if nothing remains;
- log `{event:"npc_canon_conflict", character_id, fields}` without logging intimate raw text;
- never fail the whole turn;
- never call an LLM repair;
- never rewrite streamed Story after generation.

Do not create broad keyword filters that erase legitimate dialogue. Require a direct contradiction against a stored canonical field.

## 7. New level EXP requirements

The user requested an additive percentage increase over the current transition thresholds:

- Lv1–Lv2 band: `+50%` = current value × `1.5`
- Lv3–Lv5 band: `+150%` = current value × `2.5`
- Lv6 and above: `+200%` = current value × `3.0`

Use integer thresholds rounded upward. The exact authoritative table is:

```js
const CSA_LEVEL_EXP_REQUIREMENTS = Object.freeze({
  1: 15,   // Lv1 → Lv2, old 10
  2: 23,   // Lv2 → Lv3, old 15
  3: 50,   // Lv3 → Lv4, old 20
  4: 63,   // Lv4 → Lv5, old 25
  5: 75,   // Lv5 → Lv6, old 30
  6: 105,  // Lv6 → Lv7, old 35
  7: 120,  // Lv7 → Lv8, old 40
  8: 135,  // Lv8 → Lv9, old 45
  9: 150   // Lv9 → Lv10, old 50
});
```

Replace the formula-only `expForNextLevel(level)` with a read from this single table.

### Existing save compatibility

- Do not downgrade an existing level.
- Do not subtract previously earned EXP.
- Do not rewrite `game_save` or run a migration.
- Preserve the existing saved `level` and `exp` values.
- Recompute `next_level_exp` from the new table in every read/capability path instead of trusting a stale saved `player_progress.next_level_exp`.
- Future `calculateProgress()` level-up loops use the new thresholds and carry remaining EXP normally.
- Level 10 still reports `next_level_exp: 0`.

Production currently has level 8, EXP 20. After deployment, read-only app/player-info payloads must display:

- level: 8
- exp: 20
- next level requirement: 135

No current data rewrite is required.

## 8. Integration with the main handoff

Implement this addendum in the same upcoming work as the actor/target/preset/direct-choice expansion.

Preserve all requirements from the main README, including:

- exact `csa_direct → voluntary → bold → blocked` route priority;
- expanded participant resolver and anonymous minor NPC rules;
- new weak/medium/strong presets;
- d44ead5 Primary Extract stability;
- Story SSE passthrough;
- no auxiliary repair LLMs;
- NPC CSA epistemic firewall;
- field-level physical-state evidence;
- arousal persistence;
- four complete player candidates;
- images, TTS, Mind Monitor, feedback rollback, and commit conflict handling.

No Supabase/RPC/migration/game-data/save changes.

## 9. Required deterministic tests

Add these assertions to the main README test set:

1. With `heroine10` master partner count `0`, a direct question about prior experience cannot produce a structured claim that she had one prior partner.
2. With `heroine9` married and partner count `1`, the prompt dossier contains those exact facts but no invented marriage duration.
3. A turn whose previous main NPC is `heroine10` but whose focus switches to already-present `heroine9` receives the heroine9 dossier before Story generation.
4. In a relevant exposed-body scene, heroine9 canon can use `75C` and her body type naturally without dumping the entire profile.
5. Another NPC cannot claim knowledge of heroine9's private history unless it was revealed or observed.
6. App `private_info` remains locked for a never-intimate NPC after this author-only prompt change.
7. A conflicting `npc_emotion` field is replaced alone; valid siblings survive.
8. A conflicting relationship-memory entry is removed alone.
9. No Story rewrite or new LLM call is added.
10. `expForNextLevel(1..9)` returns exactly `15,23,50,63,75,105,120,135,150`.
11. `{level:8, exp:20}` remains level 8/EXP 20 and reports `next_level_exp:135`.
12. Existing levels are never downgraded when the threshold table changes.
13. A large EXP grant carries across multiple levels using each new threshold exactly once.
14. New/reset games use the same table.
15. Level 10 reports `next_level_exp:0`.
16. UI/app/manual/player-info progress values all originate from the same Worker calculation.
17. No Supabase write, migration, save rewrite, or real gameplay endpoint call occurs during tests.

## 10. Expected files, commit, and deployment

Expected implementation files:

- `worker/game-proxy-v2.js`
- `pages/csa-app.js` and `pages/ui.js` as required by the main CSA direct-choice work
- `pages/index.html` only if styling is needed
- minimal CSA/progression docs

Do not expose author-only private canon in frontend code.

Use one commit for the combined upcoming implementation:

`feat: expand csa participants presets and npc canon`

Deploy both only when their source changed:

- deploy `game-proxy-v2` because Worker changes are required;
- deploy `gamebuilder-v2` because the main README's direct-choice UI work changes frontend source;
- never create or deploy deleted `game-builder-v2`.

Do not call real `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, choices, feedback, or save endpoints.

Final report must contain exactly:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
