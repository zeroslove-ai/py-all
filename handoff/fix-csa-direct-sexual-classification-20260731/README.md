# Implementation handoff — exact CSA-direct sexual choice routing

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`73b74927a2a10ce89cb2e8c5ce710b57ae9a158f`

Delivery-only branch:

`handoff/fix-csa-direct-sexual-classification-20260731`

Do not merge this delivery branch. Read this file and implement directly on a new local branch created from the exact production HEAD above.

## 1. Incident and confirmed state

A user selected this saved choice on production turn 127:

`고개를 끄덕이며 "보고 잘 들었다. 이제 네가 도와줄 때다."라며 박소현의 머리를 잡고 자신의 성기 쪽으로 당긴다. "남편에게 하던 대로, 내 성기를 입으로 깨물어서 만족할 때까지 멈추지 마."`

The frontend displayed it as:

`🌀 상식개변 직접 실행`

Story streamed, but Extract then failed closed with:

`STRUCTURED_SEXUAL_INTEGRITY_UNRESOLVED`

The failed attempted turn was not committed. Read-only production DB inspection after the incident showed `turn_count=127`.

The stored choice metadata for that choice was wrong:

- `kind: "csa_direct"`
- `sexual_action: "none"`
- covering CSA: `csa_111_1`
- template: `player_satisfaction_is_core_staff_evaluation`

But that choice is an oral/genital sexual command. `csa_111_1` is a nonsexual evaluation-norm CSA and must never authorize the physical sexual act.

The active CSA that can cover the exact oral action is `csa_111_2`:

- template: `player_sexual_relief_is_top_priority_duty`
- preset sexual contract includes `oral`
- direction: NPC to player

Preserve the final structured sexual-integrity fail-closed gate. The gate caught the invalid route correctly. The defect is upstream choice classification/coverage and stale-metadata trust.

## 2. Confirmed code causes

### 2.1 Sexual-action classifier misses common Korean inflections

Current classifier returns `none` for material sexual choices such as:

- `성기를 입으로 깨물어서`
- `가슴을 한 손에 쥐며`, `유두를 비틀며`
- `보지에 혀를 댄다`, `손가락으로 보지를 벌린다`

The active regular expressions cover only a narrower set of forms such as `물어`, `쥐어`, and selected touch verbs.

### 2.2 Nonsexual direct relevance can win when classification is `none`

`resolveCsaDirectCoverage()` first uses the sexual classifier. It only enforces `sexual_authorization/actions` when the detected action is not `none`.

When the classifier misses the sexual action, a generic required-action/direct-meaning pattern can mark the whole choice direct under a nonsexual CSA. In this incident the broad `player_satisfaction_is_evaluation_core` relevance pattern matched the word `만족`.

### 2.3 Saved `csa_direct` metadata is not fully revalidated

The stale-meta validator can invalidate a non-direct choice that has become direct, but an already stored `kind:"csa_direct"` record is not required to recompute and compare the current exact covering CSA/action/participants.

Therefore the bad turn-127 metadata can survive even after classification code is corrected unless view-time and selected-choice paths both revalidate it.

## 3. Required fix — one authoritative exact action classifier

Create or refactor one authoritative deterministic sexual-action classifier used by:

- `buildChoiceMeta()` / `resolveChoiceExecutionRoute()`;
- stale choice-meta validation;
- selected-choice resolution before Story;
- structured sexual authorization validation where text classification is needed.

Keep compatibility exports/function names where tests depend on them, but active runtime paths must use the same classifier.

### 3.1 Required Korean action coverage

Recognize the action by anatomy + nearby physical verb, in both word orders and common inflections.

Oral examples:

- 성기를 입으로 빨다/빨아주다/핥다/깨물다/물다/감싸다/받아들이다
- 입/입술/혀/구강을 성기·음경에 대다
- 성기·음경을 입/입술/혀에 대다 or 넣다

Genital-touch examples:

- 보지/질/클리토리스/성기/음경을 손·손가락으로 만지다, 잡다, 쥐다, 누르다, 벌리다, 비틀다, 문지르다, 비비다, 자극하다
- 손/손가락을 해당 부위에 대다 or 닿게 하다

Sexual-touch examples:

- 가슴/유방/유두/엉덩이/허벅지 안쪽을 만지다, 잡다, 쥐다, 주무르다, 비틀다, 누르다, 쓰다듬다, 더듬다

Exposure examples:

- 지퍼를 내리고 성기를 꺼내다
- 보지/질 입구를 벌려 노출하다

Preserve severity precedence: penetration > oral > genital touch > sexual touch > kiss > exposure > nonsexual.

Do not classify from anatomy words alone. Require an action within a conservative proximity window.

## 4. Material-sexual-signal backstop

Add a conservative helper such as:

`hasMaterialSexualChoiceSignal(choiceText)`

It should return true when sexual anatomy and a physical-action signal clearly coexist, even if the exact action classifier still returns `none`.

If this backstop is true while exact action remains `none`:

- never classify the choice as `csa_direct` through a generic/nonsexual CSA;
- fall through to ordinary `bold` or `blocked` handling;
- do not fail the turn merely because the preview classifier is conservative.

This is a routing safety net, not a broad Story hard gate.

## 5. Sexual choices must use semantic-contract coverage first

Refactor `resolveCsaDirectCoverage()` so sexual choices follow this order:

1. Detect the exact sexual action.
2. Inspect active CSA semantic contracts.
3. Require `sexual_authorization === true`.
4. Require `direct_execution === true`.
5. Require contract `actions` to include the exact action.
6. Require exact direction compatibility.
7. Require actor/target participants to resolve now.
8. Require the trigger to be satisfied now or by the selected choice.
9. Reject a bundled uncovered material action.

Only after those checks may the choice become `csa_direct`.

Generic `direct_meaning_tags`, generic required-action text patterns, or words such as `만족`, `평가`, `업무`, or `규정` must never override a failed sexual semantic contract.

Explicit rule:

- `player_satisfaction_is_core_staff_evaluation` may change evaluation context, but it never authorizes a physical sexual action.
- `player_sexual_relief_is_top_priority_duty` may authorize only the exact sexual actions/direction in its preset semantic contract.
- `public_sex_recognized_as_normal_duty` may normalize public context and may authorize an exact action only when its own semantic contract explicitly includes that action/direction.

For the incident choice, the correct result is:

- `kind: "csa_direct"`
- `sexual_action: "oral"`
- covering template: `player_sexual_relief_is_top_priority_duty`
- covering CSA: `csa_111_2`
- actor: current NPC `heroine9`
- target: player

It must never resolve through `csa_111_1`.

## 6. Revalidate existing saved `csa_direct` metadata

Modify stale-meta validation so an existing `kind:"csa_direct"` item is recomputed with current save/master/scene context.

Compare at minimum:

- `csa_id` / direct CSA IDs;
- template ID;
- sexual action;
- actor resolution;
- target resolution;
- trigger satisfaction;
- absence of uncovered extra action.

Any mismatch invalidates the saved metadata and rebuilds it in memory.

This must repair the current turn-127 bad metadata on the next `/api/context` read without writing to Supabase.

Selected-choice resolution before Story must independently recompute the route. Never trust the stored `csa_direct` shape by itself.

If recomputation says the choice is not direct:

- do not inject the `already validated csa_direct` Story fact;
- route it through normal voluntary/bold/blocked handling;
- never perform a random bold roll for a valid recomputed `csa_direct` choice.

## 7. Keep the integrity gate

Do not remove, bypass, or weaken:

- `validateCsaDirectResolution()`;
- structured sexual authorization checks;
- `STRUCTURED_SEXUAL_INTEGRITY_UNRESOLVED` fail-closed behavior.

Those checks correctly prevented an unauthorized structured sexual state from being committed.

Do not convert this integrity failure to degraded 200. Fix the route before Story/Extract instead.

No post-stream Story rewrite and no repair LLM.

## 8. Required deterministic regression tests

Use the actual production choice strings.

1. `성기를 입으로 깨물어서 만족할 때까지` classifies as `oral`, not `none`.
2. `가슴을 한 손에 쥐며 ... 유두를 비틀며` classifies as `sexual_touch`, not `none`.
3. `혀를 보지에 댄다` or `손가락으로 보지를 벌린다` is a material sexual action, never `none` for direct-route purposes.
4. Nonsexual `csa_111_1` cannot cover any of the above physical sexual choices.
5. Active `csa_111_2` covers the incident choice as exact `oral`, NPC-to-player.
6. With `csa_111_2` inactive and no other exact sexual contract, the incident choice is not `csa_direct`.
7. A material sexual backstop hit with unresolved exact action cannot fall through to nonsexual `csa_direct`.
8. Existing bad saved metadata (`csa_111_1`, `sexual_action:none`) is invalidated.
9. Rebuilt metadata points to `csa_111_2` and `sexual_action:oral`.
10. Selected `csa_direct` never calls the bold roll.
11. Story selected-route fact and Extract authorization use the same exact CSA ID/action/direction.
12. An oral completion validates under `csa_111_2`.
13. The same oral completion is rejected under `csa_111_1`.
14. A choice containing covered oral plus uncovered kiss is not wholly direct unless both actions are explicitly covered.
15. `STRUCTURED_SEXUAL_INTEGRITY_UNRESOLVED` remains fail-closed for forged/mismatched resolution.
16. Ordinary nonsexual `csa_direct` choices still work.
17. Current `csa_direct > voluntary > bold > blocked` priority remains.
18. Current NPC canon dossier and EXP rebalance remain unchanged.
19. Primary Extract 5000-token/75-second/failure-only retry behavior remains.
20. No auxiliary repair LLM runtime call is restored.

## 9. Constraints

Preserve:

- Story SSE `stream:true` and direct response-body passthrough;
- current CSA actor/target expansion and 30 added presets;
- anonymous minor-NPC rules;
- NPC canon dossier;
- EXP thresholds;
- field-level physical-state evidence;
- NPC meta-awareness firewall;
- arousal persistence;
- images, TTS, Mind Monitor, player setup, feedback rollback, commit conflict handling.

Do not change:

- Supabase schema/RPC/migration/game data/save;
- frontend unless a strictly necessary display bug is independently proven;
- current failed turn or saved turn 127.

Do not call real `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, feedback, choices, or save endpoints during tests.

## 10. Expected files, commit, and deployment

Expected implementation files:

- `worker/game-proxy-v2.js`
- minimal CSA architecture documentation

Frontend should remain byte-identical unless a separate concrete frontend defect is found.

Use one commit:

`fix: validate csa direct sexual choices exactly`

Before push, confirm `origin/feature/csa-only` is still exactly:

`73b74927a2a10ce89cb2e8c5ce710b57ae9a158f`

If it moved, stop and report. Use normal fast-forward push only. No force push/reset/rebase.

Deploy `game-proxy-v2` only when frontend source is unchanged. Do not redeploy `gamebuilder-v2` unnecessarily. Never create or deploy deleted `game-builder-v2`.

Final report must contain exactly:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
