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
begin
  if v_gid is null then
    raise exception '게임을 찾을 수 없어 턴을 저장할 수 없습니다.';
  end if;

  select gs.turn_count, gs.data
    into v_current_turn, v_current_data
  from public.game_save as gs
  where gs.game_id = v_gid
  for update;

  if not found then
    raise exception '게임 세이브를 찾을 수 없습니다.';
  end if;

  -- 네트워크 응답만 유실된 동일 요청은 성공으로 재응답한다.
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

  insert into public.game_memories (game_id, turn_number, content)
  values (v_gid, p_turn_number, p_content);

  v_merged := public.jsonb_deep_merge(
    v_current_data,
    coalesce(p_patch, '{}'::jsonb)
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
