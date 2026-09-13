-- hr_l9_02_org_rule_rounding_contract.sql
--
-- The jurisdiction-rule row schema is the durable contract: rounding bounds use
-- `max_increment_minutes` and `allowed_modes`. The org-rule save door historically
-- accepted the configuration-validator's legacy `increment_minutes` / `mode` pair
-- and sent it straight to that schema, so a warning acknowledgement could end in a
-- raw SQLSTATE 22000. Keep legacy operational callers working at the door while
-- storing only the schema-native representation.

create or replace function hr.normalize_org_jurisdiction_rule_parameters(
  p_rule_class text,
  p_parameters jsonb
)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_parameters jsonb := coalesce(p_parameters, '{}'::jsonb);
  v_native jsonb;
begin
  if p_rule_class <> 'rounding-bounds' or jsonb_typeof(v_parameters) <> 'object' then
    return v_parameters;
  end if;

  -- Native keys win when a caller is mid-migration and sends both spellings.
  v_native := v_parameters - 'increment_minutes' - 'mode';
  if not (v_native ? 'max_increment_minutes') and v_parameters ? 'increment_minutes' then
    v_native := v_native || jsonb_build_object(
      'max_increment_minutes', v_parameters -> 'increment_minutes'
    );
  end if;
  if not (v_native ? 'allowed_modes') and v_parameters ? 'mode' then
    v_native := v_native || jsonb_build_object(
      'allowed_modes', jsonb_build_array(v_parameters -> 'mode')
    );
  end if;
  return v_native;
end
$function$;

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
      -- `validate_org_config` is the existing configuration-validator contract.
      -- It accepts one chosen mode, so a non-neutral allowed mode wins the
      -- compatibility projection. Otherwise its first (nearest) mode is used.
      -- The stored rule remains the complete schema-native array.
      'increment_minutes', p_parameters -> 'max_increment_minutes',
      'mode', coalesce(
        (
          select to_jsonb(allowed.mode)
          from jsonb_array_elements_text(p_parameters -> 'allowed_modes') as allowed(mode)
          where allowed.mode <> 'nearest'
          limit 1
        ),
        p_parameters -> 'allowed_modes' -> 0
      )
    ))
    else p_parameters
  end
$function$;

create or replace function hr.org_jurisdiction_rule_save(
  p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_class hr.jurisdiction_rule_class%rowtype; v_id uuid;
  v_existing hr.jurisdiction_rule%rowtype; v_pre jsonb; v_row hr.jurisdiction_rule%rowtype;
  v_key text; v_params jsonb; v_validation_params jsonb;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin', 'hr_owner') then
    return jsonb_build_object('granted', false, 'reason', 'not_an_hr_admin',
      'detail', 'Org rules are authored by HR administration.');
  end if;

  select * into v_class from hr.jurisdiction_rule_class
   where slug = p_payload ->> 'rule_class' and deleted_at is null;
  if v_class.id is null then
    return jsonb_build_object('granted', false, 'reason', 'unknown_rule_class');
  end if;
  if v_class.org_configurable = 'no' then
    return jsonb_build_object('granted', false, 'reason', 'class_not_org_configurable',
      'detail', format('%s is statutory-only: an organization configures how it complies (reminders, posture), never the legal content.', v_class.label));
  end if;

  v_key := coalesce(nullif(p_payload ->> 'jurisdiction_key', ''), 'US');
  if not exists (select 1 from hr.jurisdiction j where j.key = v_key) then
    return jsonb_build_object('granted', false, 'reason', 'unknown_jurisdiction', 'jurisdiction_key', v_key);
  end if;
  v_params := hr.normalize_org_jurisdiction_rule_parameters(
    v_class.slug,
    coalesce(p_payload -> 'parameters', '{}'::jsonb)
  );
  v_validation_params := hr.org_jurisdiction_rule_validation_parameters(v_class.slug, v_params);

  -- Advisory law warns and needs an explicit acknowledgement, never a block.
  v_pre := hr.validate_org_config(p_organization_id, v_class.slug, v_validation_params,
                                  array[v_key], current_date);
  if not coalesce((v_pre ->> 'ok')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'unlawful_configuration',
      'validation', v_pre, 'payload', p_payload);
  end if;
  if jsonb_array_length(coalesce(v_pre -> 'warnings', '[]'::jsonb)) > 0 and not p_accept_warnings then
    return jsonb_build_object('granted', false, 'reason', 'warnings_unacknowledged',
      'validation', v_pre, 'payload', p_payload, 'save_anyway', true);
  end if;

  v_id := nullif(p_payload ->> 'id', '')::uuid;
  if v_id is not null then
    select * into v_existing from hr.jurisdiction_rule
     where id = v_id and organization_id = p_organization_id
       and source_scope = 'org_policy' and deleted_at is null;
    if v_existing.id is null then
      return jsonb_build_object('granted', false, 'reason', 'not_found',
        'detail', 'Only this organization''s own rules can be edited here. The platform baseline is read-only.');
    end if;
  end if;

  begin
    perform hr.arm_write();
    if v_id is null then
      insert into hr.jurisdiction_rule
        (rule_class_id, jurisdiction_key, effective_from, effective_to, applicability,
         parameters, status, basis, citation, source_scope, organization_id, visibility)
      values
        (v_class.id, v_key,
         coalesce(nullif(p_payload ->> 'effective_from', '')::date, current_date),
         nullif(p_payload ->> 'effective_to', '')::date,
         coalesce(p_payload -> 'applicability', '[]'::jsonb),
         v_params, 'active',
         coalesce(nullif(p_payload ->> 'basis', ''), 'Organization policy'),
         coalesce(p_payload -> 'citation',
                  jsonb_build_object('authority', 'Organization policy', 'url', null)),
         'org_policy', p_organization_id, 'internal')
      returning * into v_row;
    else
      update hr.jurisdiction_rule set
        jurisdiction_key = v_key,
        effective_from = coalesce(nullif(p_payload ->> 'effective_from', '')::date, effective_from),
        effective_to = nullif(p_payload ->> 'effective_to', '')::date,
        applicability = coalesce(p_payload -> 'applicability', applicability),
        parameters = v_params,
        basis = coalesce(nullif(p_payload ->> 'basis', ''), basis),
        citation = coalesce(p_payload -> 'citation', citation)
       where id = v_id
      returning * into v_row;
    end if;
  exception
    when sqlstate '22000' then
      return jsonb_build_object('granted', false, 'reason', 'invalid_rule_parameters',
        'detail', 'This rule has fields that do not match the selected law type. Review the rule details and try again.');
    when sqlstate '23514' or sqlstate '23P01' or sqlstate '23505' then
      return jsonb_build_object('granted', false, 'reason', 'rule_constraint_violated',
        'detail', sqlerrm, 'payload', p_payload);
  end;

  return jsonb_build_object('granted', true, 'rule_id', v_row.id,
                            'version', v_row.version, 'validation', v_pre);
end
$function$;

-- Migration-time contract proof: both wire spellings produce the same canonical
-- stored values and the validator receives its established compatibility shape.
do $proof$
declare
  v_native jsonb;
  v_legacy jsonb;
begin
  v_native := hr.normalize_org_jurisdiction_rule_parameters(
    'rounding-bounds',
    '{"max_increment_minutes":15,"allowed_modes":["nearest"]}'::jsonb
  );
  v_legacy := hr.normalize_org_jurisdiction_rule_parameters(
    'rounding-bounds',
    '{"increment_minutes":15,"mode":"nearest"}'::jsonb
  );
  if v_native <> v_legacy then
    raise exception 'hr_l9_02: native and legacy rounding parameters diverged (% vs %)', v_native, v_legacy;
  end if;
  if hr.org_jurisdiction_rule_validation_parameters('rounding-bounds', v_native)
       <> '{"increment_minutes":15,"mode":"nearest"}'::jsonb then
    raise exception 'hr_l9_02: native rounding parameters no longer reach the validator compatibly';
  end if;
  if hr.org_jurisdiction_rule_validation_parameters(
       'rounding-bounds',
       '{"max_increment_minutes":15,"allowed_modes":["nearest","up"]}'::jsonb
     ) <> '{"increment_minutes":15,"mode":"up"}'::jsonb then
    raise exception 'hr_l9_02: a non-neutral rounding mode no longer reaches the validator';
  end if;
end
$proof$;
