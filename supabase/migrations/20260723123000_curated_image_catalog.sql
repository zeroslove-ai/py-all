-- Curated image metadata schema. Image row curation is a separate, game-specific data operation.
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
            '#{0,3}\s*🧠\s*\*{0,2}마인드 모니터.*?\n---\n', '', 'g'),
            '#{0,3}\s*📋\s*\*{0,2}플레이어 상황판.*?\n---\n', '', 'g'),
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
