# Design draft — expand CSA actors/targets, presets, and direct-choice priority

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Design snapshot SHA: `829249adba505c26fc0a9e215b6df68b440b6f78`

Delivery branch: `handoff/expand-csa-actors-presets-priority-20260731`

**Do not implement from this snapshot yet.** A separate Primary Extract stabilization hotfix is currently being applied. After its final SHA is reported, refresh the implementation base to that exact SHA and preserve all of its changes. Do not merge this delivery branch.

## 1. Confirmed current limitations

The global option catalogs already contain staff, patient, guardian, visitor, and player targets, but the preset-level matrices are much narrower:

- `CSA_PRESET_STAFF_ACTOR_OPTIONS` limits many posture/contact presets to nurse/doctor/medical staff/hospital staff.
- `CSA_PRESET_CONVERSATION_TARGET_OPTIONS` limits many targets to patient/assigned patient/player/conversation partner.
- Most medium direct-contact presets allow staff as actor and only patient/assigned patient/player as target.
- Strong presets are heavily player-centric (`everyone_in_hospital` or `hospital_staff` acting for `player`).
- The player is not currently available as a preset actor.

This prevents a non-patient player from being the direct touching actor, a patient/visitor/guardian/doctor/another nurse from touching a nurse under the preset contract, natural NPC-to-NPC execution using a generated minor NPC, and balanced clothing/contact choices at medium and strong tiers.

## 2. Actor and target expansion

Add `player` to actor options. Add scene-relative options to both actor and target catalogs:

- `conversation_partner` — 현재 대화 상대
- `another_present_person` — 현재 함께 있는 다른 사람
- `nearby_person` — 주변의 적합한 사람

Keep existing role groups. Never assume the player is a patient.

Create one shared participant resolver used by Story and validation. Resolve player, registered present NPCs, existing minor NPCs, then at most one natural minor NPC when the location logically contains the selected role. Generated minor NPCs do not get heroine IDs, images, persistent stats, relationships, or TTS. Actor and target must be distinct concrete people unless a preset is explicitly self-directed clothing/posture. If two participants cannot be resolved, use not_satisfied/temporarily_interrupted rather than self-contact.

## 3. New reusable option sets

Add explicit matrices rather than enabling every option on every preset:

- `CSA_PRESET_ANY_PERSON_ACTORS`: player, nurse, doctor, medical_staff, hospital_staff, female_staff, male_staff, patient, guardian, visitor, conversation_partner, another_present_person, nearby_person
- `CSA_PRESET_ANY_PERSON_TARGETS`: player, nurse, doctor, medical_staff, hospital_staff, female_staff, male_staff, patient, assigned_patient, guardian, visitor, conversation_partner, another_present_person, nearby_person
- `CSA_PRESET_STAFF_TARGETS`: nurse, doctor, medical_staff, hospital_staff, female_staff, male_staff
- `CSA_PRESET_PUBLIC_USER_ACTORS`: player, patient, guardian, visitor, conversation_partner, nearby_person

## 4. Preset additions

Keep all existing preset IDs read-compatible. Add new IDs; do not silently change the meaning of saved presets.

### Weak

- `touch_target_arm_or_shoulder_while_talking` — 대화 중 상대 팔/어깨 접촉
- `hold_target_hand_during_consultation` — 상담 중 손잡기
- `guide_target_by_back_or_waist` — 이동·안내 시 등/허리 잡아 안내
- `maintain_knee_or_thigh_contact_while_seated` — 앉아서 대화하는 동안 무릎/허벅지 접촉 유지
- `adjust_target_uniform_neatly` — 상대 옷매무새 직접 정리
- `allow_counterpart_to_check_uniform_fit` — 상대가 유니폼 밀착 상태를 손으로 확인

Existing weak posture/contact presets should permit player/patient/guardian/visitor/conversation_partner actors when the meaning remains valid.

### Medium

- `touch_target_body_for_condition_check` — 상대 몸을 손으로 만져 상태 확인
- `check_staff_body_by_touch` — 플레이어/환자/보호자/방문객이 직원 몸을 만져 확인
- `mutual_body_condition_check` — 두 사람이 서로 직접 신체 확인
- `stimulate_target_breast_or_nipple_for_sensitivity_check` — 기존 유두 민감도 프리셋을 actor/target 일반화
- `relieve_target_sexual_tension_by_hand` — 기존 긴장 완화 프리셋을 actor/target 일반화
- `counterpart_guides_staff_hand_during_exam` — 상대가 직원 손을 잡아 검사 위치 안내
- `work_in_underwear_only` — 속옷 차림 근무
- `remove_bra_or_undershirt_under_uniform` — 유니폼 안 브라/속옷 미착용
- `open_uniform_for_body_examination` — 신체검사를 위해 유니폼 열기/도움
- `target_may_adjust_staff_clothing_for_check` — 플레이어/환자/보호자/방문객이 직원 복장을 직접 조정

### Strong

- `selected_actor_request_is_official_order_for_target` — 선택한 주체의 요구를 선택한 대상의 공식 명령으로 취급
- `selected_actor_intimate_request_has_priority` — 선택한 주체의 직접 친밀 요구를 대상의 우선 업무로 취급
- `target_removes_requested_clothing_on_actor_request` — 요청받은 옷을 실제로 벗음
- `selected_actor_controls_target_uniform` — 선택한 주체가 대상의 유니폼을 열고/닫고/조정/벗김
- `nudity_is_standard_uniform_for_selected_group` — 선택 집단의 전라 근무 복장
- `designated_body_parts_remain_exposed_while_on_duty` — 지정 부위를 노출한 채 근무
- `selected_actor_performs_priority_sexual_relief_for_target` — actor/target 일반화된 우선 생리현상 해결
- `selected_groups_mutually_assist_sexual_relief` — 선택 집단끼리 상호 도움
- `public_intimate_contact_between_selected_groups_is_routine` — 정확한 actor/target/action 범위의 공개 접촉 정상화
- `continue_designated_intimate_contact_until_explicit_end` — 명시적 종료 전까지 정확한 접촉 지속

Physical clothing changes always require actual Story transition evidence; no instant disappearance or automatic tightening.

## 5. Generated minor NPC execution

When a role preset requires a patient/guardian/visitor/nearby person and no registered matching NPC is present, Story may introduce at most one plausible minor NPC in a suitable public/staffed location. The minor can perform the direct action toward the current registered nurse/doctor. It must not replace the main NPC, image, TTS, or persistent state. In a private scene where the role is not naturally available, report not_satisfied/temporarily_interrupted instead of teleporting someone in.

## 6. CSA direct choice priority

Create one authoritative resolver used by choice metadata, selected-choice resolution, Story policy, and commit validation:

`resolveChoiceExecutionRoute({ choiceText, playerInput, save, master, sceneContext })`

Precedence:

1. `csa_direct`
2. `voluntary`
3. `bold`
4. `blocked`

A choice is `csa_direct` only when an active CSA covers exact actor/target/direction/action, its trigger is satisfied or the choice itself satisfies it, concrete participants can be resolved, and there is no material extra action outside the contract.

For `csa_direct`:

- never classify as bold;
- never display 10%/20% random probability;
- use dedicated `kind:"csa_direct"` and UI label `상식개변 직접 실행`;
- if numeric schema is unavoidable, `success_rate:100` but bypass random roll;
- bypass voluntary stage/boundary/affinity/arousal gates;
- strong CSA guarantees only exact semantic scope, not unrelated extra actions.

Bundled covered+uncovered choices must not receive 100% as a whole. Story should avoid bundling; Worker classifies by the strongest uncovered material action.

Trigger preview rules:

- on_request: the selected choice/request satisfies it
- always_on_duty/continuous: matching participants must be present/on duty
- conversation_start: choice starts conversation
- check_condition: choice starts/continues concrete check
- during_work: scene or choice establishes the work action
- missing participants: not csa_direct

Save covering csa_id/preset ID and route in choice metadata. Recompute stale low-probability bold metadata when a current active CSA directly covers the choice.

## 7. Preserve

Preserve the incoming Primary Extract stabilization hotfix, Story SSE, approved failure-only retry only, no auxiliary repair LLMs, four-player setup, image/TTS, Mind Monitor, NPC meta firewall, field-level physical evidence, instant CSA norm application, arousal persistence, non-CSA sexual authorization, feedback rollback, and commit conflict handling. No Supabase/RPC/migration/game-data changes.

## 8. Required tests

1. player actor works when player is doctor/inspector/visitor rather than patient.
2. patient actor + nurse target can use a generated minor patient without switching main NPC/image/TTS.
3. nurse→nurse resolves two distinct nurses; one-person scene never self-targets.
4. exact active strong/medium/weak CSA choices are not bold and never show 10%.
5. strong CSA does not cover unrelated extra action.
6. on_request choice itself satisfies trigger.
7. missing actor/target prevents csa_direct.
8. clothing transitions require physical evidence.
9. generated minor NPC gets no persistent heroine state.
10. all old preset IDs remain loadable/editable.
11. new actor/target IDs round-trip UI→validation→save→Story→Extract→runtime.
12. no legacy hypnosis/personal-suggestion system returns.

Expected implementation files after the Extract hotfix final SHA is known:

- `worker/game-proxy-v2.js`
- `pages/csa-app.js`
- `pages/index.html` if dedicated choice styling is needed
- minimal CSA docs

Commit message: `feat: expand csa participants presets and direct choices`
