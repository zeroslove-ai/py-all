# Hotfix — restore NPC detailed/private info UI and make arousal persistent

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`92b464fd1d8bb0ca1c0d700d39ded6838043df40`

Functional Worker base inside that HEAD:

`04056d0bd4dcd80165bf57c7b4b58bdf787a0ac8`

The two commits after the functional base contain no net file diff. Do not drop or rewrite them; start from the exact production HEAD above.

Delivery-only branch:

`handoff/restore-npc-details-and-arousal-20260731`

Do **not** merge this delivery branch. Read this document and implement directly on a new local branch from the exact production HEAD above.

## 1. Confirmed regressions

### A. NPC detailed/private info UI was dropped

The Worker still returns, for every NPC in `/api/app-state`:

- `profile`
- `body`
- `stats`
- `relationship_record`
- `private_info`

`buildNpcPrivateInfo()` still returns the original intimate fields when unlocked:

- nipple
- areola_size
- areola_color
- pubic_hair
- past_partner_count
- past_orgasm_count
- relationship

However, current `pages/csa-app.js::renderNpcs()` renders only name, role, mind state, surface thought, location, and the find button. The old `pages/hypnosis-app.js` had a collapsible `상세정보` block with public profile/body/current status/relationship record/private info. Restore that UI in the CSA app using current `csa-app-*` classes. Do not restore hypnosis/personal-suggestion features.

### B. Sexual arousal rises by only 3 and then resets to 0

Current `calculateArousalStatChange()` behavior:

- low base is only 3;
- if the next Extract omits `arousal_event`, arousal decays by up to 10 in the same scene or 20 on scene change;
- therefore `3 -> 0` in one ordinary next turn is expected from current code;
- sustained manual/genital contact can remain in Story while Extract omits `arousal_event`, causing repeated zero values.

Production turn history confirms this pattern: one turn stored arousal 3 and the next turn returned to 0 even though manual sexual stimulation continued. This is a runtime policy bug, not a frontend display bug.

## 2. Required UI restoration

Primary frontend files:

- `pages/csa-app.js`
- `pages/index.html` only for minimal CSS

In `renderNpcs(body)`, restore a collapsible `<details>` section titled `상세정보` for each NPC.

Required sections:

1. `인물정보`
   - 이름
   - 나이
   - 소속
   - 직책

2. `신체정보`
   - 키
   - 몸무게
   - 체형
   - 가슴

3. `현재 상태`
   - 마음상태
   - 위치
   - 호감도
   - 상식수용도
   - 성적흥분도
   - 상식저항력 if available from payload; otherwise omit rather than invent

4. `관계 기록`
   - 플레이어 사정 횟수
   - NPC 오르가즘 횟수

5. `은밀정보`
   - when `private_info.unlocked !== true`, show a locked explanation;
   - when unlocked, show 유두, 유륜 크기, 유륜 색, 음모 상태, 과거 남성 경험, 과거 오르가즘 경험, 연인 관계;
   - do not expose `숨겨진설정`, internal IDs, prompt metadata, CSA mechanics, or raw JSON.

Use the old `pages/hypnosis-app.js` detailed section only as a visual/data reference. Do not copy personal-suggestion controls, hypnosis stats, or legacy app naming.

The app-state payload already carries most fields. If resistance is required in the detailed UI, add only a public numeric `resistance` field to each NPC payload, derived through the existing `resolveCsaResistance(character)` helper. Do not return legacy hypnosis fields.

### Unlock compatibility

Keep the existing unlock concept, but make it robust across current and legacy relationship shapes:

`isNpcIntimateInfoUnlocked(relationship)` should recognize:

- `intimate_info_unlocked === true`
- `has_had_sex_with_player === true`
- positive top-level `player_ejaculation_count` or `npc_orgasm_count`
- positive nested `sexual_history.player_ejaculation_count` or `sexual_history.npc_orgasm_count`
- positive completed sexual-history counters that clearly establish prior intimate contact

Do not unlock merely because an NPC is nude, embarrassed, subject to a CSA, or has nonsexual contact.

Do not mutate existing saves or Supabase. This is read compatibility and future-save correctness only.

## 3. Arousal behavior contract

Arousal is involuntary physiology. It is **not** consent, affection, obedience, or sexual authorization. Existing sexual action gates remain unchanged.

### 3.1 Increase scale

Replace the current weak scale with a meaningful one, still sensitivity-adjusted and clamped 0..100:

- low: base +5
- medium: base +10
- high: base +15
- climax: at least 90

Keep the existing character sensitivity multiplier, but clamp per-turn non-climax rise to +15.

### 3.2 Decay scale

A missing new arousal event must not erase recent arousal in one turn.

- same scene, no new stimulation/evidence: decay by 2
- clear scene/location change or meaningful time skip: decay by 8
- ongoing direct sexual stimulation: do not decay; hold current value if no stronger event is extracted
- after climax, do not reset to zero on the next turn; use the same gradual decay unless a clearly modeled post-climax drop is implemented, and even then never hard-reset to 0

Thus a low event should behave approximately `5 -> 3 -> 1 -> 0` across several inactive turns, not `3 -> 0` immediately.

### 3.3 Deterministic fallback for omitted `arousal_event`

Do not rely solely on the LLM remembering `arousal_event`.

Add a narrow helper, for example `resolveArousalSignal(...)`, before `calculateArousalStatChange()`:

1. Prefer a valid normalized `extract.arousal_event`.
2. Otherwise, if the final Story shows ongoing direct sexual stimulation involving the current registered NPC **and** the current `npc_emotion.physical_reaction` shows a contemporaneous bodily response, derive at least `low`.
3. If direct sexual stimulation is clearly ongoing but the bodily response is ambiguous, hold current arousal instead of decaying.
4. Nudity, embarrassment, fear, CSA presence, player input claims, gaze alone, or generic blushing alone must not create an increase.

Examples that may support low/medium when attributed to the current NPC:

- actual hand/oral/genital/breast/nipple stimulation continues;
- rhythmic rubbing/massaging continues;
- warmth, wetness, nipple hardening, pelvic tension, involuntary breath/voice changes together with direct sexual contact.

Examples that must not create arousal by themselves:

- `부끄럽다`, `무섭다`, `당황했다`;
- nudity without stimulation;
- trembling caused only by fear or work pressure;
- an active CSA existing in the location;
- the player merely claiming that the NPC is aroused.

The helper may return one of:

- explicit event (`low|medium|high|climax`)
- `hold` for clearly ongoing direct stimulation without enough evidence to increase
- `none` for decay

Do not add another LLM call.

### 3.4 Extract prompt clarification

Clarify the primary Extract contract:

- ongoing direct sexual contact with actual bodily response should continue to return `arousal_event`, even if embarrassment/fear dominates the NPC's thoughts;
- arousal does not mean consent;
- do not omit `arousal_event` merely because the action is treated as work or a social norm;
- do not return it for nudity/embarrassment alone.

### 3.5 Persistence and display

- Continue storing arousal in `npc_stats[character_id].성적흥분도`.
- Continue returning `npc_stat_changes` so the UI can show a delta.
- Never overwrite another NPC's arousal.
- An Extract-degraded turn must preserve prior arousal and should not force an immediate decay to zero. For degraded turns, hold the existing value and set delta 0.

## 4. Preserve existing systems

Must remain unchanged:

- Story SSE streaming (`stream: true`, direct `new Response(deepseekRes.body, ...)`)
- Primary Extract exactly one attempt
- no JSON repair LLM
- no Mind Monitor repair LLM
- no first-encounter repair LLM
- no post-stream narrative replacement
- NPC CSA epistemic firewall
- field-level scene-state evidence
- four complete player candidates and `player_action` identity
- image shortlist and rendering
- TTS/dialogue extraction/playback
- CSA instant application and non-magical physical continuity
- sexual consent/authorization gates
- feedback rollback and commit conflict handling

Do not modify Supabase, RPCs, migrations, game data, saves, image data, or TTS data.

## 5. Required tests

Static checks:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/csa-app.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/ui.js
node --check pages/stream.js
node --check pages/api.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

Add focused deterministic assertions or an isolated script for:

1. low arousal from 0 rises to at least 4 after sensitivity adjustment;
2. same-scene no-event decay is at most -2;
3. scene-change decay is at most -8;
4. ongoing stimulation with omitted event does not decay;
5. degraded Extract holds arousal exactly;
6. fear/nudity alone does not synthesize arousal;
7. direct sexual stimulation plus bodily response can synthesize low;
8. arousal never changes consent/authorization output;
9. `private_info` remains locked for a never-intimate NPC;
10. `private_info` unlocks from current and legacy nested relationship counters;
11. `renderNpcs()` contains a `상세정보` section and renders unlocked/locked private info paths;
12. no legacy hypnosis/personal-suggestion UI is reintroduced.

Do not call real `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, choice, save, or feedback endpoints.

## 6. Commit and deployment

Expected files:

- `worker/game-proxy-v2.js`
- `pages/csa-app.js`
- `pages/index.html`
- minimal docs if useful

Commit message:

`fix: restore npc details and persistent arousal`

Before push:

- fetch `origin/feature/csa-only`;
- confirm it still equals `92b464fd1d8bb0ca1c0d700d39ded6838043df40`;
- normal fast-forward push only; no force.

Deploy:

- `game-proxy-v2`
- `gamebuilder-v2` because frontend files change

Do not deploy or recreate deleted `game-builder-v2`.

Final report must include starting SHA, final SHA, changed files, arousal rules, detailed-info UI behavior, verification output, API and frontend Worker version IDs, and:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
