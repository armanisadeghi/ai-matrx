-- hr_l9_04_org_rule_overlap_refusal.sql
--
-- The one-per-window exclusion constraint is correct: active rules with the same
-- organization, class, jurisdiction, record class and overlapping effective range
-- must not coexist. Its SQLSTATE must still become a product refusal at the org-rule
-- save door, never the driver's raw constraint message.

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
    when sqlstate '23P01' then
      return jsonb_build_object('granted', false, 'reason', 'rule_window_conflict',
        'detail', 'A rule already covers this jurisdiction and effective period. Edit or retire that rule before adding another.');
    when sqlstate '23514' or sqlstate '23505' then
      return jsonb_build_object('granted', false, 'reason', 'rule_constraint_violated',
        'detail', 'This rule conflicts with a required rule constraint. Review the rule details and try again.');
  end;

  return jsonb_build_object('granted', true, 'rule_id', v_row.id,
                            'version', v_row.version, 'validation', v_pre);
end
$function$;

-- The active-window exclusion must survive; only its public error representation
-- changes. The handler is deliberately tested by its function source because the
-- migration role cannot create an HR-admin browser session inside this transaction.
do $proof$
declare
  v_definition text;
begin
  select pg_get_functiondef('hr.org_jurisdiction_rule_save(uuid,jsonb,boolean)'::regprocedure)
    into v_definition;
  v_definition := lower(v_definition);
  if v_definition not like '%when sqlstate ''23p01''%'
     or v_definition not like '%''reason'', ''rule_window_conflict''%'
     or v_definition like '%''detail'', sqlerrm%' then
    raise exception 'hr_l9_04: overlap SQLSTATE is not an honest org-rule refusal';
  end if;
end
$proof$;
