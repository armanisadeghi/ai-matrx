-- chair-step: puts custom._automation_values_errors(uuid, uuid, uuid, jsonb, text) back as it was before notionsmall2_c_in_days_must_be_a_number.sql (an {"in_days": …} value is no longer judged when saved).
-- lock: custom
-- lane: NOTION-SMALL-2
--
CREATE OR REPLACE FUNCTION custom._automation_values_errors(p_organization_id uuid, p_target uuid, p_source uuid, p_values jsonb, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  k     text;
  v     jsonb;
  v_err jsonb := '{}'::jsonb;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    return jsonb_build_object(p_path, 'Say which properties to set: a map from a property of the table to its new value.');
  end if;
  for k, v in select key, value from jsonb_each(p_values) loop
    if k !~* c_uuid or not custom._decoration_field_ok(p_organization_id, p_target, k) then
      v_err := v_err || jsonb_build_object(p_path || '.' || k, 'That is not a property of the table it should be set on.');
    elsif jsonb_typeof(v) = 'object' and v ? 'from' then
      if jsonb_typeof(v -> 'from') <> 'string' or (v ->> 'from') !~* c_uuid
         or not custom._decoration_field_ok(p_organization_id, p_source, v ->> 'from') then
        v_err := v_err || jsonb_build_object(p_path || '.' || k, 'Copying from a property: that property is not on the table the automation watches.');
      end if;
    end if;
  end loop;
  return v_err;
end
$function$;
