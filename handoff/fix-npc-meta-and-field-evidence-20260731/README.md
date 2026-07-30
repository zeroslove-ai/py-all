# Hotfix — hide CSA mechanics from NPCs and validate physical state per field

Repository: `zeroslove-ai/py-all`

Production branch: `feature/csa-only`

Required production HEAD before starting:

`95d87bc55e38575abb6817d553cab3fe6137ba8d`

Delivery-only branch:

`handoff/fix-npc-meta-and-field-evidence-20260731`

Do **not** merge this delivery branch. Read this document, then implement directly on a new local branch created from the exact production HEAD above.

## 1. Bugs confirmed from the live screen and current code

### Bug A — NPC Mind Monitor has forbidden meta knowledge

The live Mind Monitor surface thought included:

`상식개변 때문이지만, 이건 너무 과한 거 아니에요?`

This is invalid. An NPC may know an ordinary in-world rule, regulation, custom, etiquette, or work procedure, but must never know that:

- common sense was changed;
- an app/system/effect activated;
- the player rewrote the rule;
- the current norm differs from an earlier reality;
- they are being controlled by a mechanic.

The current code already detects `상식개변` and related meta-awareness in `npc_emotion`, but P1 only logs `csa_meta_awareness_observed`; it does not invalidate or replace the offending Mind Monitor field. Story text is also only observed because post-stream rewriting was intentionally removed.

### Bug B — physical-state evidence is character-level, not field-level

The current `retainEvidencedNpcSceneStatePatch()` accepts or rejects an entire character patch from one evidence string.

That means one quote proving `underwear_bottom = removed` can accidentally authorize unrelated simultaneous changes such as `uniform_bottom = tight` and `posture = sitting`. Conversely, one bad field can discard other correctly evidenced fields.

The evidence gate also checks exact-substring and non-magical wording, but does not reliably distinguish a completed action from a plan such as `벗어야겠다`.

## 2. Required behavior contract

### A. NPC epistemic firewall

When an active CSA applies, or the current turn is a validated `app_transaction`:

1. NPC dialogue, surface thought, and inner thought must not use or imply the mechanism.
2. Forbidden NPC concepts/phrases include:
   - `상식개변`, `개변된 상식`, `개변 효과`;
   - app/application/system/effect activation as the reason for behavior;
   - `플레이어가 규칙을 바꿨다/설정했다`;
   - `원래는 달랐는데 지금은 해야 한다`;
   - being controlled, forced, rewritten, or manipulated by an external mechanic.
3. NPCs may naturally refer to in-world terms such as:
   - 병원 규정;
   - 근무 수칙;
   - 절차;
   - 관행;
   - 예절;
   - 당연한 상식.
4. The NPC must treat the norm itself as ordinary and valid.
5. The NPC may still feel embarrassment, urgency, inconvenience, bodily reaction, or discomfort about the player going beyond the norm's direct scope.
6. The NPC may question the player's unnecessary behavior, but not the existence or legitimacy of the norm itself.

Correct rewrite of the screenshot's surface thought:

`“규정 확인 절차라지만 이렇게 가까이 보여야 하니 얼굴이 화끈거린다. 빨리 확인을 끝내고 업무로 돌아가고 싶다.”`

The player and the app UI may mention `상식개변`. Do not sanitize player input, player dialogue, player inner thought, app UI text, structured action data, or developer logs.

### B. Streaming-first Story prevention

Do not restore post-stream narrative repair or replacement.

Add a compact, final, recency-favored Story guard, for example `buildNpcCsaEpistemicFirewallSection()`, and inject it after the other CSA/structured-action sections. Prefer a final system message after the user message when an applicable CSA or `app_transaction` exists, so the rule remains the closest instruction to generation.

The guard must explicitly cover:

- NPC direct dialogue;
- NPC internal thought represented in Story;
- narrator claims about what an NPC consciously knows;
- Mind Monitor generation instructions referenced by Extract.

Do not globally ban words such as `규정`, `관행`, or `상식`. Only ban awareness of the game mechanic or prior-reality rewrite.

### C. Deterministic Mind Monitor protection

Extend the existing per-field validation/fallback path; do not add an LLM repair call.

Requirements:

1. Determine `forbidCsaMetaAwareness` from the post-plan effective save:
   - an applicable active CSA exists; or
   - the current turn is a validated `app_transaction`.
2. Pass this context into `validateNpcEmotion()` or a narrow companion validator.
3. For each of `surface`, `inner`, and `physical_reaction`:
   - when the field contains CSA meta-awareness, add an error only to that field;
   - preserve valid sibling fields;
   - replace only the invalid field using the existing deterministic `resolveMindMonitorDegradedFallback()` path;
   - set `mind_monitor_source = 'degraded'` when any field is replaced;
   - log field names, not full sensitive text.
4. A field that says only `규정대로`, `병원 절차`, `관행`, or similar in-world language is valid unless it also claims the norm was changed or externally imposed.
5. Keep the existing length, first-person, physical-sentence, and repeat checks.

### D. Dialogue/TTS structured-field protection

The Story prompt is the primary prevention layer, but structured output must not preserve or vocalize an offending NPC line.

After `filterMainNpcDialogue()` or inside a narrow CSA-aware companion:

- remove only NPC `dialogue_lines` whose spoken text contains meta-awareness;
- do not remove player dialogue;
- do not remove ordinary references to hospital rules/procedures;
- log `csa_meta_dialogue_filtered` with `request_id`, `character_id`, and count only;
- never fail the turn because a line was filtered.

This may cause TTS to omit the invalid line, which is preferable to vocalizing forbidden meta knowledge. Do not change `/api/tts`, frontend playback, or dialogue parsing contracts.

### E. Prevent structured-memory contamination

The following NPC-owned structured text must not persist meta-awareness:

- `npc_emotion`;
- NPC `dialogue_lines`;
- NPC relationship-memory additions when they explicitly claim awareness of the CSA mechanism;
- turn-summary sentences that explicitly attribute that awareness to an NPC.

Use deterministic sentence/entry filtering. Drop only the offending sentence or entry and preserve valid content. If a summary becomes empty, use a short neutral deterministic fallback rather than an LLM call. Do not alter player-owned text or the raw streamed narrative.

Keep the existing `csa_meta_awareness_observed` log for Story visibility, but add structured-field sanitation before Commit.

## 3. Field-level physical evidence

### A. Evidence shape

Replace the ambiguous character-level evidence contract with a field map:

```json
{
  "npc_scene_state_evidence": {
    "heroine1": {
      "clothing.uniform_top": "exact Story quote",
      "clothing.uniform_bottom": "exact Story quote",
      "clothing.underwear_top": "exact Story quote",
      "clothing.underwear_bottom": "exact Story quote",
      "posture": "exact Story quote",
      "current_action": "exact Story quote"
    }
  }
}
```

This field remains transient and must never be written into `game_save`.

A legacy character-level string may be accepted only when that character patch contains exactly one actual changed field. When multiple fields change, a single shared string is ambiguous and must not authorize all fields.

### B. Compare against the previous state

Change the evidence gate so it receives at least:

- proposed `npc_scene_state_patch`;
- evidence map;
- final Story text;
- previous `save.npc_scene_state`;
- previous/current NPC presence information;
- registered character data when needed for actor identity.

For each character and each supported field:

1. Compare the proposed value with the previous stored value.
2. Unchanged values do not require evidence and need not be re-saved.
3. Validate each actually changed field independently.
4. Retain valid fields even when sibling fields are rejected.
5. Preserve the previous value for each rejected field.
6. If every changed field is rejected, omit that character from the patch.

### C. Evidence validity

A changed field is retained only when its evidence:

1. is an exact substring of the final Story;
2. identifies the correct NPC, directly or through an unambiguous immediately adjacent pronoun context;
3. is not magical physical-transition wording;
4. describes the relevant field's actual current/completed physical state;
5. is not merely an intention, plan, question, or future action.

Planning-only examples that do **not** prove completion:

- `속옷을 벗어야겠다`;
- `갈아입을 생각을 했다`;
- `잠시 후 탈의실에 가려고 했다`;
- `앉을까 고민했다`;
- `자세를 바꿀 준비를 했다`.

Completed-action examples that may prove a change:

- `한소영은 탈의실에서 속옷을 실제로 벗고 돌아왔다.`
- `한소영은 새 유니폼으로 갈아입은 뒤 단추를 채웠다.`
- `한소영은 의자를 당겨 직접 앉았다.`
- `한소영은 자리에서 일어나 복도 쪽으로 걸어갔다.`

Use narrow field/action helpers. This is an optional scene-state persistence safeguard, not a general Story hard gate.

### D. New/off-screen NPC initialization

Do not overcorrect legitimate off-screen continuity.

- A currently visible NPC with a stored state must show a real transition before that state changes.
- A newly entering or previously off-screen NPC may appear already compliant when enough time/access plausibly existed.
- In that case, an exact Story quote explicitly observing the current garment/posture may initialize the field even without an on-screen changing sequence.
- A same-moment app transaction must not retroactively turn a visible NPC into an already-compliant state.

### E. Logging and fail-open behavior

Log rejected field paths, not full narrative/evidence text:

```json
{
  "event": "csa_physical_transition_rejected",
  "character_id": "heroine1",
  "fields": ["clothing.uniform_bottom", "posture"],
  "reasons": ["planning_only", "missing_exact_evidence"]
}
```

A rejected scene-state field must never cause a 422/500 or discard Story, Mind Monitor, image, TTS, stats, choices, or the whole character's other valid state fields.

## 4. Preserve current production behavior

Must remain unchanged:

- production base `95d87bc55e38575abb6817d553cab3fe6137ba8d`;
- four complete player candidates and all required player fields;
- `resolveSetupSelection`, `player_action`, and same-input selection plus edits;
- Story SSE `stream: true` and direct `new Response(deepseekRes.body, ...)` passthrough;
- one Primary Extract attempt;
- no JSON repair LLM;
- no Mind Monitor repair LLM;
- no first-encounter repair LLM;
- no post-stream CSA narrative replacement;
- CSA-first direct execution before voluntary gates;
- validated app transactions remain fail-closed for proof/DB/structured-integrity failures;
- images, shortlist, `image_id`, `/api/image`, frontend image rendering;
- TTS, `dialogue_lines`, `/api/tts`, playback and replay;
- NPC stats, relationships, sidebar, feedback rollback, Commit conflict handling;
- immediate activate/update/deactivate semantics from `95d87bc`;
- physical state never changes magically.

Do not restore legacy hypnosis/personal-suggestion runtime behavior.

## 5. Files and deployment

Primary file:

- `worker/game-proxy-v2.js`

Documentation may be minimally updated:

- `docs/project_v2/CSA_ONLY_BRANCH.md`
- `docs/project_v2/STREAM_FIRST_ARCHITECTURE.md`

Do not modify frontend runtime files, Supabase, RPCs, migrations, game data, save data, image data, or TTS data.

## 6. Static verification

Do not call real `/api/story`, `/api/extract`, `/api/commit-turn`, `/api/reset`, feedback, choice, save, or game-state mutation endpoints.

Run:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/ui.js
node --check pages/stream.js
node --check pages/api.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

Confirm required symbols remain:

- `stream: true`
- `new Response(deepseekRes.body`
- `/api/image`
- `/api/tts`
- `npc_emotion`
- `dialogue_lines`
- `image_id`
- `player_recommendations`
- `resolveSetupSelection`
- `player_action`
- `MIND_MONITOR_DEGRADED_FALLBACKS`
- `buildCsaPhysicalTransitionSection`

Confirm runtime calls remain absent:

- `repairRawJsonOutput(`
- `repairMindMonitor(`
- `repairMissingFirstEncounterStats(`
- post-Story `resolveCsaNarrativeIntegrity(` invocation
- ordinary full Extract retry with `maxAttempts: 2`

Confirm frontend runtime files are unchanged:

```powershell
git diff --exit-code 95d87bc55e38575abb6817d553cab3fe6137ba8d -- pages/sidebar.js pages/tts.js pages/ui.js pages/stream.js pages/api.js pages/index.html
```

Add focused static/unit assertions for:

1. `상식개변 때문이지만` in `npc_emotion.surface` invalidates only `surface` and uses deterministic fallback.
2. `규정대로지만 창피하다` remains valid.
3. an NPC `dialogue_line` mentioning app/system manipulation is filtered; player dialogue is preserved.
4. one valid underwear evidence quote cannot authorize a simultaneous uniform/posture change.
5. planning-only evidence does not persist a change.
6. valid completed evidence retains only its matching field.
7. valid sibling fields survive when another field is rejected.
8. newly entering/off-screen NPC observable state can initialize with explicit evidence.
9. no rejected evidence causes turn failure.

## 7. Commit, push, deploy

Use one commit:

`fix: hide csa mechanics from npcs and validate scene fields`

Before push:

- fetch `origin`;
- ensure `origin/feature/csa-only` is still exactly `95d87bc55e38575abb6817d553cab3fe6137ba8d`;
- normal fast-forward push only;
- no force push.

Deploy only API Worker `game-proxy-v2` from `worker` with the final Git SHA as tag/message. Do not redeploy `gamebuilder-v2` when frontend files are unchanged.

Final report must include:

- start SHA;
- final SHA and commit message;
- changed files;
- field-level evidence behavior;
- Mind Monitor/NPC meta-awareness behavior;
- static verification results;
- API Worker Version ID and `/api/version` tag;
- confirmation that frontend and Supabase/game data were unchanged;
- `기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`.
