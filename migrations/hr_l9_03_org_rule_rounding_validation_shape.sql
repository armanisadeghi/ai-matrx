-- hr_l9_03_org_rule_rounding_validation_shape.sql
--
-- `allowed_modes` is schema-native JSON, but malformed callers can still send a
-- scalar. Do not expand that scalar before `org_jurisdiction_rule_save` reaches its
-- caught write block: leave it for the row schema validator, which the door maps to
-- `invalid_rule_parameters` instead of leaking SQLSTATE 22000.

create or replace function hr.org_jurisdiction_rule_validation_parameters(
  p_rule_class text,
  p_parameters jsonb
)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case
    when p_rule_class = 'rounding-bounds' then jsonb_strip_nulls(jsonb_build_object(
      'increment_minutes', p_parameters -> 'max_increment_minutes',
      'mode', coalesce(
        (
          select to_jsonb(allowed.mode)
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(p_parameters -> 'allowed_modes') = 'array'
                then p_parameters -> 'allowed_modes'
              else '[]'::jsonb
            end
          ) as allowed(mode)
          where allowed.mode <> 'nearest'
          limit 1
        ),
        case
          when jsonb_typeof(p_parameters -> 'allowed_modes') = 'array'
            then p_parameters -> 'allowed_modes' -> 0
          else null
        end
      )
    ))
    else p_parameters
  end
$function$;

-- Shape proof: malformed scalar input is projected without a raise. The unchanged
-- save door then attempts the insert/update, whose schema trigger raises 22000
-- inside the door's caught block and returns `invalid_rule_parameters`.
do $proof$
begin
  if hr.org_jurisdiction_rule_validation_parameters(
       'rounding-bounds',
       '{"max_increment_minutes":15,"allowed_modes":"nearest"}'::jsonb
     ) <> '{"increment_minutes":15}'::jsonb then
    raise exception 'hr_l9_03: scalar allowed_modes did not stay on the caught schema-validation path';
  end if;
end
$proof$;
