create or replace function public.jsonb_deep_merge(p_base jsonb, p_patch jsonb)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_object_patch jsonb;
begin
  if jsonb_typeof(p_base) <> 'object' or jsonb_typeof(p_patch) <> 'object' then
    return p_patch;
  end if;

  select coalesce(
    jsonb_object_agg(
      key,
      case
        when p_base ? key then public.jsonb_deep_merge(p_base -> key, value)
        else value
      end
    ),
    '{}'::jsonb
  )
  into v_object_patch
  from jsonb_each(p_patch);

  return p_base || v_object_patch;
end;
$function$;
