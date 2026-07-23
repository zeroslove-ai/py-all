import fs from 'node:fs';

const workerPath = 'worker/game-proxy-v2.js';
const testPath = 'test/worker.test.js';
const pagePath = 'pages/index.html';
const docPath = 'docs/project_v2/IMAGE_CATALOG_CONTRACT.md';
let worker = fs.readFileSync(workerPath, 'utf8');
let tests = fs.readFileSync(testPath, 'utf8');
let page = fs.readFileSync(pagePath, 'utf8');
let doc = fs.readFileSync(docPath, 'utf8');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

worker = replaceOnce(
  worker,
  `async function handleImage(req, env) {
  const { game_id, character_id, image_id } = await readJson(req);
  if (!game_id || !character_id) {
    return jsonResponse({ error: 'game_id and character_id required' }, 400);
  }
  const ctx = await supabaseRpc(env, 'get_context', { p_game_id: game_id, p_recent_count: 1 });
  const safeImageId = selectImageId(flattenImageCatalog(ctx?.image_catalog || []), character_id, image_id, ctx?.save?.last_image_id, false);
  const result = await supabaseRpc(env, 'get_character_image', {
    p_game_id: game_id,
    p_character_id: character_id,
    p_image_id: safeImageId
  });
  return jsonResponse({ image_url: result });
}`,
  `async function handleImage(req, env) {
  const { game_id, character_id, image_id } = await readJson(req);
  if (!game_id || !character_id) {
    return jsonResponse({ error: 'game_id and character_id required' }, 400);
  }
  const ctx = await supabaseRpc(env, 'get_context', { p_game_id: game_id, p_recent_count: 1 });
  const catalog = flattenImageCatalog(ctx?.image_catalog || []);
  const persistedImageId = ctx?.save?.last_character_id === character_id ? ctx?.save?.last_image_id : null;
  const preferredImageId = persistedImageId ?? image_id;
  const preferred = catalog.find(img => img?.character_id === character_id && Number(img.image_id ?? img.id) === Number(preferredImageId));
  const preferredSexual = preferred ? resolveIsSexual(preferred) : false;
  const safeImageId = selectImageId(catalog, character_id, preferredImageId, persistedImageId, preferredSexual);
  const result = await supabaseRpc(env, 'get_character_image', {
    p_game_id: game_id,
    p_character_id: character_id,
    p_image_id: safeImageId
  });
  return jsonResponse({ image_url: result, image_id: safeImageId });
}`,
  'persisted image delivery'
);

worker = replaceOnce(
  worker,
  `  const safeExtract = normalizeRegisteredNpcExtract({ ...extract, is_sexual: extract.is_sexual === true }, ctx?.master?.characters, ctx?.save?.last_character_id);
  safeExtract.image_id = selectImageId(flattenImageCatalog(ctx?.image_catalog || []), safeExtract.character_id, safeExtract.image_id, ctx?.save?.last_image_id, safeExtract.is_sexual);
  const summaryPlan = buildRecent100Plan(ctx?.save || {}, turn_number, safeExtract.turn_summary);
  if (summaryPlan.isBoundary) summaryPlan.overallSummary = await summarizeRecent100(env, ctx?.save?.story_summary_overall, summaryPlan.completedWindow);
  const patch = buildSavePatch(safeExtract, engine_patch, summaryPlan, ctx?.save || {}, turn_number, player_input);`,
  `  const safeExtract = normalizeRegisteredNpcExtract({ ...extract, is_sexual: extract.is_sexual === true }, ctx?.master?.characters, ctx?.save?.last_character_id);
  const imageCatalog = flattenImageCatalog(ctx?.image_catalog || []);
  const summaryPlan = buildRecent100Plan(ctx?.save || {}, turn_number, safeExtract.turn_summary);
  if (summaryPlan.isBoundary) summaryPlan.overallSummary = await summarizeRecent100(env, ctx?.save?.story_summary_overall, summaryPlan.completedWindow);
  const patch = buildSavePatch(safeExtract, engine_patch, summaryPlan, ctx?.save || {}, turn_number, player_input);
  const imageSceneRole = resolveSpecialSceneRole(
    ctx?.save || {},
    safeExtract,
    patch.npc_stats?.[safeExtract.character_id],
    patch.npc_stat_changes?.[safeExtract.character_id]
  );
  const specialImageId = imageSceneRole
    ? selectSceneRoleImageId(imageCatalog, safeExtract.character_id, imageSceneRole)
    : null;
  safeExtract.image_id = specialImageId ?? selectImageId(imageCatalog, safeExtract.character_id, safeExtract.image_id, ctx?.save?.last_image_id, safeExtract.is_sexual);
  patch.last_image_id = safeExtract.image_id ?? null;`,
  'commit special image resolution'
);

worker = replaceOnce(
  worker,
  `    replay: result?.status === 'replay',
    npc_stats: patch.npc_stats?.[safeExtract.character_id] || null,
    npc_stat_changes: patch.npc_stat_changes?.[safeExtract.character_id] || null`,
  `    replay: result?.status === 'replay',
    image_id: safeExtract.image_id ?? null,
    image_scene_role: imageSceneRole,
    npc_stats: patch.npc_stats?.[safeExtract.character_id] || null,
    npc_stat_changes: patch.npc_stat_changes?.[safeExtract.character_id] || null`,
  'commit response selected image'
);

worker = replaceOnce(
  worker,
  `    image_pool: normalizeImagePool(img.image_pool),
    is_sexual: resolveIsSexual(img),
    curation_rank: parseCurationRank(img.curation_rank)`,
  `    image_pool: normalizeImagePool(img.image_pool),
    is_sexual: resolveIsSexual(img),
    curation_rank: parseCurationRank(img.curation_rank),
    scene_role: normalizeSceneRole(img.scene_role)`,
  'extract image scene role metadata'
);

worker = replaceOnce(
  worker,
  `2. image_library에서 character_id+is_sexual(또는 image_pool) 일치 항목만 후보로 본다. short_description과 tags가 있으면 situation보다 먼저 참고해 현재 장면에 가장 맞는 이미지를 고르고, 없으면 기존처럼 situation으로만 매칭한다. 후보 없으면 null.`,
  `2. image_library에서 character_id+is_sexual(또는 image_pool) 일치 항목만 후보로 본다. short_description과 tags가 있으면 situation보다 먼저 참고해 현재 장면에 가장 맞는 이미지를 고르고, 없으면 기존처럼 situation으로만 매칭한다. 후보 없으면 null.
3. scene_role=hypnosis_onset 이미지는 실제 최면 반응·암시 성공이 발생한 장면 전용이다. scene_role=heart_eyes 이미지는 높은 호감이나 깊은 최면·순응 상태의 애정·황홀 반응 전용이다. 단순 계획이나 평범한 대화에는 고르지 마라.`,
  'extract special image instructions'
);

worker = replaceOnce(
  worker,
  `function normalizeImagePool(value) {
  return value === 'sex' || value === 'general' ? value : null;
}

function normalizeTags(value) {`,
  `function normalizeImagePool(value) {
  return value === 'sex' || value === 'general' ? value : null;
}

function normalizeSceneRole(value) {
  return value === 'hypnosis_onset' || value === 'heart_eyes' ? value : null;
}

function normalizeTags(value) {`,
  'scene role normalizer'
);

worker = replaceOnce(
  worker,
  `      image_pool: normalizeImagePool(img.image_pool),
      is_sexual: resolveIsSexual(img),
      curation_rank: parseCurationRank(img.curation_rank),
      image_url: img.image_url ?? null`,
  `      image_pool: normalizeImagePool(img.image_pool),
      is_sexual: resolveIsSexual(img),
      curation_rank: parseCurationRank(img.curation_rank),
      scene_role: normalizeSceneRole(img.scene_role),
      image_url: img.image_url ?? null`,
  'normalized scene role metadata'
);

worker = replaceOnce(
  worker,
  `function selectImageId(catalog, characterId, requestedId, previousId, isSexual) {`,
  `const HEART_EYES_AFFINITY_THRESHOLD = 70;
const HEART_EYES_HYPNOSIS_THRESHOLD = 70;

function statNumber(stats, key) {
  const value = Number(stats?.[key]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function resolveSpecialSceneRole(previousSave, extract, projectedStats = {}, appliedChanges = {}) {
  const characterId = typeof extract?.character_id === 'string' ? extract.character_id : null;
  if (!characterId || characterId === 'narrator' || extract?.is_sexual === true) return null;

  const action = extract?.suggestion_action;
  const suggestionActivated = action?.action === 'activate'
    && (!action.character_id || action.character_id === characterId);
  const hypnosisDelta = Number(appliedChanges?.['최면깊이']?.delta);
  if (suggestionActivated || (Number.isFinite(hypnosisDelta) && hypnosisDelta > 0)) return 'hypnosis_onset';

  const previousStats = previousSave?.npc_stats?.[characterId] || {};
  const beforeAffinity = statNumber(previousStats, '호감도');
  const afterAffinity = statNumber(projectedStats, '호감도');
  const beforeDeep = statNumber(previousStats, '최면깊이') >= HEART_EYES_HYPNOSIS_THRESHOLD
    && statNumber(previousStats, '순응도') >= HEART_EYES_HYPNOSIS_THRESHOLD;
  const afterDeep = statNumber(projectedStats, '최면깊이') >= HEART_EYES_HYPNOSIS_THRESHOLD
    && statNumber(projectedStats, '순응도') >= HEART_EYES_HYPNOSIS_THRESHOLD;

  if ((beforeAffinity < HEART_EYES_AFFINITY_THRESHOLD && afterAffinity >= HEART_EYES_AFFINITY_THRESHOLD)
    || (!beforeDeep && afterDeep)) return 'heart_eyes';
  return null;
}

function selectSceneRoleImageId(catalog, characterId, sceneRole) {
  const normalizedRole = normalizeSceneRole(sceneRole);
  if (!characterId || characterId === 'narrator' || !normalizedRole) return null;
  const candidates = flattenImageCatalog(catalog)
    .filter(img => img?.character_id === characterId
      && normalizeSceneRole(img.scene_role) === normalizedRole
      && resolveIsSexual(img) !== true)
    .sort((a, b) => curationSortRank(a) - curationSortRank(b));
  const selected = candidates[0];
  return selected ? Number(selected.image_id ?? selected.id) : null;
}

function selectImageId(catalog, characterId, requestedId, previousId, isSexual) {`,
  'special image helpers'
);

worker = replaceOnce(
  worker,
  `  parseCurationRank
};`,
  `  parseCurationRank,
  normalizeSceneRole,
  resolveSpecialSceneRole,
  selectSceneRoleImageId
};`,
  'special image exports'
);

page = replaceOnce(
  page,
  `        if (saved.npc_stats) pending.extract.npc_stats = saved.npc_stats;
        if (saved.npc_stat_changes) pending.extract.npc_stat_changes = saved.npc_stat_changes;
        saveFeedback([]);`,
  `        if (saved.npc_stats) pending.extract.npc_stats = saved.npc_stats;
        if (saved.npc_stat_changes) pending.extract.npc_stat_changes = saved.npc_stat_changes;
        if (Number.isInteger(saved.image_id)) pending.extract.image_id = saved.image_id;
        if (typeof saved.image_scene_role === 'string') pending.extract.image_scene_role = saved.image_scene_role;
        saveFeedback([]);`,
  'frontend selected image handoff'
);

tests = replaceOnce(
  tests,
  `  normalizeTags,
  parseCurationRank
} from '../worker/game-proxy-v2.js';`,
  `  normalizeTags,
  parseCurationRank,
  normalizeSceneRole,
  resolveSpecialSceneRole,
  selectSceneRoleImageId
} from '../worker/game-proxy-v2.js';`,
  'test imports'
);

tests = replaceOnce(
  tests,
  `    image_pool: 'general', is_sexual: false, curation_rank: 1, image_url: null`,
  `    image_pool: 'general', is_sexual: false, curation_rank: 1, scene_role: null, image_url: null`,
  'normalized object expectation'
);

tests = replaceOnce(
  tests,
  `      image_pool: 'general', is_sexual: false, curation_rank: 1,
      image_url: 'https://example.com/should-not-leak/sujin_slender_malepov.png'`,
  `      image_pool: 'general', is_sexual: false, curation_rank: 1,
      scene_role: 'hypnosis_onset',
      image_url: 'https://example.com/should-not-leak/sujin_slender_malepov.png'`,
  'prompt test scene role input'
);

tests = replaceOnce(
  tests,
  `  assert.match(prompt, /"curation_rank":1/);
  assert.doesNotMatch(prompt, /image_url/);`,
  `  assert.match(prompt, /"curation_rank":1/);
  assert.match(prompt, /"scene_role":"hypnosis_onset"/);
  assert.doesNotMatch(prompt, /image_url/);`,
  'prompt test scene role assertion'
);

const specialTests = `

// ─────────────────────────────────────────────
// Special image scene roles
// ─────────────────────────────────────────────

test('scene_role accepts only hypnosis_onset and heart_eyes', () => {
  assert.equal(normalizeSceneRole('hypnosis_onset'), 'hypnosis_onset');
  assert.equal(normalizeSceneRole('heart_eyes'), 'heart_eyes');
  assert.equal(normalizeSceneRole('other'), null);
  assert.equal(normalizeSceneRole(undefined), null);
});

test('normalizeImageCatalog preserves a valid scene_role and drops an invalid one', () => {
  const catalog = normalizeImageCatalog([
    { id: 1, character_id: 'heroine1', scene_role: 'hypnosis_onset' },
    { id: 2, character_id: 'heroine1', scene_role: 'unknown' }
  ]);
  assert.equal(catalog.heroine1[0].scene_role, 'hypnosis_onset');
  assert.equal(catalog.heroine1[1].scene_role, null);
});

test('actual suggestion activation or applied hypnosis-depth increase forces hypnosis_onset', () => {
  const suggestion = resolveSpecialSceneRole({}, {
    character_id: 'heroine1', is_sexual: false,
    suggestion_action: { action: 'activate', character_id: 'heroine1' }
  }, {}, {});
  assert.equal(suggestion, 'hypnosis_onset');

  const depth = resolveSpecialSceneRole({}, { character_id: 'heroine1', is_sexual: false }, {}, {
    최면깊이: { delta: 2 }
  });
  assert.equal(depth, 'hypnosis_onset');
});

test('sexual scenes never get replaced by a general special-role image', () => {
  const role = resolveSpecialSceneRole({}, {
    character_id: 'heroine1', is_sexual: true,
    suggestion_action: { action: 'activate', character_id: 'heroine1' }
  }, {}, { 최면깊이: { delta: 2 } });
  assert.equal(role, null);
});

test('heart_eyes is forced only when affinity or deep hypnosis crosses the threshold', () => {
  const affinity = resolveSpecialSceneRole(
    { npc_stats: { heroine1: { 호감도: 69, 최면깊이: 10, 순응도: 10 } } },
    { character_id: 'heroine1', is_sexual: false },
    { 호감도: 70, 최면깊이: 10, 순응도: 10 },
    {}
  );
  assert.equal(affinity, 'heart_eyes');

  const deep = resolveSpecialSceneRole(
    { npc_stats: { heroine1: { 호감도: 20, 최면깊이: 69, 순응도: 72 } } },
    { character_id: 'heroine1', is_sexual: false },
    { 호감도: 20, 최면깊이: 70, 순응도: 72 },
    {}
  );
  assert.equal(deep, 'heart_eyes');

  const alreadyHigh = resolveSpecialSceneRole(
    { npc_stats: { heroine1: { 호감도: 75, 최면깊이: 80, 순응도: 80 } } },
    { character_id: 'heroine1', is_sexual: false },
    { 호감도: 76, 최면깊이: 81, 순응도: 81 },
    {}
  );
  assert.equal(alreadyHigh, null);
});

test('selectSceneRoleImageId keeps character and general-pool boundaries and prefers curation rank', () => {
  const catalog = [
    { id: 1, character_id: 'heroine1', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 5 },
    { id: 2, character_id: 'heroine1', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 1 },
    { id: 3, character_id: 'heroine2', image_pool: 'general', scene_role: 'hypnosis_onset', curation_rank: 0 },
    { id: 4, character_id: 'heroine1', image_pool: 'sex', scene_role: 'hypnosis_onset', curation_rank: 0 }
  ];
  assert.equal(selectSceneRoleImageId(catalog, 'heroine1', 'hypnosis_onset'), 2);
  assert.equal(selectSceneRoleImageId(catalog, 'heroine1', 'heart_eyes'), null);
});
`;

tests += specialTests;

doc += `

## 특수 장면 역할(scene_role)

DB는 각 캐릭터의 일반 이미지 중 최대 한 장씩 다음 역할을 지정할 수 있다.

- \`hypnosis_onset\`: 실제 최면 반응이 시작되거나 암시가 성공한 턴에 1회 우선 표시
- \`heart_eyes\`: 호감도 70 최초 도달 또는 최면깊이·순응도 70 동시 최초 도달 시 1회 우선 표시

성행위 장면은 sex 풀 이미지가 항상 우선하며 일반 특수 이미지로 대체하지 않는다. Worker가 Commit 시 최종 이미지 ID를 결정해 \`last_image_id\`에 저장하고, 프론트와 \`/api/image\`는 그 저장값을 사용한다. 임계값을 이미 넘은 이후의 일반 턴에는 특수 이미지를 계속 강제하지 않고 Extract의 장면 매칭을 따른다.
`;

const migration = `-- Curated image metadata schema. Image row curation is a separate, game-specific data operation.
alter table public.image_library add column if not exists image_pool text;
alter table public.image_library add column if not exists tags text[];
alter table public.image_library add column if not exists short_description text;
alter table public.image_library add column if not exists is_curated boolean not null default false;
alter table public.image_library add column if not exists curation_rank integer;
alter table public.image_library add column if not exists scene_role text;

do $$ begin
  alter table public.image_library add constraint image_library_image_pool_check check (image_pool is null or image_pool in ('general','sex'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.image_library add constraint image_library_scene_role_check check (scene_role is null or scene_role in ('hypnosis_onset','heart_eyes'));
exception when duplicate_object then null; end $$;

create index if not exists image_library_curated_lookup_idx
  on public.image_library (game_id, character_id, is_curated, image_pool, curation_rank);

create or replace function public.get_context(p_game_id text, p_recent_count integer default 15)
returns jsonb
language plpgsql
as $function$
declare v_gid uuid := _resolve_game(p_game_id);
begin
  return jsonb_build_object(
    'game_id', v_gid,
    'has_game', (v_gid is not null and exists (select 1 from games where id = v_gid)),
    'title', (select title from games where id = v_gid),
    'master', (select data from game_master where game_id = v_gid),
    'save', (select data from game_save where game_id = v_gid),
    'turn_count', (select turn_count from game_save where game_id = v_gid),
    'story_summary_overall', (select coalesce(data->>'story_summary_overall', '') from game_save where game_id = v_gid),
    'story_summary_recent100', (select coalesce(data->>'story_summary_recent100', '') from game_save where game_id = v_gid),
    'recent100_start_turn', (select coalesce((data->>'recent100_start_turn')::int, 0) from game_save where game_id = v_gid),
    'recent_memories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'turn_number', m.turn_number,
        'content', case when m.rn <= 5 then m.content
          else regexp_replace(regexp_replace(regexp_replace(m.content,
            '#{0,3}\\s*🧠\\s*\\*{0,2}마인드 모니터.*?\\n---\\n', '', 'g'),
            '#{0,3}\\s*📋\\s*\\*{0,2}플레이어 상황판.*?\\n---\\n', '', 'g'),
            '①.*$', '', 'g') end,
        'created_at', m.created_at
      ) order by m.created_at asc), '[]'::jsonb)
      from (
        select turn_number, content, created_at,
          row_number() over (order by created_at desc) as rn
        from game_memories where game_id = v_gid
        order by created_at desc limit p_recent_count
      ) m
    ),
    'image_catalog', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'image_id', il.id,
        'character_id', il.character_id,
        'situation', il.situation,
        'short_description', il.short_description,
        'tags', coalesce(il.tags, '{}'::text[]),
        'image_pool', il.image_pool,
        'is_sexual', il.is_sexual,
        'is_curated', il.is_curated,
        'curation_rank', il.curation_rank,
        'scene_role', il.scene_role
      ) order by il.character_id, il.curation_rank nulls last, il.id), '[]'::jsonb)
      from image_library il
      where il.game_id = v_gid
        and (
          il.is_curated = true
          or not exists (select 1 from image_library probe where probe.game_id = v_gid and probe.is_curated = true)
        )
    )
  );
end;
$function$;
`;

fs.mkdirSync('supabase/migrations', { recursive: true });
fs.writeFileSync('supabase/migrations/20260723123000_curated_image_catalog.sql', migration);
fs.writeFileSync(workerPath, worker);
fs.writeFileSync(testPath, tests);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(docPath, doc);
console.log('Stage 2 special image role patch applied.');
