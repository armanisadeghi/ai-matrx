-- DD-192 — two more doors that took an argument on trust.
--
-- Both found by `pnpm check:door-rows` over the full declared signed-in door
-- population, calling each door as two real signed-in identities with arguments
-- naming a THIRD identity's rows, in rolled-back transactions.
--
--   public.hr_my_incident_reports(p_organization_id) — the READ was already
--       bounded, so a stranger saw no incident reports; the call nonetheless
--       WROTE an access-audit row into that organization's log. Same class as
--       public.hr_access_audit_query, fixed the same way and in the same hour.
--
--   public.agx_duplicate_shortcut(p_shortcut_id) — SECURITY DEFINER, so its
--       `SELECT * FROM agent.shortcut WHERE id = p_shortcut_id` ignored RLS. Any
--       signed-in caller holding a shortcut uuid received a personal copy of any
--       shortcut in the database, mappings and overrides included. Proven live
--       as test@test.com and as a user who belongs to no organization.
--
-- Neither fix invents a rule: the organization claim goes through
-- `iam.has_org_access_for` (DD-191's helper of record), and the shortcut read
-- is gated on the same predicate `agent.shortcut`'s own std_select policy uses.

CREATE OR REPLACE FUNCTION public.hr_my_incident_reports(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_mine uuid[]; v_rows jsonb := '[]'::jsonb; v_ids uuid[] := '{}';
  v_audit uuid; v_org uuid := p_organization_id; rec record;
begin
  if v_uid is null then
    raise exception 'hr_my_incident_reports: no authenticated caller' using errcode = '42501';
  end if;
  v_mine := hr.employments_of(v_uid);
  if v_org is null then
    select em.organization_id into v_org
      from hr.employment em where em.id = any(v_mine) limit 1;
  end if;
  -- 🚨 DD-192: the organization argument is a CLAIM and it is checked before
  -- anything is written. The read below was already bounded to the caller's own
  -- employments, so a stranger got no rows — but the call still reached
  -- `hr._record_access_audit` and WROTE a row into that organization's access
  -- log, from any free account, with an id that is not a secret. Same defect and
  -- same fix as `public.hr_access_audit_query` (this migration's sibling).
  if v_org is not null
     and not iam.has_org_access_for(v_uid, v_org)
     and not exists (select 1 from hr.employment em
                      where em.id = any(v_mine) and em.organization_id = v_org) then
    raise exception 'You have no standing in that organization, so you cannot list its incident reports. Switch to an organization you belong to.'
      using errcode = '42501';
  end if;
  if v_org is null then
    -- no employment anywhere: an honest empty list, not a refusal. This person has filed nothing
    -- because this person is not an employee, and saying so leaks nothing about any record.
    return jsonb_build_object('granted', true, 'rows', '[]'::jsonb, 'row_count', 0);
  end if;

  for rec in
    select i.* from hr.incident i
     where i.organization_id = v_org
       and i.deleted_at is null
       and i.reported_anonymously = false
       and i.reporter_employment_id = any(v_mine)
     order by i.reported_at desc
     limit 200
  loop
    -- the veto is applied PER ROW and it is applied here too: a reporter who has since been named
    -- as a respondent on their own report loses it from this list on their very next request.
    continue when hr.incident_excluded(v_uid, rec.id);
    v_ids := v_ids || rec.id;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'incident_id',   rec.id,
      'incident_kind', rec.incident_kind,
      'state',         rec.state,
      'state_label',   hr.incident_state_label(rec.state),
      'next_step',     hr.incident_next_step_sentence(rec.state, rec.follow_up_on),
      'next_step_on',  rec.follow_up_on,
      'reported_at',   rec.reported_at,
      'updated_at',    rec.updated_at,
      'resolved_at',   rec.resolved_at));
  end loop;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'list', p_target_token => 'hr_incident',
    p_purpose => 'employee_request', p_basis => 'self',
    p_granted => true, p_target_ids => v_ids[1:100],
    p_row_count => coalesce(array_length(v_ids,1), 0),
    p_sensitivity_tier => 'restricted', p_is_self_access => true);

  return jsonb_build_object('granted', true, 'rows', v_rows,
    'row_count', coalesce(array_length(v_ids,1), 0), 'audit_id', v_audit);
end
$function$
;

CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut(p_shortcut_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record; v_new_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shortcut not found'; END IF;
  -- 🚨 DD-192: DUPLICATING IS READING. This function is SECURITY DEFINER, so the
  -- SELECT above ignores RLS entirely: until 2026-09-13 any signed-in caller
  -- holding a shortcut's uuid got a personal copy of ANY shortcut in the
  -- database — its bound agent and version, its scope, context and value
  -- mappings, its default input and variables, its LLM overrides. The copy being
  -- "personal" is not a gate; the read is. The test is the same one
  -- `agent.shortcut`'s own std_select policy applies, so what can be duplicated
  -- is exactly what can be opened.
  IF NOT (v_source.created_by = v_uid
          OR v_source.visibility = 'public'::platform.visibility
          OR (v_source.organization_id IS NOT NULL AND iam.has_org_access_for(v_uid, v_source.organization_id))
          OR iam.has_access('agent_shortcut', p_shortcut_id, 'viewer'::public.permission_level)
          OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'You cannot duplicate a shortcut you cannot open. Ask whoever owns it to share it with you first.'
      USING ERRCODE = '42501';
  END IF;
  v_new_id := gen_random_uuid();
  -- a duplicate is always personal: no org, no scoping edges copied
  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, sort_order,
    agent_id, agent_version_id, use_latest,
    enabled_features, scope_mappings, context_mappings, value_mappings,
    display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id
  ) VALUES (
    v_new_id, v_source.category_id, v_source.label || ' (Copy)',
    v_source.description, v_source.icon_name, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings, v_source.value_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, v_uid, NULL
  );
  RETURN v_new_id;
END;
$function$
;
