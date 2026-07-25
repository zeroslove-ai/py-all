-- 턴 기록 구조화: game_memories 확장 + commit_turn _turn_record 분리 + get_play_history
-- 재실행에 안전하다(add column if not exists / create or replace).

alter table public.game_memories
  add column if not exists player_action jsonb,
  add column if not exists mind_monitor jsonb,
  add column if not exists turn_summary text not null default '',
  add column if not exists character_id text,
  add column if not exists narrative_text text not null default '',
  add column if not exists player_status_text text not null default '',
  add column if not exists next_choices jsonb not null default '[]'::jsonb;

-- commit_turn 시그니처는 그대로 유지한다. 새 인자/overload 없이 p_patch 안의
-- 예약 키 _turn_record만 분리해 game_memories에 저장하고, game_save.data
-- 병합에는 _turn_record가 제거된 patch만 사용한다.
create or replace function public.commit_turn(
  p_game_id text,
  p_turn_number integer,
  p_content text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_current_turn integer;
  v_current_data jsonb;
  v_existing_content text;
  v_merged jsonb;
  v_turn_record jsonb;
  v_save_patch jsonb;
begin
  if v_gid is null then
    raise exception '게임을 찾을 수 없어 턴을 저장할 수 없습니다.';
  end if;

  v_turn_record := coalesce(p_patch->'_turn_record', '{}'::jsonb);
  v_save_patch := coalesce(p_patch, '{}'::jsonb) - '_turn_record';

  select gs.turn_count, gs.data
    into v_current_turn, v_current_data
  from public.game_save as gs
  where gs.game_id = v_gid
  for update;

  if not found then
    raise exception '게임 세이브를 찾을 수 없습니다.';
  end if;

  -- 네트워크 응답만 유실된 동일 요청은 성공으로 재응답한다.
  -- replay는 기존 행을 그대로 두고(첫 Commit의 기록을 최종 기록으로 취급)
  -- 중복 삽입/덮어쓰기를 하지 않는다.
  if p_turn_number = v_current_turn then
    select gm.content
      into v_existing_content
    from public.game_memories as gm
    where gm.game_id = v_gid
      and gm.turn_number = p_turn_number;

    if v_existing_content = p_content then
      return jsonb_build_object(
        'status', 'replay',
        'turn_count', v_current_turn
      );
    end if;

    return jsonb_build_object(
      'status', 'conflict',
      'reason', 'same_turn_different_content',
      'expected_turn', v_current_turn + 1
    );
  end if;

  if p_turn_number <> v_current_turn + 1 then
    return jsonb_build_object(
      'status', 'conflict',
      'reason', 'out_of_sequence',
      'expected_turn', v_current_turn + 1
    );
  end if;

  insert into public.game_memories (
    game_id,
    turn_number,
    content,
    player_action,
    mind_monitor,
    turn_summary,
    character_id,
    narrative_text,
    player_status_text,
    next_choices
  )
  values (
    v_gid,
    p_turn_number,
    p_content,
    nullif(v_turn_record->'player_action', 'null'::jsonb),
    nullif(v_turn_record->'mind_monitor', 'null'::jsonb),
    coalesce(v_turn_record->>'turn_summary', ''),
    nullif(v_turn_record->>'character_id', ''),
    coalesce(v_turn_record->>'narrative_text', ''),
    coalesce(v_turn_record->>'player_status_text', ''),
    case
      when jsonb_typeof(v_turn_record->'next_choices') = 'array'
        then v_turn_record->'next_choices'
      else '[]'::jsonb
    end
  );

  -- game_save.data에는 _turn_record가 제거된 patch만 병합된다.
  v_merged := public.jsonb_deep_merge(
    v_current_data,
    v_save_patch
  );

  update public.game_save
  set data = v_merged,
      turn_count = p_turn_number,
      updated_at = now()
  where game_id = v_gid;

  return jsonb_build_object(
    'status', 'committed',
    'turn_count', p_turn_number
  );
end;
$function$;

-- 플레이 기록 조회: 최신 턴부터 limit개, 응답 records는 화면 표시를 위해
-- turn_number 오름차순. 구조화 이전 기록은 추측해 채우지 않고 content로만
-- fallback한다.
create or replace function public.get_play_history(
  p_game_id text,
  p_limit integer default 20,
  p_before_turn integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_limit integer := greatest(1, least(100, coalesce(p_limit, 20)));
  v_rows jsonb;
  v_fetched integer;
  v_has_more boolean;
  v_next_before integer;
begin
  if v_gid is null then
    raise exception '게임을 찾을 수 없습니다.';
  end if;

  -- limit+1개를 최신순으로 가져와 has_more을 판정한다.
  select coalesce(jsonb_agg(t.row_data order by t.turn_number asc), '[]'::jsonb),
         count(*)
    into v_rows, v_fetched
  from (
    select
      gm.turn_number,
      jsonb_build_object(
        'turn_number', gm.turn_number,
        'content', gm.content,
        'player_action', gm.player_action,
        'mind_monitor', gm.mind_monitor,
        'turn_summary', coalesce(gm.turn_summary, ''),
        'character_id', gm.character_id,
        'narrative_text', case
          when coalesce(gm.narrative_text, '') = '' then gm.content
          else gm.narrative_text
        end,
        'player_status_text', coalesce(gm.player_status_text, ''),
        'next_choices', case
          when jsonb_typeof(gm.next_choices) = 'array' then gm.next_choices
          else '[]'::jsonb
        end,
        'created_at', gm.created_at
      ) as row_data
    from public.game_memories as gm
    where gm.game_id = v_gid
      and (p_before_turn is null or gm.turn_number < p_before_turn)
    order by gm.turn_number desc
    limit v_limit + 1
  ) as t;

  v_has_more := v_fetched > v_limit;

  -- 추가로 가져온 1개(가장 오래된 턴)를 떼어 낸다.
  if v_has_more then
    select coalesce(jsonb_agg(value order by (value->>'turn_number')::integer asc), '[]'::jsonb)
      into v_rows
    from (
      select value
      from jsonb_array_elements(v_rows)
      order by (value->>'turn_number')::integer desc
      offset 1
    ) as trimmed;
  end if;

  select min((value->>'turn_number')::integer)
    into v_next_before
  from jsonb_array_elements(v_rows);

  return jsonb_build_object(
    'records', v_rows,
    'has_more', v_has_more,
    'next_before_turn', case when v_has_more then v_next_before else null end
  );
end;
$function$;
