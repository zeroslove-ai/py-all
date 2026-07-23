-- REPRODUCTION ONLY — already applied to the operational Supabase project
-- (ovltkzwddxsekcfeskds) as migrations `add_lightweight_runtime_context_rpcs`
-- and `separate_last_choices_from_active_suggestions`. Claude Code did not
-- run this file against the operational DB; it was pulled read-only via
-- pg_get_functiondef() to document what is already live, per the turn-speed
-- instruction sheet's DB section. Do not apply without first diffing against
-- the current live definitions — the DB owner may have iterated further.

-- Purpose: replace the single ~228 KB get_context RPC with narrow,
-- endpoint-shaped RPCs so /api/story, /api/extract, /api/commit-turn and
-- /api/context each fetch only what they need. get_context itself is left
-- in place for backward compatibility; nothing in the Worker calls it anymore.

create or replace function public._runtime_recent_memories(p_game_id uuid, p_recent_count integer default 5)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'turn_number', q.turn_number,
        'content', q.content,
        'created_at', q.created_at
      ) order by q.turn_number asc
    ),
    '[]'::jsonb
  )
  from (
    select gm.turn_number, gm.content, gm.created_at
    from public.game_memories gm
    where gm.game_id = p_game_id
    order by gm.turn_number desc
    limit greatest(0, least(coalesce(p_recent_count, 5), 20))
  ) q;
$function$;

-- /api/context — trims master to {title, characters} only (no rulebooks).
create or replace function public.get_ui_context(p_game_id text, p_recent_count integer default 15)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_master jsonb;
  v_save jsonb;
  v_turn integer;
begin
  select gm.data, gs.data, gs.turn_count
    into v_master, v_save, v_turn
  from public.game_save gs
  left join public.game_master gm on gm.game_id = gs.game_id
  where gs.game_id = v_gid;

  return jsonb_build_object(
    'game_id', v_gid,
    'has_game', v_gid is not null and v_save is not null,
    'title', (select g.title from public.games g where g.id = v_gid),
    'master', jsonb_build_object(
      'title', coalesce(v_master->'title', to_jsonb((select g.title from public.games g where g.id = v_gid))),
      'characters', coalesce(v_master->'characters', '{}'::jsonb)
    ),
    'save', coalesce(v_save, '{}'::jsonb),
    'turn_count', coalesce(v_turn, 0),
    'recent_memories', public._runtime_recent_memories(v_gid, p_recent_count)
  );
end;
$function$;

-- /api/story — full master (rulebooks included, Story needs them) + last N memories.
create or replace function public.get_story_context(p_game_id text, p_recent_count integer default 5)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_master jsonb;
  v_save jsonb;
  v_turn integer;
begin
  select gm.data, gs.data, gs.turn_count
    into v_master, v_save, v_turn
  from public.game_save gs
  left join public.game_master gm on gm.game_id = gs.game_id
  where gs.game_id = v_gid;

  return jsonb_build_object(
    'game_id', v_gid,
    'has_game', v_gid is not null and v_save is not null,
    'title', (select g.title from public.games g where g.id = v_gid),
    'master', coalesce(v_master, '{}'::jsonb),
    'save', coalesce(v_save, '{}'::jsonb),
    'turn_count', coalesce(v_turn, 0),
    'story_summary_overall', coalesce(v_save->>'story_summary_overall', ''),
    'story_summary_recent100', coalesce(v_save->>'story_summary_recent100', ''),
    'recent100_start_turn', coalesce((v_save->>'recent100_start_turn')::integer, 0),
    'recent_memories', public._runtime_recent_memories(v_gid, p_recent_count)
  );
end;
$function$;

-- /api/extract — full master + save, no recent_memories, no image_catalog
-- (images come from get_image_catalog_for_characters for detected NPCs only).
create or replace function public.get_extract_context(p_game_id text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_master jsonb;
  v_save jsonb;
  v_turn integer;
begin
  select gm.data, gs.data, gs.turn_count
    into v_master, v_save, v_turn
  from public.game_save gs
  left join public.game_master gm on gm.game_id = gs.game_id
  where gs.game_id = v_gid;

  return jsonb_build_object(
    'game_id', v_gid,
    'has_game', v_gid is not null and v_save is not null,
    'master', coalesce(v_master, '{}'::jsonb),
    'save', coalesce(v_save, '{}'::jsonb),
    'turn_count', coalesce(v_turn, 0)
  );
end;
$function$;

-- /api/commit-turn — smallest of all: only master.characters (for registered-NPC
-- validation) + save, no rulebooks.
create or replace function public.get_commit_context(p_game_id text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_characters jsonb;
  v_save jsonb;
  v_turn integer;
begin
  select gm.data->'characters', gs.data, gs.turn_count
    into v_characters, v_save, v_turn
  from public.game_save gs
  left join public.game_master gm on gm.game_id = gs.game_id
  where gs.game_id = v_gid;

  return jsonb_build_object(
    'game_id', v_gid,
    'has_game', v_gid is not null and v_save is not null,
    'master', jsonb_build_object('characters', coalesce(v_characters, '{}'::jsonb)),
    'save', coalesce(v_save, '{}'::jsonb),
    'turn_count', coalesce(v_turn, 0)
  );
end;
$function$;

-- Returns curated image_library rows for only the requested character_ids
-- (Extract/commit-turn detect candidate NPCs and pass at most a few IDs here).
create or replace function public.get_image_catalog_for_characters(p_game_id text, p_character_ids text[])
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
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
      ) order by il.character_id, il.curation_rank nulls last, il.id
    ),
    '[]'::jsonb
  )
  from public.image_library il
  where il.game_id = public._resolve_game(p_game_id)
    and coalesce(cardinality(p_character_ids), 0) > 0
    and il.character_id = any(p_character_ids)
    and (
      il.is_curated = true
      or not exists (
        select 1
        from public.image_library probe
        where probe.game_id = il.game_id
          and probe.character_id = il.character_id
          and probe.is_curated = true
      )
    );
$function$;

-- Now validates image/character match and applies the curated-general
-- fallback (excluding scene_role images) entirely server-side, so
-- /api/image no longer needs get_context or a full catalog fetch.
create or replace function public.get_character_image(p_game_id text, p_character_id text, p_image_id text default null::text)
returns text
language sql
stable
set search_path to 'public'
as $function$
  with resolved as (
    select public._resolve_game(p_game_id) as game_id,
      case when coalesce(p_image_id, '') ~ '^\d+$' then p_image_id::integer else null end as requested_id
  ), candidates as (
    select il.image_url as url, 0 as priority, il.curation_rank, il.id
    from public.image_library il, resolved r
    where r.requested_id is not null
      and il.game_id = r.game_id
      and il.character_id = p_character_id
      and il.id = r.requested_id

    union all

    select il.image_url as url, 1 as priority, il.curation_rank, il.id
    from public.image_library il, resolved r
    where il.game_id = r.game_id
      and il.character_id = p_character_id
      and coalesce(il.image_pool, case when il.is_sexual then 'sex' else 'general' end) = 'general'
      and il.scene_role is null
      and (
        il.is_curated = true
        or not exists (
          select 1 from public.image_library probe
          where probe.game_id = il.game_id
            and probe.character_id = il.character_id
            and probe.is_curated = true
        )
      )

    union all

    select il.image_url as url, 2 as priority, il.curation_rank, il.id
    from public.image_library il, resolved r
    where il.game_id = r.game_id
      and il.character_id = 'default'
  )
  select c.url
  from candidates c
  order by c.priority, c.curation_rank nulls last, c.id
  limit 1;
$function$;

-- reset_game_progress now also seeds last_choices/world_state/npc_encounters
-- and stores active_suggestions as {} (object map) instead of the legacy
-- choice-string array, matching the structured active_suggestions contract.
create or replace function public.reset_game_progress(p_game_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_chars jsonb;
  v_master_stats jsonb;
  v_default_stats jsonb := '{}'::jsonb;
  v_default_emotion jsonb := '{}'::jsonb;
  v_cid text;
  v_char jsonb;
  v_baseline jsonb;
begin
  delete from public.game_memories where game_id = p_game_id;

  select data->'characters', data->'npc_stats'
    into v_chars, v_master_stats
  from public.game_master
  where game_id = p_game_id;

  if v_chars is not null and jsonb_typeof(v_chars) = 'object' then
    for v_cid, v_char in select * from jsonb_each(v_chars) loop
      v_baseline := coalesce(v_master_stats->v_cid, '{}'::jsonb);
      v_default_stats := v_default_stats || jsonb_build_object(v_cid, jsonb_build_object(
        '순응도', coalesce(v_baseline->'순응도', v_char->'순응도초기', '0'::jsonb),
        '신뢰도', coalesce(v_baseline->'신뢰도', v_char->'신뢰도초기', '0'::jsonb),
        '호감도', coalesce(v_baseline->'호감도', v_char->'호감도초기', '0'::jsonb),
        '최면깊이', '0'::jsonb,
        '최면저항력', coalesce(v_baseline->'최면저항력', v_char->'최면저항력초기', '50'::jsonb)
      ));
      v_default_emotion := v_default_emotion || jsonb_build_object(
        v_cid,
        jsonb_build_object('inner', '', 'surface', '', 'physical_reaction', '')
      );
    end loop;
  end if;

  update public.game_save
  set data = jsonb_build_object(
        'npc_stats', v_default_stats,
        'npc_stat_changes', '{}'::jsonb,
        'npc_emotion', v_default_emotion,
        'npc_encounters', '{}'::jsonb,
        'npc_relationship_state', '{}'::jsonb,
        'player', jsonb_build_object(
          'name', '', 'age', 0, 'gender', '', 'height_cm', 0, 'weight_kg', 0,
          'penis_length_cm', 0, 'job', '', 'background', '', 'location', '', 'style', ''
        ),
        'player_progress', jsonb_build_object(
          'level', 1, 'exp', 0, 'leveled_up', false,
          'next_level_exp', 10, 'special_skills', '{}'::jsonb
        ),
        'active_suggestions', '{}'::jsonb,
        'last_choices', '[]'::jsonb,
        'last_character_id', null,
        'last_image_id', null,
        'story_summary_overall', '',
        'story_summary_recent100', '',
        'recent100_start_turn', 0,
        'csa_active', '[]'::jsonb,
        'csa_daily_used', 0,
        'world_state', '{}'::jsonb,
        'player_location', '',
        'opening_started', false
      ),
      turn_count = 0,
      updated_at = now()
  where game_id = p_game_id;

  return jsonb_build_object('ok', true, 'game_id', p_game_id);
end;
$function$;
