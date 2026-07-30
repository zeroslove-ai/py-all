# Hotfix — player setup choice metadata must reach Story and Extract

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required base SHA:

`a6de31e64d25c71de82f7827148fcc67dd265f94`

Delivery branch:

`handoff/fix-setup-choice-metadata-20260730`

Do not merge this delivery branch. Read this file and implement directly on a new local branch from the exact production SHA.

## Stop P1

Do not continue, commit, push, or deploy `handoff/p1-streaming-cleanup-a6de31e-20260730` or any P1 implementation until this hotfix is complete and the user has functionally verified the repaired setup/gameplay flow.

## Confirmed production failure

The current production game `9ed5b835-9948-4cad-ac25-3ebff7348574` is stuck with:

- `turn_count = 3`
- `player_setup.status = recommended`
- `player.name/job = empty`
- `last_character_id = narrator`
- `last_image_id = null`
- turn 2 and turn 3 `mind_monitor = null`

Turn 1 produced four candidates. The user clicked the second button, `박태호 · 입원 환자`.

The frontend correctly recorded:

- `source = choice_button`
- `choice_index = 1` (zero-based, therefore candidate 2)
- `choice_text = 박태호 · 입원 환자`

However `/api/story` and `/api/extract` currently receive only `player_input`, not `player_action`. The displayed choice marker/number is UI-only, and `normalizeChoice()` strips `2.` before the button callback. Therefore the Worker receives `박태호 · 입원 환자`, while `parseSetupCandidateSelection()` recognizes only numeric text such as `2`, `②`, `2번`, `후보 2`, or `두 번째`.

This causes one turn to split into contradictory modes:

1. Story LLM infers that `박태호 · 입원 환자` means selection and writes the hospital opening.
2. Worker/Extract does not recognize approval, remains in player-setup mode, strips NPC/Mind Monitor/image/dialogue state, and keeps `player_setup.status = recommended`.
3. Commit leaves `player` blank and `last_character_id = narrator`.
4. Image, Mind Monitor, and TTS are not deleted; they receive no usable `character_id`, `npc_emotion`, `image_id`, or `dialogue_lines` because the setup-only Extract branch keeps consuming gameplay turns.

## Required fix

Use the same selection signal in Story, Extract, and Commit. Do not rely only on the visible choice string.

### 1. Pass `player_action` to Story

Files:

- `pages/stream.js`
- `pages/index.html`
- `worker/game-proxy-v2.js`

`retryStory()` already has `pending.playerAction`.

Change `stream.story(...)` to accept a final `playerAction = null` argument and include:

```js
player_action: playerAction
```

in the `/api/story` request body.

Pass `pending.playerAction` from the `stream.story(...)` call in `pages/index.html`.

In `handleStory`, read `player_action = null` and pass it into `buildStoryPrompt`.

### 2. Pass `player_action` to Extract

Files:

- `pages/api.js`
- `pages/index.html`
- `worker/game-proxy-v2.js`

Change `api.extract(...)` to accept `playerAction = null`, include `player_action` in the `/api/extract` body, and pass `pending.playerAction` from `retryExtract()`.

In `handleExtract`, read `player_action = null` and pass it into `runExtractPipeline`.

Thread it through:

- `runExtractPipeline`
- `performExtractionPass`
- `buildExtractPrompt`
- `buildPlayerSetupOnlyExtractPrompt` decision

### 3. Resolve setup selection from metadata first

Extend:

```js
resolveSetupApproval(playerInput, recommendations, playerAction = null)
```

Priority:

1. A valid `player_action.source === 'choice_button'` and integer zero-based `choice_index` within the saved candidate array.
2. A normalized `choice_text` match against the candidate label/name/job as a defensive fallback.
3. Existing free-text numeric parser (`4번`, `④`, `후보 4`, etc.).
4. Existing one-candidate approval compatibility.

For a valid choice-button selection return the same shape as the existing parser:

```js
{
  index,
  candidate,
  raw_input: playerInput,
  hold_setup: false
}
```

A setup candidate button click is an immediate selection unless the actual free-text input contains an explicit hold phrase. Do not require the number to remain inside `choice_text`.

### 4. Use identical approval resolution everywhere

Pass `playerAction` into every current call of `resolveSetupApproval`:

- `buildStoryPrompt`
- `buildExtractPrompt`
- `performExtractionPass`
- `runExtractPipeline`
- `buildSavePatch`

`buildSavePatch` must accept `playerAction` and use it when deciding whether to write:

- `player`
- `player_setup.status = complete`
- `selected_id`
- `selected_profile`
- `opening_started = true`

`handleCommitTurn` already receives `player_action`; thread it into `buildSavePatch` rather than changing the commit API contract again.

### 5. Prevent setup/gameplay mode divergence

For a valid setup choice-button selection:

- Story mode must be `opening`.
- Extract must use the normal/opening Extract contract, not `buildPlayerSetupOnlyExtractPrompt`.
- The selected saved candidate is the base profile.
- Same-input user edits from `player_patch`/`player_recommendation` may merge on top.
- Commit must set setup complete in the same turn.

Add a narrow deterministic helper test or exported/static test coverage proving the second displayed candidate button resolves candidate 2 when:

```js
playerInput = '박태호 · 입원 환자'
playerAction = {
  source: 'choice_button',
  choice_index: 1,
  choice_text: '박태호 · 입원 환자'
}
```

Do not add card/label exact-match hard gates.

## Existing feature preservation

Do not remove or alter:

- four setup candidates
- free-text `4번으로 선택하되 ...` selection
- Mind Monitor fields/panel
- image shortlist, `image_id`, `/api/image`, frontend image rendering
- `dialogue_lines`, `/api/tts`, playback/replay
- sidebar sections
- normal four choices and mobile shortening
- Story SSE passthrough
- P0 fail-open behavior
- Commit conflict handling, feedback restore, CSA transaction validation

Do not change Supabase schema/RPCs or game data in this code hotfix.

## Files expected to change

- `worker/game-proxy-v2.js`
- `pages/stream.js`
- `pages/api.js`
- `pages/index.html`

Documentation changes are optional and minimal.

## Verification

Run:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/stream.js
node --check pages/api.js
node --check pages/ui.js
node --check pages/sidebar.js
node --check pages/tts.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

Static checks must confirm:

- `/api/story` body contains `player_action`
- `/api/extract` body contains `player_action`
- Worker Story/Extract/Commit paths all pass the same metadata into `resolveSetupApproval`
- zero-based `choice_index: 1` selects candidate 2
- `stream: true` remains
- direct `new Response(deepseekRes.body, ...)` remains
- `/api/image` and `/api/tts` remain
- `npc_emotion`, `dialogue_lines`, `image_id`, `player_recommendations` remain
- `PLAYER_SETUP_CANDIDATES_INVALID` remains absent

Do not call real Story/Extract/Commit/Reset endpoints and do not mutate Supabase during implementation.

## Git/deploy

1. Confirm `origin/feature/csa-only` is exactly `a6de31e64d25c71de82f7827148fcc67dd265f94`.
2. Create a new local branch from that SHA.
3. Implement and statically verify.
4. Commit once:

```text
fix: preserve setup choice metadata across the turn pipeline
```

5. Fetch again; stop if production moved.
6. Normal fast-forward push to `feature/csa-only`; never force.
7. Deploy both `game-proxy-v2` and `gamebuilder-v2` because Worker and frontend runtime files change.
8. Do not touch Supabase or gameplay state.

Required final line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
