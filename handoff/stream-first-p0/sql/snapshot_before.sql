select game_id, turn_count, md5(data::text) as save_data_md5,
       (select count(*) from game_memories gm where gm.game_id = gs.game_id) as memory_count
from game_save gs
where game_id in (
  '9ed5b835-9948-4cad-ac25-3ebff7348574'::uuid,
  '48b77aca-6185-414d-8a12-c795ae751b04'::uuid,
  'c792613f-dc27-4835-9403-dc87d51b9e91'::uuid
)
order by game_id;
