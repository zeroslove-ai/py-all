# Implementation handoff — expand CSA actors/targets, presets, and direct-choice priority

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`d44ead50d22b2cb89eb18df88aeb7d36f6245e80`

This HEAD includes the Primary Extract stabilization hotfix (`fix: stabilize primary extract analysis`). Preserve it completely.

Delivery-only branch:

`handoff/expand-csa-actors-presets-priority-20260731`

Do **not** merge this delivery branch. Read this document and implement directly on a new local branch created from the exact production HEAD above.

## 1. Goals

Implement all three requests together:

1. Expand preset actor/target choices so the player is not assumed to be a patient and player/NPC/background-role actors can act on nurses, doctors, staff, patients, guardians, visitors, and other present people when the preset meaning permits it.
2. Add more weak/medium/strong presets, especially player-or-NPC initiated contact and medium/strong clothing rules.
3. Make exact active CSA coverage outrank bold-choice probability. A choice directly covered by an active CSA must never display or roll 10%/20% bold probability.

Do not weaken the exact semantic-scope rule. A strong CSA guarantees only the actor/target/direction/action/trigger it actually contains, not unrelated extra actions.

## 2. Confirmed current limitations

The global catalog already has several hospital role groups, but preset-level matrices are narrower:

- Many posture/contact presets use staff-only actor options.
- Medium contact presets are mainly staff → patient/assigned patient/player.
- Strong presets are heavily hospital-wide or player-targeted.
- `player` is not generally available as a preset actor.
- Choice metadata can still classify a CSA-covered choice as `bold` and show a low probability because CSA relevance currently behaves like a bonus rather than an authoritative route.

The player profile may be a doctor, inspector, employee, visitor, patient, or another adult role. Never infer `player === patient` from the hospital setting.

## 3. Actor and target option expansion

### 3.1 New shared option IDs

Add these IDs to the server-owned option catalog and labels:

- `player` — 플레이어
- `conversation_partner` — 현재 대화 상대
- `another_present_person` — 현재 함께 있는 다른 사람
- `nearby_person` — 주변의 적합한 사람

Keep all existing role IDs and labels.

### 3.2 Reusable matrices

Create reusable, explicit matrices instead of enabling every option on every preset:

- `CSA_PRESET_ANY_PERSON_ACTORS`
  - player
  - nurse
  - doctor
  - medical_staff
  - hospital_staff
  - female_staff
  - male_staff
  - patient
  - guardian
  - visitor
  - conversation_partner
  - another_present_person
  - nearby_person

- `CSA_PRESET_ANY_PERSON_TARGETS`
  - player
  - nurse
  - doctor
  - medical_staff
  - hospital_staff
  - female_staff
  - male_staff
  - patient
  - assigned_patient
  - guardian
  - visitor
  - conversation_partner
  - another_present_person
  - nearby_person

- `CSA_PRESET_STAFF_TARGETS`
  - nurse
  - doctor
  - medical_staff
  - hospital_staff
  - female_staff
  - male_staff

- `CSA_PRESET_PUBLIC_USER_ACTORS`
  - player
  - patient
  - guardian
  - visitor
  - conversation_partner
  - nearby_person

Use narrower matrices where needed. Do not make self-directed clothing/posture presets require two different people, but all counterpart-contact presets must resolve actor and target as distinct concrete people.

### 3.3 One participant resolver

Create one authoritative participant resolver shared by:

- preset semantic-contract generation;
- Story CSA instruction formatting;
- choice-route classification;
- selected-choice resolution;
- CSA trigger/direct-resolution validation.

Suggested shape:

`resolveCsaParticipants({ actorGroup, targetGroup, save, master, narrativeText, choiceText, currentCharacterId })`

Resolution priority:

1. `player` resolves to the player regardless of player job.
2. Exact registered NPCs currently present.
3. Current conversation partner/current main NPC.
4. Another registered present NPC matching the requested role.
5. A role-explicit minor NPC already established in the current narrative.
6. At most one new anonymous minor NPC when the location naturally contains that role.

Actor and target must be distinct unless the preset is explicitly self-directed.

If participants cannot be resolved naturally, the CSA evaluation is `not_satisfied` or `temporarily_interrupted`; never silently convert the actor/target, self-target, or teleport a role into a private scene.

## 4. Generated minor NPC execution

The Story may create at most one anonymous role-labeled minor NPC in a turn when a preset requires a plausible patient/guardian/visitor/nearby person and no matching registered NPC is available.

Allowed examples:

- `대기 중이던 환자`
- `옆에 서 있던 보호자`
- `접수 창구의 방문객`

Rules:

- Use only in locations where that role is naturally available: lobby, waiting area, ward corridor, nurse station, consultation area, public treatment area.
- Do not create one in an isolated locked/private room without an established entrance.
- The minor NPC may directly touch or adjust the current registered nurse/doctor when the exact preset covers it.
- It gets no heroine ID, no persistent stats, no relationship, no Mind Monitor, no image selection, and no TTS line extraction.
- It must not replace `character_id`, current main NPC, image, TTS, or relationship target.
- Do not save it to `master.characters`, `npc_stats`, `npc_relationship_state`, `npc_locations`, or image state.
- Do not generate a persistent proper name. Use a role description.
- A choice can be `csa_direct` through a minor NPC only when the role is explicitly established in the current narrative or explicitly introduced by that choice in a plausible public scene.

## 5. Preset catalog additions

Keep every existing preset ID read-compatible. Add new IDs; do not repurpose or silently change an existing saved preset's meaning.

Each new preset must include the same canonical server-owned fields as existing presets:

- fixed strength
- category
- actor options/default actor
- target options/default target where applicable
- trigger options/default trigger
- duration options/default duration
- content template
- semantic contract: actor, target, direction, required action, direct meaning tags, direct execution, public normalization, sexual authorization only when exact action warrants it

### 5.1 Weak presets

Add at minimum:

1. `touch_target_arm_or_shoulder_while_talking`
   - 대화 중 상대 팔이나 어깨에 손을 대는 것이 자연스럽다.
   - actors: broad person actors
   - targets: broad person targets
   - not sexual authorization

2. `hold_target_hand_during_consultation`
   - 상담·설명 중 상대 손을 잡고 유지하는 것이 자연스럽다.

3. `guide_target_by_back_or_waist`
   - 이동·안내 시 등이나 허리를 가볍게 잡아 이끄는 것이 자연스럽다.

4. `maintain_knee_or_thigh_contact_while_seated`
   - 가까이 앉아 대화할 때 무릎/허벅지 접촉을 유지하는 것이 자연스럽다.
   - exact non-genital contact only

5. `adjust_target_uniform_neatly`
   - 상대 옷깃·소매·허리선 등 옷매무새를 직접 정리하는 것이 자연스럽다.

6. `allow_counterpart_to_check_uniform_fit`
   - 상대가 유니폼 밀착 상태나 옷매무새를 손으로 확인하는 것이 자연스럽다.

Also widen existing weak contact/posture presets to include player/patient/guardian/visitor/conversation-partner actors where the literal action remains weak and nonsexual.

### 5.2 Medium presets

Add at minimum:

1. `touch_target_body_for_condition_check`
   - 선택한 주체가 선택한 대상의 몸을 손으로 만져 상태를 확인한다.

2. `check_staff_body_by_touch`
   - 플레이어·환자·보호자·방문객 등이 간호사/의사/직원의 몸을 직접 만져 확인한다.

3. `mutual_body_condition_check`
   - 선택한 두 집단이 서로의 신체 상태를 직접 확인한다.

4. `stimulate_target_breast_or_nipple_for_sensitivity_check`
   - 가슴/유두 민감도 확인 행동을 actor/target 일반화한다.
   - exact breast/nipple action only

5. `relieve_target_sexual_tension_by_hand`
   - 선택한 주체가 선택한 대상의 성적 긴장을 손으로 완화하는 절차.
   - exact manual action only; no oral/intercourse expansion

6. `counterpart_guides_staff_hand_during_exam`
   - 상대가 직원의 손을 잡아 검사 위치로 직접 안내한다.

7. `work_in_underwear_only`
   - 선택 집단이 속옷 차림으로 근무/업무를 수행한다.

8. `remove_bra_or_undershirt_under_uniform`
   - 선택 집단이 유니폼 안 브라/속옷 상의를 착용하지 않는 것이 규정이다.

9. `remove_underwear_bottom_under_uniform`
   - 선택 집단이 유니폼 안 하의 속옷을 착용하지 않는 것이 규정이다.

10. `open_uniform_for_body_examination`
    - 신체 확인을 위해 유니폼의 해당 부위를 직접 열거나 조정하는 것이 정상 절차다.

11. `target_may_adjust_staff_clothing_for_check`
    - 플레이어·환자·보호자·방문객 등 선택한 주체가 직원의 유니폼을 직접 조정해 확인한다.

12. `change_into_tighter_or_looser_uniform_for_duty`
    - 선택 집단이 업무 목적에 맞는 더 밀착되거나 느슨한 별도 유니폼으로 실제 갈아입는다.
    - existing clothing does not magically resize

### 5.3 Strong presets

Add at minimum:

1. `selected_actor_request_is_official_order_for_target`
   - 선택한 주체의 정확한 범위 내 요구를 선택한 대상의 공식 명령으로 취급한다.

2. `selected_actor_intimate_request_has_priority`
   - 선택한 주체의 정확한 친밀 요구를 대상의 우선 업무로 취급한다.
   - semantic action scope must remain explicit

3. `target_removes_requested_clothing_on_actor_request`
   - 선택한 주체가 정확히 지정한 복장을 대상이 실제로 벗는다.

4. `selected_actor_controls_target_uniform`
   - 선택한 주체가 대상의 유니폼을 열고, 닫고, 조정하거나 벗기는 것이 공식 권한이다.

5. `nudity_is_standard_uniform_for_selected_group`
   - 선택 집단의 전라 상태가 표준 근무 복장이다.
   - requires actual undressing transition

6. `designated_body_parts_remain_exposed_while_on_duty`
   - 선택한 신체 부위를 노출한 채 근무하는 것이 표준이다.

7. `selected_actor_performs_priority_sexual_relief_for_target`
   - 선택한 주체가 선택한 대상에게 지정된 성적 긴장 완화 행동을 우선 수행한다.
   - action must be explicit; do not authorize unrelated sexual actions

8. `selected_groups_mutually_assist_sexual_relief`
   - 선택한 두 집단 사이에 지정된 상호 행동이 정상 업무다.

9. `public_intimate_contact_between_selected_groups_is_routine`
   - 선택한 actor/target/action 조합의 공개 접촉만 정상화한다.

10. `continue_designated_intimate_contact_until_explicit_end`
    - 지정된 접촉을 명시적으로 종료할 때까지 계속 유지한다.
    - preserve temporary interruption/paused behavior for real obstacles and player agency

11. `selected_actor_sets_target_working_posture`
    - 선택한 주체가 지정한 대상의 근무 자세를 정하고 대상은 실제로 자세를 전환한다.

12. `selected_actor_controls_target_clothing_and_posture`
    - 정확히 지정된 복장 조정과 자세 전환을 공식 절차로 실행한다.
    - no action beyond the selected clothing/posture fields

All clothing and posture presets remain subject to the existing physical-continuity contract: norms change immediately; clothing, fasteners, and posture change only through actual Story actions and field-level evidence.

## 6. Preset UI behavior

`pages/csa-app.js` already renders server-provided options generically. Preserve that architecture.

Requirements:

- New actor/target option IDs must round-trip UI → `/api/app-validate` → canonical action → save → app reload.
- Changing strength resets incompatible preset choices as it does now.
- Preset fixed strength remains authoritative.
- Do not hardcode a second frontend catalog.
- Do not reintroduce personal suggestion/hypnosis controls.
- Existing saved presets remain editable with their original IDs and values.

## 7. CSA direct-choice route

Create one authoritative route resolver used by:

- `buildChoiceMeta()` or its current equivalent;
- stale choice-meta recomputation in public context;
- selected-choice resolution before Story;
- Story policy injection;
- commit/structured authorization validation.

Suggested API:

`resolveChoiceExecutionRoute({ choiceText, playerInput, save, master, narrativeText, sceneContext })`

Precedence:

1. `csa_direct`
2. `voluntary`
3. `bold`
4. `blocked`

### 7.1 Exact csa_direct requirements

A choice is `csa_direct` only when:

- an active CSA semantic contract covers the exact actor;
- it covers the exact target;
- it covers direction and action;
- its trigger is already satisfied or the selected choice itself satisfies the trigger;
- concrete participants can be resolved;
- the choice contains no material extra action outside the contract.

For `csa_direct`:

- metadata `kind: "csa_direct"`;
- include covering `csa_id`, preset/template ID, action, actor/target resolution, and route reason;
- `success_rate` may be `100` only for schema compatibility;
- do not run a random roll;
- do not call `resolveBoldChoiceAttempt()` for it;
- bypass affinity/arousal/intimacy/voluntary-consent probability gates for the exact CSA action;
- preserve physical feasibility and player agency;
- missing participants or impossible immediate conditions produce not-satisfied/paused behavior, not a 10% roll.

### 7.2 Mixed actions

A choice containing a covered action plus an uncovered material action must not be 100% as a whole.

Example:

- CSA covers uniform inspection.
- Choice says inspect uniform **and kiss her**.
- Uniform inspection is direct; kiss remains voluntary/bold/blocked.

Story should avoid bundled mixed choices. Worker must classify by the strongest uncovered material action if bundling still appears.

### 7.3 Trigger previews

- `on_request`: the choice/request itself can satisfy the trigger.
- `conversation_start`: a choice that starts the conversation can satisfy it.
- `check_condition`: a concrete check choice can satisfy it.
- `during_work`: current scene or the choice must establish the work action.
- continuous/always-on-duty: participants and duty context must exist.
- missing actor/target: not `csa_direct`.

### 7.4 Story choice generation

When an active CSA is directly applicable:

- mandatory direct actions execute in Story without waiting for a choice;
- `[3. 선택지]` should include at least one clean continuation/request that stays exactly inside an applicable CSA when narratively useful;
- do not mark that choice as risky prose;
- do not bundle unrelated escalation into it;
- other choices may remain voluntary/bold/blocked.

## 8. Frontend choice display

Update `pages/ui.js::renderGameplayChoices()` to support `kind === "csa_direct"` before bold handling.

Display:

`🌀 상식개변 직접 실행 · {choice text}`

Rules:

- no `성공률 10%/20%/100%` text;
- dedicated CSS class such as `csa-direct-choice`;
- not styled as blocked or bold;
- full original choice text still goes to click callback and history;
- existing 30-character button label shortening remains;
- setup choices remain unaffected.

Add minimal CSS in `pages/index.html` only if necessary.

## 9. Stale metadata and selected-choice resolution

- Recompute stored `kind:"bold"` metadata when active CSA/current scene now directly covers the choice.
- A stored low probability must not survive after a matching CSA activation/update.
- `resolveBoldChoiceAttempt()` must return null for `csa_direct` metadata.
- Selected `csa_direct` choice must inject an established direct-execution fact into Story without a random result block.
- Store/reuse exact `choice_index` and `choice_text` as currently implemented.

## 10. Preserve current systems

Preserve without regression:

- Primary Extract stabilization from `d44ead5`:
  - max tokens 5000
  - timeout 75000
  - failure-only retry, maximum two identical Primary Extract attempts
  - concise JSON contract
  - Story choices authoritative
  - diagnostic metadata without raw model output
- Story SSE `stream: true` and direct `new Response(deepseekRes.body, ...)`;
- no JSON repair LLM;
- no Mind Monitor repair LLM;
- no first-encounter repair LLM;
- no post-stream Story replacement;
- four complete player candidates and `player_action` identity;
- image/TTS/Mind Monitor;
- NPC CSA epistemic firewall;
- field-level physical transition evidence;
- instant norm application and non-magical physical continuity;
- arousal persistence;
- non-CSA sexual authorization and player agency;
- feedback rollback and commit conflict handling.

Do not modify Supabase, RPCs, migrations, game data, saves, images, or TTS data.

## 11. Required deterministic tests

Add focused tests or an isolated deterministic script covering at least:

1. Player actor resolves correctly when player job is doctor, inspector, visitor, employee, or patient.
2. `player` is never automatically resolved as `patient`.
3. Patient actor + nurse target can use one anonymous minor patient in a plausible public ward scene.
4. A private isolated scene does not teleport a patient/visitor in.
5. Minor NPC execution does not change main `character_id`, image, TTS, Mind Monitor, stats, relationship, or locations.
6. Nurse → nurse resolves two distinct registered nurses when both are present.
7. One-person scene never self-targets for counterpart-contact presets.
8. New actor/target IDs round-trip through preset payload, validation, canonical operation, saved entry, and app payload.
9. Every existing preset ID remains present/loadable.
10. Every new preset has fixed strength, valid options, valid defaults, content template, and normalized semantic contract.
11. Exact weak CSA-covered choice is `csa_direct`, no bold roll.
12. Exact medium CSA-covered choice is `csa_direct`, no bold roll.
13. Exact strong CSA-covered choice is `csa_direct`, no 10% or 20% display.
14. `on_request` choice itself satisfies the trigger.
15. Missing participants prevents `csa_direct`.
16. Covered + uncovered bundled action is not wholly `csa_direct`.
17. Stale stored bold metadata is recomputed to `csa_direct` when current CSA covers it.
18. `resolveBoldChoiceAttempt()` does not roll for `csa_direct`.
19. UI displays `상식개변 직접 실행` with no probability.
20. Clothing presets still require completed physical transitions and field evidence.
21. No legacy hypnosis/personal-suggestion UI or runtime returns.
22. Primary Extract normal success still performs one model call; failure-only retry behavior remains unchanged.

Do not call real `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, choice, feedback, or save endpoints.

## 12. Static checks

Run:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/csa-app.js
node --check pages/ui.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/stream.js
node --check pages/api.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

Check `pages/index.html` inline script using the repository's existing extraction/check method rather than running `node --check pages/index.html` directly.

## 13. Expected files, commit, and deployment

Expected implementation files:

- `worker/game-proxy-v2.js`
- `pages/ui.js`
- `pages/index.html` for minimal `csa_direct` styling if needed
- `pages/csa-app.js` only if generic rendering needs a small compatibility change
- minimal CSA docs

Commit message:

`feat: expand csa participants presets and direct choices`

Before push, verify `origin/feature/csa-only` is still exactly:

`d44ead50d22b2cb89eb18df88aeb7d36f6245e80`

If it moved, stop and report. Use normal fast-forward push only. No force push, reset, rebase, or history rewriting.

Deploy both when frontend files changed:

- `game-proxy-v2`
- `gamebuilder-v2`

Never create or deploy deleted `game-builder-v2`.

Do not write Supabase or game data. Do not run gameplay functional tests.
