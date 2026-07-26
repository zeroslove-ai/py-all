-- 피드백 재생성: 각 턴 커밋 직전 save 스냅샷 저장 + 마지막 턴 롤백/복구 RPC.
-- 재실행에 안전하다(add column if not exists / create or replace).

alter table public.game_memories
  add column if not exists pre_turn_save_snapshot jsonb;

-- commit_turn 시그니처는 그대로 유지한다. p_patch 안의 예약 키
-- _pre_turn_snapshot만 추가로 분리해 game_memories.pre_turn_save_snapshot에
-- 저장하고, game_save.data 병합에는 이 키가 제거된 patch만 사용한다
-- (_turn_record와 동일한 방식).
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
  v_pre_turn_snapshot jsonb;
begin
  if v_gid is null then
    raise exception '게임을 찾을 수 없어 턴을 저장할 수 없습니다.';
  end if;

  v_turn_record := coalesce(p_patch->'_turn_record', '{}'::jsonb);
  v_pre_turn_snapshot := p_patch->'_pre_turn_snapshot';
  v_save_patch := coalesce(p_patch, '{}'::jsonb) - '_turn_record' - '_pre_turn_snapshot';

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
    next_choices,
    pre_turn_save_snapshot
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
    end,
    v_pre_turn_snapshot
  );

  -- game_save.data에는 예약 키가 제거된 patch만 병합된다.
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

-- /api/feedback 1단계: 가장 최근 턴을 원자적으로 되돌린다 — game_save.data를
-- 그 턴의 pre_turn_save_snapshot으로 복원하고, 해당 game_memories 행을
-- 삭제한다. 하나의 plpgsql 함수 호출은 단일 트랜잭션이므로 복원과 삭제는
-- 항상 함께 성공하거나 함께 실패한다. 실패(재생성 실패) 시 복구에 필요한
-- previous_save_data/deleted_turn_row를 함께 반환한다.
create or replace function public.rollback_latest_turn_for_feedback(p_game_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
  v_turn_row public.game_memories%rowtype;
  v_previous_save_data jsonb;
begin
  if v_gid is null then
    raise exception '게임을 찾을 수 없습니다.';
  end if;

  select gs.data
    into v_previous_save_data
  from public.game_save as gs
  where gs.game_id = v_gid
  for update;

  if not found then
    raise exception '게임 세이브를 찾을 수 없습니다.';
  end if;

  select *
    into v_turn_row
  from public.game_memories
  where game_id = v_gid
  order by turn_number desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_turns');
  end if;

  if v_turn_row.pre_turn_save_snapshot is null then
    return jsonb_build_object('success', false, 'reason', 'no_snapshot', 'turn_number', v_turn_row.turn_number);
  end if;

  delete from public.game_memories where id = v_turn_row.id;

  update public.game_save
  set data = v_turn_row.pre_turn_save_snapshot,
      turn_count = v_turn_row.turn_number - 1,
      updated_at = now()
  where game_id = v_gid;

  return jsonb_build_object(
    'success', true,
    'rolled_back_turn_number', v_turn_row.turn_number,
    'resolved_input', coalesce(v_turn_row.player_action->>'resolved_input', ''),
    'source', coalesce(v_turn_row.player_action->>'source', ''),
    'choice_index', (v_turn_row.player_action->>'choice_index')::integer,
    'previous_save_data', v_previous_save_data,
    'deleted_turn_row', jsonb_build_object(
      'content', v_turn_row.content,
      'player_action', v_turn_row.player_action,
      'mind_monitor', v_turn_row.mind_monitor,
      'turn_summary', v_turn_row.turn_summary,
      'character_id', v_turn_row.character_id,
      'narrative_text', v_turn_row.narrative_text,
      'player_status_text', v_turn_row.player_status_text,
      'next_choices', v_turn_row.next_choices,
      'pre_turn_save_snapshot', v_turn_row.pre_turn_save_snapshot
    )
  );
end;
$function$;

-- /api/feedback 실패 시 복구: rollback이 반환한 previous_save_data/
-- deleted_turn_row를 그대로 되돌려 롤백 이전 상태로 복원한다.
create or replace function public.restore_turn_after_feedback_failure(
  p_game_id text,
  p_turn_number integer,
  p_save_data jsonb,
  p_turn_row jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_gid uuid := public._resolve_game(p_game_id);
begin
  if v_gid is null then
    raise exception '게임을 찾을 수 없습니다.';
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
    next_choices,
    pre_turn_save_snapshot
  )
  values (
    v_gid,
    p_turn_number,
    coalesce(p_turn_row->>'content', ''),
    nullif(p_turn_row->'player_action', 'null'::jsonb),
    nullif(p_turn_row->'mind_monitor', 'null'::jsonb),
    coalesce(p_turn_row->>'turn_summary', ''),
    nullif(p_turn_row->>'character_id', ''),
    coalesce(p_turn_row->>'narrative_text', ''),
    coalesce(p_turn_row->>'player_status_text', ''),
    case
      when jsonb_typeof(p_turn_row->'next_choices') = 'array' then p_turn_row->'next_choices'
      else '[]'::jsonb
    end,
    p_turn_row->'pre_turn_save_snapshot'
  );

  update public.game_save
  set data = p_save_data,
      turn_count = p_turn_number,
      updated_at = now()
  where game_id = v_gid;

  return jsonb_build_object('restored', true, 'turn_number', p_turn_number);
end;
$function$;
