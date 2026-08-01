# CSA Deactivation Reaction Hotfix

## Purpose

This patch fixes the production failure where a common-sense change was successfully deactivated in `game_save.csa_active`, but Story continued to describe the old rule as the hospital's current normal practice.

## Deployment entry point

`worker/wrangler.jsonc` points Wrangler at `game-proxy-v2.generated.js` and runs `node ./build-csa-deactivation-hotfix.mjs` before `wrangler deploy`.

A small wrapper assembles the checked-in `build-csa-deactivation-hotfix.parts/*.part` generator and reads the checked-in `game-proxy-v2.js`, applies deterministic source transformations, verifies the streaming contract and JavaScript syntax, then writes the generated deployment entry point. It does not call Story, Extract, Commit, Reset, Feedback, TTS, or Supabase.

Run deployment from the repository root:

```bash
npx wrangler deploy --config worker/wrangler.jsonc
```

Do not edit or commit `worker/game-proxy-v2.generated.js` or `.build-csa-deactivation-hotfix.generated.mjs`; they are build artifacts.

## Behavior contract

- `active:false` immediately removes a CSA from the current norm.
- Deactivation preserves actual memories and current clothing, posture, location, and physical state. It does not create amnesia, a time gap, or magical restoration.
- A structured deactivate transaction materializes its transition before the same turn's Story generation.
- Hospital-wide deactivations are stored in an internal global aftereffect registry. Relevant registered NPCs receive their own reaction state when they are present or explicitly addressed, including later encounters.
- Story receives aftereffect state for all relevant registered NPCs, not only `last_character_id`.
- Presence alone never advances `shock → processing → integrated`.
- A phase advances only when the final Story contains observable re-evaluation, boundary discussion, stopping, cleanup, clothing adjustment, or distance adjustment by that NPC.
- Evidence turns are deduplicated. Required evidence encounters are weak 1, medium 2, strong 3.
- Legacy `processing` or `integrated` states with no reaction evidence self-heal to schema-v2 `shock` through the next ordinary Story/Commit path. No direct DB repair is used.
- An NPC may continue the same behavior because of personal feelings or the current relationship, but not because an inactive CSA is still a current hospital rule.
- The patch adds no post-Story rewrite, repair LLM, semantic 422 gate, DB migration, or extra network call.
- Story keeps `stream:true` and direct `new Response(deepseekRes.body, ...)` forwarding.

## Static verification

The build fails before deployment when any expected source marker has moved, the generated Worker is syntactically invalid, or the SSE streaming contract is missing. This is deterministic deployment safety only; real gameplay verification remains the user's responsibility.
