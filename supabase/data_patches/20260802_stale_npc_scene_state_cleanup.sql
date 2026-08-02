-- One-time operational cleanup for stale transient NPC physical state.
-- Durable relationship, address, memory, stats, CSA history, and turn records are untouched.
-- Safe to re-run: it writes the same normalized scene-state result for the target save.

UPDATE public.game_save
SET data = jsonb_set(
  data,
  '{npc_scene_state}',
  (
    COALESCE(data->'npc_scene_state', '{}'::jsonb)
      - 'heroine2'
      - 'heroine3'
      - 'heroine4'
      - 'heroine9'
  ) || jsonb_build_object(
    'heroine9', jsonb_build_object(
      'posture', 'standing',
      'clothing', jsonb_build_object(
        'uniform_top', 'worn',
        'uniform_bottom', 'worn',
        'underwear_top', 'worn',
        'underwear_bottom', 'worn'
      ),
      'updated_turn', COALESCE((data->>'turn_count')::integer, 0),
      'current_action', '공개된 병원 공간에서 몸을 가리고 유니폼을 갖춰 입은 채 플레이어와 대화 중'
    )
  ),
  true
)
WHERE game_id = '9ed5b835-9948-4cad-ac25-3ebff7348574';
