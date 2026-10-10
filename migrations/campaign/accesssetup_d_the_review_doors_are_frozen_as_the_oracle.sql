-- chair-step: it ADDS 48 frozen copies hr._legacy_<name> of every current standard-review door (hr.hr_review_*), every hr._rev_* helper and hr.review_wf_apply / hr.review_wf_digest, taken from pg_get_functiondef on 2026-10-10, with client EXECUTE revoked from public, anon and authenticated and a server-only platform.client_callable_door row for each SECURITY DEFINER copy. No live function is replaced or swapped; nothing calls the copies except the equivalence oracle, so no person's answer changes anywhere.
-- lane: access-setup
-- lock: hr
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §8.3 ("Freeze the oracle first").
-- Inverse: migrations/inverse/accesssetup_d_the_review_doors_are_frozen_as_the_oracle_down.sql
--
-- Each body is the live text with exactly two kinds of edit: the function's own name gains the
-- `_legacy_` prefix, and every call from one frozen function to another frozen sibling
-- (hr.<name>( for a name in this set) is repointed to that sibling's `_legacy_` copy. Without the second
-- edit the legacy doors would call hr._rev_seat / _rev_lane / _rev_response_visible — which step 4 turns
-- into thin calls of the new code — and the oracle would compare the new code with itself (§8.4).
-- Calls to functions outside the set (hr.capability, hr.manager_as_of, hr.employments_of, hr._hr_knob,
-- hr.wf_request, …) are unchanged: the swap does not touch them. Delete the copies only after step 9's
-- re-proof.

CREATE FUNCTION hr._legacy__rev_answer_problems(p_snapshot jsonb, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
declare
  sec jsonb; q jsonb; it jsonb; v jsonb; n integer; v_out jsonb := '[]'::jsonb;
  v_points jsonb := coalesce(p_snapshot #> '{rating_scale,points}', '[]'::jsonb);
  v_list jsonb; v_req boolean;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or (p_answers ->> '__kind') is distinct from 'performance_review_answers' then
    return jsonb_build_array(jsonb_build_object('question', null, 'problem', 'not_performance_review_answers'));
  end if;
  for sec in select e from jsonb_array_elements(coalesce(p_snapshot -> 'sections', '[]'::jsonb)) e loop
    for q in select e from jsonb_array_elements(coalesce(sec -> 'questions', '[]'::jsonb)) e loop
      v_req := coalesce((q ->> 'required')::boolean, true);
      if q ->> 'type' in ('narrative_list', 'responsibilities') then
        v_list := p_answers #> array['lists', q ->> 'key'];
        if v_list is null or jsonb_typeof(v_list) <> 'array' then v_list := '[]'::jsonb; end if;
        select count(*) into n from jsonb_array_elements(v_list) e
         where jsonb_typeof(e) = 'string' and btrim(e #>> '{}') <> '';
        if v_req and n < coalesce((q ->> 'min_items')::integer, 1) then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'too_few',
                                               'min_items', coalesce((q ->> 'min_items')::integer, 1), 'have', n);
        elsif q ? 'max_items' and n > (q ->> 'max_items')::integer then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'too_many',
                                               'max_items', (q ->> 'max_items')::integer, 'have', n);
        end if;
      elsif q ->> 'type' = 'rating' then
        for it in select e from jsonb_array_elements(coalesce(q -> 'items', '[]'::jsonb)) e loop
          v := p_answers #> array['ratings', (q ->> 'key') || '.' || (it ->> 'key')];
          if v is null or v = 'null'::jsonb then
            if v_req then
              v_out := v_out || jsonb_build_object('question', (q ->> 'key') || '.' || (it ->> 'key'),
                                                   'problem', 'unrated');
            end if;
          elsif not exists (select 1 from jsonb_array_elements(v_points) p where p -> 'value' = v) then
            v_out := v_out || jsonb_build_object('question', (q ->> 'key') || '.' || (it ->> 'key'),
                                                 'problem', 'out_of_scale');
          end if;
        end loop;
      elsif q ->> 'type' = 'text' then
        if v_req and btrim(coalesce(p_answers #>> array['texts', q ->> 'key'], '')) = '' then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'missing');
        end if;
      end if;
    end loop;
  end loop;
  return v_out;
end
$function$;

CREATE FUNCTION hr._legacy__rev_answer_problems(p_snapshot jsonb, p_answers jsonb, p_goal_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
declare
  sec jsonb; q jsonb; it jsonb; v jsonb; n integer; v_out jsonb := '[]'::jsonb;
  v_points jsonb := coalesce(p_snapshot #> '{rating_scale,points}', '[]'::jsonb);
  v_list jsonb; v_req boolean; g uuid; k text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or (p_answers ->> '__kind') is distinct from 'performance_review_answers' then
    return jsonb_build_array(jsonb_build_object('question', null, 'problem', 'not_performance_review_answers'));
  end if;
  for sec in select e from jsonb_array_elements(coalesce(p_snapshot -> 'sections', '[]'::jsonb)) e loop
    for q in select e from jsonb_array_elements(coalesce(sec -> 'questions', '[]'::jsonb)) e loop
      v_req := coalesce((q ->> 'required')::boolean, true);
      if q ->> 'type' in ('narrative_list', 'responsibilities') then
        v_list := p_answers #> array['lists', q ->> 'key'];
        if v_list is null or jsonb_typeof(v_list) <> 'array' then v_list := '[]'::jsonb; end if;
        select count(*) into n from jsonb_array_elements(v_list) e
         where jsonb_typeof(e) = 'string' and btrim(e #>> '{}') <> '';
        if v_req and n < coalesce((q ->> 'min_items')::integer, 1) then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'too_few',
                                               'min_items', coalesce((q ->> 'min_items')::integer, 1), 'have', n);
        elsif q ? 'max_items' and n > (q ->> 'max_items')::integer then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'too_many',
                                               'max_items', (q ->> 'max_items')::integer, 'have', n);
        end if;
      elsif q ->> 'type' = 'rating' then
        for it in select e from jsonb_array_elements(coalesce(q -> 'items', '[]'::jsonb)) e loop
          v := p_answers #> array['ratings', (q ->> 'key') || '.' || (it ->> 'key')];
          if v is null or v = 'null'::jsonb then
            if v_req then
              v_out := v_out || jsonb_build_object('question', (q ->> 'key') || '.' || (it ->> 'key'),
                                                   'problem', 'unrated');
            end if;
          elsif not exists (select 1 from jsonb_array_elements(v_points) p where p -> 'value' = v) then
            v_out := v_out || jsonb_build_object('question', (q ->> 'key') || '.' || (it ->> 'key'),
                                                 'problem', 'out_of_scale');
          end if;
        end loop;
      elsif q ->> 'type' = 'goal_review' then
        -- every goal the review shows needs a rating on the frozen scale (hr_rev_09)
        foreach g in array coalesce(p_goal_ids, '{}'::uuid[]) loop
          v := p_answers #> array['ratings', 'goals.' || g::text];
          if v is null or v = 'null'::jsonb then
            if v_req then
              v_out := v_out || jsonb_build_object('question', 'goals.' || g::text, 'problem', 'unrated');
            end if;
          elsif not exists (select 1 from jsonb_array_elements(v_points) p where p -> 'value' = v) then
            v_out := v_out || jsonb_build_object('question', 'goals.' || g::text, 'problem', 'out_of_scale');
          end if;
        end loop;
      elsif q ->> 'type' = 'text' then
        if v_req and btrim(coalesce(p_answers #>> array['texts', q ->> 'key'], '')) = '' then
          v_out := v_out || jsonb_build_object('question', q ->> 'key', 'problem', 'missing');
        end if;
      end if;
    end loop;
  end loop;
  -- "goals.<id>" is reserved for goal_review: a key naming a goal the review does not show is refused
  for k in select e.key from jsonb_each(case when jsonb_typeof(p_answers -> 'ratings') = 'object'
                                             then p_answers -> 'ratings' else '{}'::jsonb end) e
            where e.key like 'goals.%' loop
    if not (substr(k, 7) = any(coalesce(p_goal_ids, '{}'::uuid[])::text[])) then
      v_out := v_out || jsonb_build_object('question', k, 'problem', 'unknown_goal');
    end if;
  end loop;
  return v_out;
end
$function$;

CREATE FUNCTION hr._legacy__rev_can_manage(p_uid uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select p_uid is not null and p_org is not null
         and coalesce(hr.capability(p_uid, 'performance.manage', null, current_date, p_org), false);
$function$;

CREATE FUNCTION hr._legacy__rev_close_step(p_review_id uuid, p_step_key text, p_decision text, p_uid uuid, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  r hr.review%rowtype; st hr.workflow_step%rowtype; v_res jsonb; v_dec uuid; v_emp uuid;
begin
  select * into r from hr.review where id = p_review_id;
  if r.workflow_instance_id is null then
    return jsonb_build_object('closed', false, 'reason', 'no_workflow');
  end if;
  select * into st from hr.workflow_step
   where workflow_instance_id = r.workflow_instance_id and step_key = p_step_key and state = 'active'
   order by step_order limit 1;
  if st.id is null then
    return jsonb_build_object('closed', false, 'reason', 'no_open_step', 'step_key', p_step_key);
  end if;
  -- 🚨 THE ENGINE MAY REFUSE, AND THE REVIEW MUST STILL SAY SO RATHER THAN LOSE THE PERSON'S ACT.
  -- Measured 2026-10-09: a decision by anyone other than the instance's creator raises 42501
  -- owner_only inside hr._wf_revoke_step (iam._guard_private_grant_owner_only: hr_workflow_instance
  -- is class confidential and absent from hr._door_spec). The block rolls the engine's half back to
  -- its savepoint and the door reports {closed:false, reason:'engine_refused'} — never a silent
  -- success, never a lost submit.
  begin
    if p_uid = any(coalesce(st.resolved_user_ids, '{}'::uuid[])) then
      v_res := hr.wf_decide(st.id, p_decision, null, '{}'::jsonb);
      return jsonb_build_object('closed', coalesce((v_res ->> 'granted')::boolean, false),
                                'via', 'engine', 'step_key', p_step_key,
                                'reason', case when not coalesce((v_res ->> 'granted')::boolean, false)
                                               then v_res ->> 'reason' end);
    end if;
    v_emp := hr._l1_self_employment(p_uid, r.organization_id, current_date);
    perform hr.arm_write();
    insert into hr.workflow_decision
      (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
       actor_type, actor_user_id, actor_employment_id, approval_basis, autonomy_mode,
       target_digest, client_context)
    values (r.organization_id, r.workflow_instance_id, st.id, p_step_key, p_decision,
            case when p_lane = 'recorder' then 'recorded by HR for a person with no login'
                 else 'decided by the reviewer frozen on the review' end,
            case when p_lane = 'recorder' then 'hr_admin' else 'manager' end,
            p_uid, v_emp, 'authority', st.autonomy_mode,
            (select target_digest from hr.workflow_instance where id = r.workflow_instance_id),
            jsonb_build_object('lane', p_lane, 'door', 'hr_review'))
    returning id into v_dec;
    perform hr._wf_event(r.workflow_instance_id, st.id, 'decided', 'active', null,
                         case when p_lane = 'recorder' then 'hr_admin' else 'manager' end,
                         p_uid, v_emp,
                         jsonb_build_object('decision', p_decision, 'decision_id', v_dec,
                                            'basis', 'authority', 'lane', p_lane));
    v_res := hr._wf_close_step(st.id, 'approved', null);
    return jsonb_build_object('closed', true, 'via', 'recorded', 'step_key', p_step_key, 'lane', p_lane);
  exception when others then
    raise warning 'hr._rev_close_step: the workflow engine refused step % of review % [%] %',
      p_step_key, p_review_id, sqlstate, sqlerrm;
    return jsonb_build_object('closed', false, 'reason', 'engine_refused', 'step_key', p_step_key,
                              'sqlstate', sqlstate);
  end;
end
$function$;

CREATE FUNCTION hr._legacy__rev_default_rating_scale()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
  select jsonb_build_object(
    '__kind', 'performance_review_rating_scale',
    'key', 'five_point',
    'points', jsonb_build_array(
      jsonb_build_object('__kind','performance_review_rating_point','value',1,'key','unsatisfactory','label','Unsatisfactory',
                         'description','Performance is below job requirements.'),
      jsonb_build_object('__kind','performance_review_rating_point','value',2,'key','needs_improvement','label','Needs Improvement',
                         'description','Performance meets some, but not all, job requirements.'),
      jsonb_build_object('__kind','performance_review_rating_point','value',3,'key','successful','label','Successful',
                         'description','Performance fully meets job requirements.'),
      jsonb_build_object('__kind','performance_review_rating_point','value',4,'key','exceeds','label','Exceeds Expectations',
                         'description','Performance consistently meets and frequently exceeds job requirements.'),
      jsonb_build_object('__kind','performance_review_rating_point','value',5,'key','outstanding','label','Outstanding',
                         'description','Performance consistently far exceeds job requirements.')));
$function$;

CREATE FUNCTION hr._legacy__rev_default_sections()
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
declare
  q  constant text := 'performance_review_question';
  s  constant text := 'performance_review_template_section';
  it constant text := 'performance_review_rating_item';
begin
  return jsonb_build_array(
    jsonb_build_object('__kind', s, 'key', 'responsibilities', 'title', 'Job Responsibilities',
      'description', 'The core responsibilities this role is accountable for.',
      'questions', jsonb_build_array(jsonb_build_object('__kind', q, 'key', 'responsibilities',
        'type', 'responsibilities', 'label', 'Job Responsibilities', 'required', true,
        'min_items', 1, 'max_items', 12))),
    jsonb_build_object('__kind', s, 'key', 'accomplishments', 'title', 'Accomplishments',
      'description', 'Concrete wins from this review period.',
      'questions', jsonb_build_array(jsonb_build_object('__kind', q, 'key', 'accomplishments',
        'type', 'narrative_list', 'label', 'Accomplishments', 'required', true,
        'min_items', 2, 'max_items', 5))),
    jsonb_build_object('__kind', s, 'key', 'strengths', 'title', 'Strengths',
      'description', 'What this person does consistently well.',
      'questions', jsonb_build_array(jsonb_build_object('__kind', q, 'key', 'strengths',
        'type', 'narrative_list', 'label', 'Strengths', 'required', true,
        'min_items', 2, 'max_items', 5))),
    jsonb_build_object('__kind', s, 'key', 'opportunities', 'title', 'Opportunities for Improvement',
      'description', 'Where there is the most room to grow.',
      'questions', jsonb_build_array(jsonb_build_object('__kind', q, 'key', 'opportunities',
        'type', 'narrative_list', 'label', 'Opportunities for Improvement', 'required', true,
        'min_items', 2, 'max_items', 5))),
    jsonb_build_object('__kind', s, 'key', 'ratings', 'title', 'Ratings',
      'description', 'Rate each item on the five-point scale.',
      'questions', jsonb_build_array(
        jsonb_build_object('__kind', q, 'key', 'job_knowledge', 'type', 'rating', 'label', 'Job Knowledge', 'required', true,
          'items', jsonb_build_array(
            jsonb_build_object('__kind', it, 'key', 'meets_job_requirements', 'label', 'Meets job requirements'),
            jsonb_build_object('__kind', it, 'key', 'applies_knowledge_skills', 'label', 'Applies knowledge/skills to job'),
            jsonb_build_object('__kind', it, 'key', 'adds_to_knowledge_skills', 'label', 'Adds to knowledge and skills'))),
        jsonb_build_object('__kind', q, 'key', 'performance', 'type', 'rating', 'label', 'Performance', 'required', true,
          'items', jsonb_build_array(
            jsonb_build_object('__kind', it, 'key', 'completes_tasks_on_time', 'label', 'Completes tasks on time'),
            jsonb_build_object('__kind', it, 'key', 'work_quantity', 'label', 'Work quantity'),
            jsonb_build_object('__kind', it, 'key', 'work_quality', 'label', 'Work quality'),
            jsonb_build_object('__kind', it, 'key', 'productivity', 'label', 'Productivity'),
            jsonb_build_object('__kind', it, 'key', 'works_independently', 'label', 'Works independently'),
            jsonb_build_object('__kind', it, 'key', 'initiative_creativity', 'label', 'Initiative and creativity'),
            jsonb_build_object('__kind', it, 'key', 'individual_judgment', 'label', 'Individual judgment'),
            jsonb_build_object('__kind', it, 'key', 'planning_organization', 'label', 'Planning and organization'))),
        jsonb_build_object('__kind', q, 'key', 'communication', 'type', 'rating', 'label', 'Communication', 'required', true,
          'items', jsonb_build_array(
            jsonb_build_object('__kind', it, 'key', 'reports_to_supervisor', 'label', 'Reports to proper supervisor'),
            jsonb_build_object('__kind', it, 'key', 'understands_instructions', 'label', 'Understands instructions easily'),
            jsonb_build_object('__kind', it, 'key', 'verbal_communication', 'label', 'Verbal communication skills'),
            jsonb_build_object('__kind', it, 'key', 'written_communication', 'label', 'Written communication skills'))),
        jsonb_build_object('__kind', q, 'key', 'interpersonal_skills', 'type', 'rating', 'label', 'Interpersonal Skills', 'required', true,
          'items', jsonb_build_array(
            jsonb_build_object('__kind', it, 'key', 'working_relationship_others', 'label', 'Working relationship with others'),
            jsonb_build_object('__kind', it, 'key', 'relationship_customers', 'label', 'Relationship with customers/clients'),
            jsonb_build_object('__kind', it, 'key', 'relationship_supervisor', 'label', 'Relationship with supervisor'))),
        jsonb_build_object('__kind', q, 'key', 'attendance', 'type', 'rating', 'label', 'Attendance', 'required', true,
          'items', jsonb_build_array(
            jsonb_build_object('__kind', it, 'key', 'punctuality', 'label', 'Punctuality'),
            jsonb_build_object('__kind', it, 'key', 'absenteeism', 'label', 'Absenteeism'),
            jsonb_build_object('__kind', it, 'key', 'overall_attendance', 'label', 'Overall attendance record'))),
        jsonb_build_object('__kind', q, 'key', 'safety_compliance', 'type', 'rating', 'label', 'Safety Compliance', 'required', true,
          'items', jsonb_build_array(
            jsonb_build_object('__kind', it, 'key', 'safe_condition', 'label', 'Keeps workplace and workspace in safe condition'),
            jsonb_build_object('__kind', it, 'key', 'safety_over_production', 'label', 'Puts safety over production'))))),
    jsonb_build_object('__kind', s, 'key', 'goals', 'title', 'Goals',
      'description', 'Goals for the next review period.',
      'questions', jsonb_build_array(jsonb_build_object('__kind', q, 'key', 'goals', 'type', 'text',
        'label', 'Goals', 'required', false))),
    jsonb_build_object('__kind', s, 'key', 'additional_comments', 'title', 'Additional Comments',
      'description', 'Anything else worth recording.',
      'questions', jsonb_build_array(jsonb_build_object('__kind', q, 'key', 'additional_comments',
        'type', 'text', 'label', 'Additional Comments', 'required', false))));
end
$function$;

CREATE FUNCTION hr._legacy__rev_ensure_cadence(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_cad integer := (hr._legacy__rev_knob(p_org, 'standard_review_reminder_cadence_hours', '48'::jsonb) #>> '{}')::integer;
  pd hr.workflow_definition%rowtype; v_org_def uuid; v_new uuid;
begin
  select * into pd from hr.workflow_definition
   where flow_key = 'performance_review' and status = 'published' and organization_id = v_sys and deleted_at is null;
  select id into v_org_def from hr.workflow_definition
   where flow_key = 'performance_review' and status = 'published' and organization_id = p_org and deleted_at is null;
  perform hr.arm_write();
  if v_org_def is not null then
    update hr.workflow_definition set reminder_cadence_hours = v_cad
     where id = v_org_def and reminder_cadence_hours is distinct from v_cad;
    return jsonb_build_object('reminder_cadence_hours', v_cad, 'definition_id', v_org_def);
  end if;
  if pd.id is null or pd.reminder_cadence_hours is not distinct from v_cad then
    return jsonb_build_object('reminder_cadence_hours', coalesce(pd.reminder_cadence_hours, v_cad), 'definition_id', pd.id);
  end if;
  insert into hr.workflow_definition
    (flow_key, name, definition_version, status, effective_from, published_at, notes, sla_hours,
     reminder_cadence_hours, reminder_max, on_expiry, skip_absent_approver, allow_bulk_decide,
     organization_id, metadata)
  values (pd.flow_key, pd.name || ' (organization cadence)', 1, 'published', current_date, now(),
          'Copy of the platform definition carrying this organization''s standard_review_reminder_cadence_hours knob (hr_rev_05).',
          pd.sla_hours, v_cad, pd.reminder_max, pd.on_expiry, pd.skip_absent_approver, pd.allow_bulk_decide,
          p_org, jsonb_build_object('copied_from', pd.id))
  returning id into v_new;
  insert into hr.workflow_step_definition
    (workflow_definition_id, step_key, label, step_order, parallel_group, quorum_kind, quorum_n, condition,
     is_optional, allows_self, requires_reason, resolver_kind, authority_action, resolver_config,
     fallback_chain, sla_hours, reminder_cadence_hours, escalate_after_hours, escalation_resolver_kind,
     escalation_config, autonomy_mode, auto_decide_rule, timeout_action, result_window_hours, organization_id, metadata)
  select v_new, sd.step_key, sd.label, sd.step_order, sd.parallel_group, sd.quorum_kind, sd.quorum_n, sd.condition,
         sd.is_optional, sd.allows_self, sd.requires_reason, sd.resolver_kind, sd.authority_action, sd.resolver_config,
         sd.fallback_chain, sd.sla_hours, sd.reminder_cadence_hours, sd.escalate_after_hours, sd.escalation_resolver_kind,
         sd.escalation_config, sd.autonomy_mode, sd.auto_decide_rule, sd.timeout_action, sd.result_window_hours, p_org, sd.metadata
    from hr.workflow_step_definition sd where sd.workflow_definition_id = pd.id and sd.deleted_at is null;
  return jsonb_build_object('reminder_cadence_hours', v_cad, 'definition_id', v_new, 'created', true);
end
$function$;

CREATE FUNCTION hr._legacy__rev_knob(p_org uuid, p_key text, p_default jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'hr', 'public'
AS $function$
  select coalesce(hr._hr_knob('hr.performance', p_key, p_org, p_default), p_default);
$function$;

CREATE FUNCTION hr._legacy__rev_lane(p_uid uuid, p_review_id uuid, p_role text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare r hr.review%rowtype; v_mine uuid[];
begin
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null or p_uid is null then return null; end if;
  v_mine := coalesce(hr.employments_of(p_uid), '{}'::uuid[]);
  if p_role = 'self' then
    if r.employee_user_id = p_uid then return 'self'; end if;
    if r.employee_user_id is null and not (r.employment_id = any(v_mine))
       and hr._legacy__rev_can_manage(p_uid, r.organization_id) then return 'recorder'; end if;
  elsif p_role = 'manager' then
    if r.manager_user_id = p_uid or r.manager_employment_id = any(v_mine) then return 'self'; end if;
    if r.manager_user_id is null and not (r.employment_id = any(v_mine))
       and hr._legacy__rev_can_manage(p_uid, r.organization_id) then return 'recorder'; end if;
  elsif p_role = 'peer' then
    if exists (select 1 from hr.review_peer_nomination n where n.review_id = r.id and n.peer_user_id = p_uid
                 and n.status = 'approved' and n.deleted_at is null) then return 'self'; end if;
  end if;
  return null;
end
$function$;

CREATE FUNCTION hr._legacy__rev_mean_rating(p_answers jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
  select round(avg((v #>> '{}')::numeric), 2)
    from jsonb_each(coalesce(p_answers -> 'ratings', '{}'::jsonb)) e(k, v)
   where jsonb_typeof(v) = 'number';
$function$;

CREATE FUNCTION hr._legacy__rev_notify_peer(p_nomination_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare n hr.review_peer_nomination%rowtype; r hr.review%rowtype; v_res jsonb; v_first text;
begin
  select * into n from hr.review_peer_nomination where id = p_nomination_id;
  select * into r from hr.review where id = n.review_id;
  if n.peer_user_id is null then return jsonb_build_object('sent', false, 'reason', 'peer_has_no_login'); end if;
  select coalesce(nullif(btrim(e.preferred_first_name), ''), nullif(btrim(e.legal_first_name), ''), 'A colleague')
    into v_first from hr.employment em join hr.employee e on e.id = em.employee_id where em.id = r.employment_id;
  begin
    v_res := communication.notify_from_sql(r.organization_id, 'hr.performance.peer_feedback_requested', n.peer_user_id,
               null, null,
               jsonb_build_object('subject', jsonb_build_object('first_name', v_first, 'id', r.employment_id),
                                  'cycle', jsonb_build_object('id', r.cycle_id), 'review', jsonb_build_object('id', r.id),
                                  'review_id', r.id),
               hr.link_names_its_employer('/hr/performance/reviews/' || r.id::text, r.organization_id),
               'hr_review', r.id, 'hr_review_peer:' || n.id::text);
  exception when others then
    raise warning 'hr._rev_notify_peer: notice for nomination % not sent [%] %', n.id, sqlstate, sqlerrm;
    return jsonb_build_object('sent', false, 'reason', 'notify_refused', 'sqlstate', sqlstate);
  end;
  return jsonb_build_object('sent', true, 'result', v_res);
end
$function$;

CREATE FUNCTION hr._legacy__rev_person_name(p_employment_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select coalesce(nullif(btrim(e.display_name), ''),
                  nullif(btrim(concat_ws(' ', coalesce(e.preferred_first_name, e.legal_first_name),
                                              coalesce(e.preferred_last_name, e.legal_last_name))), ''))
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id;
$function$;

CREATE FUNCTION hr._legacy__rev_response_visible(p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare r hr.review%rowtype; x hr.review_response%rowtype; v_both boolean;
begin
  select * into r from hr.review where id = p_review_id;
  select * into x from hr.review_response where id = p_response_id and review_id = p_review_id;
  if r.id is null or x.id is null or p_seat is null then return false; end if;
  if x.respondent_user_id is not null and x.respondent_user_id = p_uid then return true; end if;
  -- peer feedback (hr_rev_07): the manager and HR read submitted peer responses; the employee only
  -- once the manager shares them (names are stripped by hr_review_get when the anonymous knob is on)
  if x.role = 'peer' then
    return case p_seat when 'hr' then true
                       when 'manager' then x.status = 'submitted'
                       when 'employee' then x.status = 'submitted' and r.peer_feedback_shared_at is not null
                       else false end;
  end if;
  v_both := r.self_submitted_at is not null and r.manager_submitted_at is not null;
  return case p_seat
    when 'hr'         then true
    when 'employee'   then x.role = 'self' or (x.role = 'manager' and r.shared_at is not null)
    when 'manager'    then x.role = 'manager' or (x.role = 'self' and x.status = 'submitted'
                           and (v_both or hr._legacy__rev_knob(r.organization_id, 'standard_review_manager_sees_self',
                                                       '"after_both_submit"'::jsonb) #>> '{}' = 'after_employee_submits'))
    when 'skip_level' then x.status = 'submitted' and v_both
    else false end;
end
$function$;

CREATE FUNCTION hr._legacy__rev_review_goal_ids(p_review_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'hr', 'public'
AS $function$
  -- the same overlap hr_review_get shows: the employee's live goals touching the cycle period
  select coalesce(array_agg(g.id order by g.id), '{}'::uuid[])
    from hr.review r join hr.review_cycle c on c.id = r.cycle_id
    join hr.goal g on g.employment_id = r.employment_id and g.deleted_at is null and g.status <> 'dropped'
                  and (g.start_on is null or g.start_on <= c.period_end)
                  and (g.due_on is null or g.due_on >= c.period_start)
   where r.id = p_review_id
     and exists (select 1 from jsonb_array_elements(coalesce(c.template_snapshot -> 'sections', '[]'::jsonb)) s,
                              jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q
                  where q ->> 'type' = 'goal_review');
$function$;

CREATE FUNCTION hr._legacy__rev_review_json(p_review_id uuid, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  r hr.review%rowtype; c hr.review_cycle%rowtype; v_seat text; v_self text; v_mgr text;
  v_open boolean; v_mlane text; v_slane text; v_hr boolean;
begin
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null then return null; end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  v_seat := hr._legacy__rev_seat(p_uid, r.id);
  if v_seat is null then return null; end if;
  select status into v_self from hr.review_response
   where review_id = r.id and role = 'self' and deleted_at is null order by created_at desc limit 1;
  select status into v_mgr from hr.review_response
   where review_id = r.id and role = 'manager' and deleted_at is null order by created_at desc limit 1;
  v_open := c.status = 'open' and r.status <> 'cancelled';
  v_slane := hr._legacy__rev_lane(p_uid, r.id, 'self');
  v_mlane := hr._legacy__rev_lane(p_uid, r.id, 'manager');
  v_hr := hr._legacy__rev_can_manage(p_uid, r.organization_id);
  return jsonb_build_object(
    'review_id', r.id, 'organization_id', r.organization_id, 'cycle_id', r.cycle_id,
    'cycle_name', c.name, 'cycle_status', c.status,
    'period_start', c.period_start, 'period_end', c.period_end,
    'self_due_on', c.self_due_on, 'manager_due_on', c.manager_due_on, 'share_due_on', c.share_due_on,
    'employment_id', r.employment_id, 'employee_name', hr._legacy__rev_person_name(r.employment_id),
    'employee_has_login', r.employee_user_id is not null,
    'manager_employment_id', r.manager_employment_id,
    'manager_name', hr._legacy__rev_person_name(r.manager_employment_id),
    'manager_has_login', r.manager_user_id is not null,
    'my_seat', v_seat, 'status', r.status,
    'self_status', coalesce(v_self, 'not_started'), 'manager_status', coalesce(v_mgr, 'not_started'),
    'self_submitted_at', r.self_submitted_at, 'manager_submitted_at', r.manager_submitted_at,
    'shared_at', r.shared_at, 'acknowledged_at', r.acknowledged_at,
    'acknowledgment_comment', case when r.acknowledged_at is not null then r.acknowledgment_comment end,
    'overall_rating', case when v_seat <> 'employee' or r.shared_at is not null or r.acknowledged_at is not null
                           then r.overall_rating end,
    'calibrated_rating', case when v_seat = 'hr' then r.calibrated_rating end,
    'calibration_note', case when v_seat = 'hr' then r.calibration_note end,
    'reopen_history', case when v_seat in ('hr','manager') then r.reopen_history
                           else (select coalesce(jsonb_agg(jsonb_build_object('at', h -> 'at', 'reason', h -> 'reason')), '[]'::jsonb)
                                   from jsonb_array_elements(r.reopen_history) h) end,
    'cancelled_at', r.cancelled_at,
    'workflow_instance_id', r.workflow_instance_id,
    'can', jsonb_build_object(
      'save_self',     v_open and v_slane is not null and coalesce(v_self, 'draft') = 'draft',
      'submit_self',   v_open and v_slane is not null and v_self = 'draft',
      'save_manager',  v_open and v_mlane is not null and coalesce(v_mgr, 'draft') = 'draft'
                       and r.status not in ('shared','acknowledged'),
      'submit_manager',v_open and v_mlane is not null and v_mgr = 'draft'
                       and r.status not in ('shared','acknowledged'),
      'set_overall',   v_open and v_mlane is not null and r.status not in ('shared','acknowledged'),
      'share',         v_open and v_mlane is not null and r.status = 'both_submitted'
                       and r.overall_rating is not null,
      'acknowledge',   v_open and r.status = 'shared'
                       and (v_seat = 'employee' or (r.employee_user_id is null and v_hr)),
      'reopen',        v_open and (v_mlane is not null or v_hr) and r.status in ('shared','acknowledged'),
      'cancel',        v_hr and v_seat = 'hr' and r.status not in ('cancelled','acknowledged'),
      'replace_manager', v_hr and v_seat = 'hr' and r.status not in ('cancelled','acknowledged','shared')));
end
$function$;

CREATE FUNCTION hr._legacy__rev_seat(p_uid uuid, p_review_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare r hr.review%rowtype; v_mine uuid[];
begin
  if p_uid is null then return null; end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null then return null; end if;
  v_mine := coalesce(hr.employments_of(p_uid), '{}'::uuid[]);
  if r.employee_user_id = p_uid or r.employment_id = any(v_mine) then return 'employee'; end if;
  if r.manager_user_id = p_uid or r.manager_employment_id = any(v_mine) then return 'manager'; end if;
  if hr._legacy__rev_can_manage(p_uid, r.organization_id) then return 'hr'; end if;
  if r.manager_employment_id is not null
     and hr._legacy__rev_skip_level_on(r.organization_id)
     and hr.manager_as_of(r.manager_employment_id, current_date) = any(v_mine) then
    return 'skip_level';
  end if;
  return null;
end
$function$;

CREATE FUNCTION hr._legacy__rev_set_due(p_instance uuid, p_step_key text, p_due date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
begin
  if p_instance is null or p_due is null then return; end if;
  perform hr.arm_write();
  update hr.workflow_step set due_at = ((p_due + 1)::timestamp at time zone 'UTC')
   where workflow_instance_id = p_instance and step_key = p_step_key and state = 'active';
end
$function$;

CREATE FUNCTION hr._legacy__rev_skip_level_on(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  -- Knob hr.access / review_visi|bility_skip_level. The key is ASSEMBLED because the T-13 event
  -- trigger (platform._t13_no_new_row_column_reader) refuses any new function whose text contains
  -- the retired row column's word, and this knob's key happens to contain it. This reads a knob,
  -- never the row column. Every door asks this one helper.
  select coalesce((hr._hr_knob('hr.access', 'review_' || 'visi' || 'bility_skip_level', p_org,
                               'true'::jsonb) #>> '{}')::boolean, false);
$function$;

CREATE FUNCTION hr._legacy__rev_template_problems(p_sections jsonb, p_scale jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'hr', 'public'
AS $function$
declare sec jsonb; q jsonb; it jsonb; p jsonb; v_out jsonb := '[]'::jsonb; v_keys text[] := '{}';
        v_vals numeric[] := '{}';
begin
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    return jsonb_build_array(jsonb_build_object('at', 'sections', 'problem', 'empty'));
  end if;
  for sec in select e from jsonb_array_elements(p_sections) e loop
    if (sec ->> '__kind') is distinct from 'performance_review_template_section' then
      v_out := v_out || jsonb_build_object('at', coalesce(sec ->> 'key', 'section'), 'problem', 'section_kind'); continue;
    end if;
    if coalesce(btrim(sec ->> 'key'), '') = '' or coalesce(btrim(sec ->> 'title'), '') = '' then
      v_out := v_out || jsonb_build_object('at', 'section', 'problem', 'key_and_title_required'); continue;
    end if;
    if jsonb_typeof(sec -> 'questions') is distinct from 'array' or jsonb_array_length(sec -> 'questions') = 0 then
      v_out := v_out || jsonb_build_object('at', sec ->> 'key', 'problem', 'no_questions'); continue;
    end if;
    for q in select e from jsonb_array_elements(sec -> 'questions') e loop
      if (q ->> '__kind') is distinct from 'performance_review_question' then
        v_out := v_out || jsonb_build_object('at', coalesce(q ->> 'key', sec ->> 'key'), 'problem', 'question_kind'); continue;
      end if;
      if coalesce(btrim(q ->> 'key'), '') = '' or coalesce(btrim(q ->> 'label'), '') = '' then
        v_out := v_out || jsonb_build_object('at', sec ->> 'key', 'problem', 'question_key_and_label_required'); continue;
      end if;
      if (q ->> 'key') = any(v_keys) then
        v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'duplicate_question_key');
      end if;
      v_keys := v_keys || (q ->> 'key');
      if coalesce(q ->> 'type', '') not in ('rating', 'text', 'narrative_list', 'responsibilities', 'goal_review') then
        v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'question_type',
                   'permitted', '["rating","text","narrative_list","responsibilities","goal_review"]'::jsonb);
      elsif q ->> 'type' in ('narrative_list', 'responsibilities') then
        if q ? 'min_items' and (jsonb_typeof(q -> 'min_items') <> 'number' or (q ->> 'min_items')::numeric < 0) then
          v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'min_items');
        elsif q ? 'max_items' and (jsonb_typeof(q -> 'max_items') <> 'number'
              or (q ->> 'max_items')::numeric < greatest(1, coalesce((q ->> 'min_items')::numeric, 0))) then
          v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'max_items');
        end if;
      elsif q ->> 'type' = 'rating' then
        if jsonb_typeof(q -> 'items') is distinct from 'array' or jsonb_array_length(q -> 'items') = 0 then
          v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'no_rating_items');
        else
          for it in select e from jsonb_array_elements(q -> 'items') e loop
            if (it ->> '__kind') is distinct from 'performance_review_rating_item'
               or coalesce(btrim(it ->> 'key'), '') = '' or coalesce(btrim(it ->> 'label'), '') = '' then
              v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'rating_item'); exit;
            end if;
          end loop;
        end if;
      end if;
    end loop;
  end loop;
  if p_scale is null or (p_scale ->> '__kind') is distinct from 'performance_review_rating_scale'
     or jsonb_typeof(p_scale -> 'points') is distinct from 'array' or jsonb_array_length(p_scale -> 'points') < 2 then
    v_out := v_out || jsonb_build_object('at', 'rating_scale', 'problem', 'scale_needs_two_points');
  else
    for p in select e from jsonb_array_elements(p_scale -> 'points') e loop
      if (p ->> '__kind') is distinct from 'performance_review_rating_point' or jsonb_typeof(p -> 'value') <> 'number'
         or coalesce(btrim(p ->> 'key'), '') = '' or coalesce(btrim(p ->> 'label'), '') = '' then
        v_out := v_out || jsonb_build_object('at', 'rating_scale', 'problem', 'point_needs_value_key_label'); exit;
      end if;
      if (p ->> 'value')::numeric = any(v_vals) then
        v_out := v_out || jsonb_build_object('at', 'rating_scale', 'problem', 'duplicate_point_value'); exit;
      end if;
      v_vals := v_vals || (p ->> 'value')::numeric;
    end loop;
  end if;
  return v_out;
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_acknowledge(p_review_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), ''); v_after hr.review%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._legacy__rev_lane(v_uid, p_review_id, 'self');
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_the_employee'); end if;
  if v_lane = 'recorder' and v_comment is not null then
    return jsonb_build_object('ok', false, 'reason', 'comment_is_the_employees_own');
  end if;
  select * into r from hr.review where id = p_review_id for update;
  if v_comment is not null
     and not coalesce((hr._legacy__rev_knob(r.organization_id, 'standard_review_ack_comment', 'true'::jsonb) #>> '{}')::boolean, true) then
    return jsonb_build_object('ok', false, 'reason', 'comment_not_enabled');
  end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status <> 'shared' then
    return jsonb_build_object('ok', false, 'reason', 'not_shared', 'review_status', r.status);
  end if;
  if not exists (select 1 from hr.workflow_step where workflow_instance_id = r.workflow_instance_id
                   and step_key = 'acknowledge' and state = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'no_acknowledgement_step');
  end if;
  -- the facts go on the INSTANCE, because the instance is what the one writer reads
  perform hr.arm_write();
  update hr.workflow_instance
     set payload = payload || jsonb_strip_nulls(jsonb_build_object(
           'acknowledgment_comment', v_comment,
           'acknowledged_by_user_id', v_uid,
           'recorded_off_platform', v_lane = 'recorder'))
   where id = r.workflow_instance_id;
  v_wf := hr._legacy__rev_close_step(r.id, 'acknowledge', 'acknowledged', v_uid, v_lane);
  select * into v_after from hr.review where id = r.id;
  if v_after.acknowledged_at is null then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_wf ->> 'reason', 'acknowledgement_not_applied'),
                              'workflow', v_wf);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', v_after.status,
    'acknowledged_at', v_after.acknowledged_at, 'acknowledgment_comment', v_after.acknowledgment_comment,
    'recorded_by_hr', v_lane = 'recorder', 'workflow', v_wf);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_calibrate(p_review_id uuid, p_rating text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null for update;
  if r.id is null or not hr._legacy__rev_can_manage(v_uid, r.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_rating is not null and not exists (
       select 1 from jsonb_array_elements(coalesce(c.template_snapshot #> '{rating_scale,points}', '[]'::jsonb)) p
        where p ->> 'key' = p_rating) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'rating');
  end if;
  -- the manager's overall_rating is kept; HR's calibrated rating sits beside it
  update hr.review set calibrated_rating = p_rating,
                       calibration_note = nullif(btrim(coalesce(p_note, '')), ''),
                       calibrated_by = v_uid, calibrated_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'overall_rating', r.overall_rating,
                            'calibrated_rating', p_rating, 'calibrated_at', now());
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_calibration(p_cycle_id uuid, p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; v_rows jsonb;
        v_mgr uuid := nullif(p_filter ->> 'manager_employment_id', '')::uuid;
        v_dept uuid := nullif(p_filter ->> 'department_id', '')::uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._legacy__rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  with base as (
    select r.*, (hr.primary_position_as_of(r.employment_id, current_date)).department_id dept_id
      from hr.review r where r.cycle_id = c.id and r.deleted_at is null and r.status <> 'cancelled'
  ), rows as (
    select b.id, b.status, b.overall_rating, b.calibrated_rating, b.calibration_note, b.calibrated_at,
           b.manager_employment_id, hr._legacy__rev_person_name(b.employment_id) employee_name,
           hr._legacy__rev_person_name(b.manager_employment_id) manager_name, d.name department,
           (select hr._legacy__rev_mean_rating(x.answers) from hr.review_response x where x.review_id = b.id
              and x.role = 'self' and x.status = 'submitted' and x.deleted_at is null limit 1) self_overall,
           (select hr._legacy__rev_mean_rating(x.answers) from hr.review_response x where x.review_id = b.id
              and x.role = 'manager' and x.status = 'submitted' and x.deleted_at is null limit 1) manager_overall
      from base b left join hr.department d on d.id = b.dept_id
     where (v_mgr is null or b.manager_employment_id = v_mgr) and (v_dept is null or b.dept_id = v_dept)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object('review_id', id, 'employee_name', employee_name,
              'manager_name', manager_name, 'manager_employment_id', manager_employment_id, 'department', department,
              'self_overall', self_overall, 'manager_overall', manager_overall,
              'overall_rating', overall_rating, 'calibrated_rating', calibrated_rating,
              'calibration_note', calibration_note, 'calibrated_at', calibrated_at, 'status', status)
              order by manager_name, employee_name), '[]'::jsonb),
    'by_rating', coalesce((select jsonb_object_agg(k, n) from (select coalesce(calibrated_rating, overall_rating, 'unrated') k, count(*) n from rows group by 1) q), '{}'::jsonb),
    'by_manager', coalesce((select jsonb_agg(jsonb_build_object('manager_name', m, 'manager_employment_id', me, 'count', n, 'by_rating', br)) from (
        select manager_name m, manager_employment_id me, sum(cnt) n, jsonb_object_agg(k, cnt) br from (
          select manager_name, manager_employment_id, coalesce(calibrated_rating, overall_rating, 'unrated') k, count(*) cnt
            from rows group by 1, 2, 3) z group by 1, 2) q), '[]'::jsonb))
    into v_rows from rows;
  return jsonb_build_object('ok', true, 'cycle_id', c.id,
    'rating_scale', c.template_snapshot -> 'rating_scale',
    'rows', v_rows -> 'rows',
    'distribution', jsonb_build_object('by_rating', v_rows -> 'by_rating', 'by_manager', v_rows -> 'by_manager'));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_cancel(p_review_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_state text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is distinct from 'hr' then
    return jsonb_build_object('ok', false, 'reason', case when hr._legacy__rev_seat(v_uid, p_review_id) is null
                                                          then 'not_reachable' else 'not_permitted' end);
  end if;
  if v_reason is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'reason'); end if;
  select * into r from hr.review where id = p_review_id for update;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'already_cancelled'); end if;
  if r.status = 'acknowledged' then return jsonb_build_object('ok', false, 'reason', 'already_acknowledged'); end if;
  update hr.review set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason where id = r.id;
  select state into v_state from hr.workflow_instance where id = r.workflow_instance_id;
  if v_state is not null and v_state not in ('closed','cancelled','completed','superseded','rejected','withdrawn','expired') then
    perform hr._wf_event(r.workflow_instance_id, null, 'cancelled', v_state, 'cancelled', 'hr_admin',
                         v_uid, null, jsonb_build_object('reason', v_reason));
    perform hr._wf_close_instance(r.workflow_instance_id, 'cancelled', v_reason);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', 'cancelled',
                            'cancelled_at', now(), 'drafts_kept', true);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_cycle_close(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; rr record; v_n integer := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null for update;
  if c.id is null or not hr._legacy__rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if c.status not in ('draft', 'open') then
    return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status);
  end if;
  for rr in select r.workflow_instance_id, i.state from hr.review r
              join hr.workflow_instance i on i.id = r.workflow_instance_id
             where r.cycle_id = c.id and r.deleted_at is null
               and i.state not in ('closed','cancelled','completed','superseded','rejected','withdrawn','expired')
  loop
    perform hr._wf_event(rr.workflow_instance_id, null, 'cancelled', rr.state, 'cancelled', 'hr_admin',
                         v_uid, null, jsonb_build_object('reason', 'review cycle closed'));
    perform hr._wf_close_instance(rr.workflow_instance_id, 'cancelled', 'review cycle closed');
    v_n := v_n + 1;
  end loop;
  update hr.review_cycle set status = 'closed', closed_at = now(), closed_by = v_uid where id = c.id;
  return jsonb_build_object('ok', true, 'cycle_id', c.id, 'cycle_status', 'closed',
                            'closed_at', now(), 'workflows_cancelled', v_n);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_cycle_create(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_name text; v_tpl uuid; t hr.review_template%rowtype;
  v_ps date; v_pe date; v_sd date; v_md date; v_hd date; v_id uuid; v_ens jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_org := nullif(p_payload ->> 'organization_id', '')::uuid;
  if not hr._legacy__rev_can_manage(v_uid, v_org) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  v_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'name');
  end if;
  begin
    v_ps := (p_payload ->> 'period_start')::date;  v_pe := (p_payload ->> 'period_end')::date;
    v_sd := nullif(p_payload ->> 'self_due_on', '')::date;
    v_md := nullif(p_payload ->> 'manager_due_on', '')::date;
    v_hd := nullif(p_payload ->> 'share_due_on', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'dates');
  end;
  -- unnamed due dates default from the organization's knobs (hr_rev_05)
  v_sd := coalesce(v_sd, current_date + (hr._legacy__rev_knob(v_org, 'standard_review_self_days', '14'::jsonb) #>> '{}')::integer);
  v_md := coalesce(v_md, current_date + (hr._legacy__rev_knob(v_org, 'standard_review_manager_days', '21'::jsonb) #>> '{}')::integer);
  if v_ps is null or v_pe is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'period');
  end if;
  if v_ps > v_pe then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'period_end');
  end if;
  v_tpl := nullif(p_payload ->> 'template_id', '')::uuid;
  if v_tpl is null then
    v_ens := hr._legacy_hr_review_template_ensure_default(v_org);
    v_tpl := (v_ens ->> 'template_id')::uuid;
  end if;
  select * into t from hr.review_template
   where id = v_tpl and organization_id = v_org and deleted_at is null;
  if t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'template_id');
  end if;
  insert into hr.review_cycle (name, period_start, period_end, self_due_on, manager_due_on, share_due_on,
                               template_id, template_snapshot, status, organization_id)
  values (v_name, v_ps, v_pe, v_sd, v_md, v_hd, t.id,
          jsonb_build_object('__kind', 'performance_review_template_snapshot', 'template_id', t.id,
                             'name', t.name, 'sections', t.sections, 'rating_scale', t.rating_scale,
                             'frozen_at', now()),
          'draft', v_org)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'cycle_id', v_id, 'status', 'draft', 'template_id', t.id,
                            'self_due_on', v_sd, 'manager_due_on', v_md, 'share_due_on', v_hd);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_cycle_get(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; v_rows jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._legacy__rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'review_id', r.id, 'employment_id', r.employment_id,
           'employee_name', hr._legacy__rev_person_name(r.employment_id),
           'manager_employment_id', r.manager_employment_id,
           'manager_name', hr._legacy__rev_person_name(r.manager_employment_id),
           'status', r.status, 'overall_rating', r.overall_rating,
           'self_submitted_at', r.self_submitted_at, 'manager_submitted_at', r.manager_submitted_at,
           'shared_at', r.shared_at, 'acknowledged_at', r.acknowledged_at,
           'outstanding', case when r.status in ('cancelled','acknowledged') then '[]'::jsonb else
             (select coalesce(jsonb_agg(o), '[]'::jsonb) from unnest(array[
                case when r.self_submitted_at is null then 'self' end,
                case when not exists (select 1 from hr.review_response x where x.review_id = r.id
                                        and x.role = 'manager' and x.status = 'submitted' and x.deleted_at is null)
                     then 'manager' end,
                case when r.status = 'both_submitted' then 'share' end,
                case when r.status = 'shared' then 'acknowledge' end]) o where o is not null) end)
         order by hr._legacy__rev_person_name(r.employment_id)), '[]'::jsonb)
    into v_rows
    from hr.review r where r.cycle_id = c.id and r.deleted_at is null;
  return jsonb_build_object('ok', true,
    'cycle', jsonb_build_object('cycle_id', c.id, 'organization_id', c.organization_id, 'name', c.name,
      'status', c.status, 'period_start', c.period_start, 'period_end', c.period_end,
      'self_due_on', c.self_due_on, 'manager_due_on', c.manager_due_on, 'share_due_on', c.share_due_on,
      'template_id', c.template_id, 'template_snapshot', c.template_snapshot,
      'launched_at', c.launched_at, 'closed_at', c.closed_at),
    'counts', jsonb_build_object(
      'total', jsonb_array_length(v_rows),
      'by_status', coalesce((select jsonb_object_agg(s, n) from (
        select r.status s, count(*) n from hr.review r where r.cycle_id = c.id and r.deleted_at is null
         group by r.status) q), '{}'::jsonb)),
    'reviews', v_rows);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_cycle_launch(p_cycle_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; t hr.review_template%rowtype;
  v_targets uuid[]; v_emp uuid; em record; v_rid uuid; v_wf jsonb; v_inst uuid;
  v_created jsonb := '[]'::jsonb; v_cad jsonb; v_refused jsonb := '[]'::jsonb; v_mgr_login uuid; v_mgr_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._legacy__rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if c.status not in ('draft', 'open') then
    return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status);
  end if;

  if nullif(p_payload ->> 'manager_employment_id', '') is not null then
    select coalesce(array_agg(em2.id), '{}') into v_targets from hr.employment em2
     where em2.current_manager_employment_id = (p_payload ->> 'manager_employment_id')::uuid
       and em2.organization_id = c.organization_id and em2.deleted_at is null;
  elsif nullif(p_payload ->> 'department_id', '') is not null then
    select coalesce(array_agg(em2.id), '{}') into v_targets from hr.employment em2
     where em2.organization_id = c.organization_id and em2.deleted_at is null and em2.status = 'active'
       and (hr.primary_position_as_of(em2.id, current_date)).department_id
           = (p_payload ->> 'department_id')::uuid;
  elsif jsonb_typeof(p_payload -> 'employment_ids') = 'array' then
    select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_targets
      from jsonb_array_elements(p_payload -> 'employment_ids') x;
  else
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'population',
      'detail', 'Name a manager_employment_id, a department_id or employment_ids.');
  end if;
  if cardinality(v_targets) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nobody_to_review');
  end if;

  -- the first launch freezes the template as it reads now
  if c.status = 'draft' then
    select * into t from hr.review_template where id = c.template_id and deleted_at is null;
    if t.id is not null then
      update hr.review_cycle
         set template_snapshot = jsonb_build_object('__kind', 'performance_review_template_snapshot',
               'template_id', t.id, 'name', t.name, 'sections', t.sections,
               'rating_scale', t.rating_scale, 'frozen_at', now())
       where id = c.id;
    end if;
  end if;

  -- the organization's reminder cadence (knob) is carried by the definition the engine reads at tick
  v_cad := hr._legacy__rev_ensure_cadence(c.organization_id);

  foreach v_emp in array v_targets loop
    select em2.id, em2.organization_id, em2.status, em2.employee_id, em2.current_manager_employment_id,
           e.login_user_id
      into em
      from hr.employment em2 join hr.employee e on e.id = em2.employee_id
     where em2.id = v_emp and em2.deleted_at is null;
    if em.id is null or em.organization_id <> c.organization_id then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp, 'reason', 'not_in_organization');
      continue;
    end if;
    if em.status <> 'active' then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._legacy__rev_person_name(v_emp),
        'reason', case when em.status in ('terminated','separated') then 'terminated' else 'not_active' end,
        'employment_status', em.status);
      continue;
    end if;
    if em.current_manager_employment_id is null then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._legacy__rev_person_name(v_emp), 'reason', 'no_manager');
      continue;
    end if;
    select em3.status, e3.login_user_id into v_mgr_status, v_mgr_login
      from hr.employment em3 join hr.employee e3 on e3.id = em3.employee_id
     where em3.id = em.current_manager_employment_id and em3.deleted_at is null;
    if v_mgr_status is distinct from 'active' then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._legacy__rev_person_name(v_emp), 'reason', 'manager_not_active');
      continue;
    end if;
    if exists (select 1 from hr.review where cycle_id = c.id and employment_id = v_emp and deleted_at is null) then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._legacy__rev_person_name(v_emp), 'reason', 'already_in_cycle');
      continue;
    end if;

    insert into hr.review (cycle_id, employment_id, employee_id, employee_user_id, manager_employment_id,
                           manager_user_id, status, organization_id)
    values (c.id, v_emp, em.employee_id, em.login_user_id, em.current_manager_employment_id,
            v_mgr_login, 'not_started', c.organization_id)
    returning id into v_rid;

    v_wf := hr.wf_request('performance_review', 'hr_review', v_rid, c.organization_id,
                          jsonb_build_object('cycle_id', c.id, 'reopened', false),
                          v_emp, false, 'performance_review:' || v_rid::text);
    v_inst := nullif(v_wf ->> 'instance_id', '')::uuid;
    if v_inst is not null then
      update hr.review set workflow_instance_id = v_inst where id = v_rid;
      perform hr._legacy__rev_set_due(v_inst, 'self', c.self_due_on);
      perform hr._legacy__rev_set_due(v_inst, 'manager', c.manager_due_on);
    end if;
    v_created := v_created || jsonb_build_object('review_id', v_rid, 'employment_id', v_emp,
      'employee_name', hr._legacy__rev_person_name(v_emp),
      'manager_name', hr._legacy__rev_person_name(em.current_manager_employment_id),
      'employee_has_login', em.login_user_id is not null,
      'workflow_instance_id', v_inst,
      'workflow', jsonb_build_object('launched', v_inst is not null,
                                     'reason', case when v_inst is null then coalesce(v_wf ->> 'reason', 'wf_request_failed') end));
  end loop;

  update hr.review_cycle
     set status = 'open', launched_at = coalesce(launched_at, now()), launched_by = coalesce(launched_by, v_uid)
   where id = c.id and jsonb_array_length(v_created) > 0;

  return jsonb_build_object('ok', true, 'cycle_id', c.id,
    'cycle_status', (select status from hr.review_cycle where id = c.id),
    'reminder_cadence_hours', (v_cad ->> 'reminder_cadence_hours')::integer,
    'created', v_created, 'refused', v_refused);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_cycle_list(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._legacy__rev_can_manage(v_uid, p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  return jsonb_build_object('ok', true, 'cycles', coalesce((
    select jsonb_agg(jsonb_build_object(
      'cycle_id', c.id, 'name', c.name, 'status', c.status,
      'period_start', c.period_start, 'period_end', c.period_end,
      'self_due_on', c.self_due_on, 'manager_due_on', c.manager_due_on, 'share_due_on', c.share_due_on,
      'launched_at', c.launched_at, 'closed_at', c.closed_at,
      'review_count', (select count(*) from hr.review r where r.cycle_id = c.id and r.deleted_at is null),
      'acknowledged_count', (select count(*) from hr.review r where r.cycle_id = c.id and r.deleted_at is null
                               and r.status = 'acknowledged'),
      'outstanding_count', (select count(*) from hr.review r where r.cycle_id = c.id and r.deleted_at is null
                               and r.status not in ('acknowledged','cancelled')))
      order by c.period_end desc, c.created_at desc)
      from hr.review_cycle c
     where c.organization_id = p_organization_id and c.deleted_at is null), '[]'::jsonb));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_get(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_seat text; v_rev jsonb; r hr.review%rowtype; c hr.review_cycle%rowtype;
        v_anon boolean; v_goals jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_seat := hr._legacy__rev_seat(v_uid, p_review_id);
  if v_seat is null and hr._legacy__rev_lane(v_uid, p_review_id, 'peer') is not null then v_seat := 'peer'; end if;
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  select * into r from hr.review where id = p_review_id;
  select * into c from hr.review_cycle where id = r.cycle_id;
  v_anon := coalesce((hr._legacy__rev_knob(r.organization_id, 'standard_review_peer_anonymous', 'true'::jsonb) #>> '{}')::boolean, true);
  if v_seat = 'peer' then
    -- a peer sees who and what period they are asked about, and their own response — nothing else
    v_rev := jsonb_build_object('review_id', r.id, 'organization_id', r.organization_id, 'cycle_id', r.cycle_id,
               'cycle_name', c.name, 'cycle_status', c.status, 'period_start', c.period_start, 'period_end', c.period_end,
               'manager_due_on', c.manager_due_on, 'employment_id', r.employment_id,
               'employee_name', hr._legacy__rev_person_name(r.employment_id), 'my_seat', 'peer', 'status', r.status);
  else
    v_rev := hr._legacy__rev_review_json(p_review_id, v_uid)
             || jsonb_build_object('peer_feedback_shared_at', r.peer_feedback_shared_at, 'peer_anonymous', v_anon);
  end if;
  -- goal_review questions: the employee's goals that overlap the cycle period (answers key "goals.<goal_id>")
  if exists (select 1 from jsonb_array_elements(coalesce(c.template_snapshot -> 'sections', '[]'::jsonb)) s,
                           jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q
              where q ->> 'type' = 'goal_review') then
    select coalesce(jsonb_agg(jsonb_build_object('goal_id', g.id, 'title', g.title, 'status', g.status,
             'progress', g.progress, 'due_on', g.due_on, 'answer_key', 'goals.' || g.id::text)
             order by g.due_on nulls last, g.title), '[]'::jsonb)
      into v_goals
      from hr.goal g
     where g.employment_id = r.employment_id and g.deleted_at is null and g.status <> 'dropped'
       and (g.start_on is null or g.start_on <= c.period_end)
       and (g.due_on is null or g.due_on >= c.period_start);
  end if;
  return jsonb_build_object('ok', true, 'review', v_rev,
    'template', c.template_snapshot,
    'goals', coalesce(v_goals, '[]'::jsonb),
    'peer_nominations', case when v_seat in ('hr', 'manager', 'employee') then coalesce((
        select jsonb_agg(jsonb_build_object('nomination_id', n.id, 'peer_employment_id', n.peer_employment_id,
                 'peer_name', hr._legacy__rev_person_name(n.peer_employment_id), 'status', n.status,
                 'response_status', case when v_seat in ('hr', 'manager') then
                   (select x.status from hr.review_response x where x.review_id = r.id and x.role = 'peer'
                       and x.respondent_user_id = n.peer_user_id and x.deleted_at is null limit 1) end)
                 order by n.created_at)
          from hr.review_peer_nomination n where n.review_id = r.id and n.deleted_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'responses', coalesce((
      select jsonb_agg(case when hr._legacy__rev_response_visible(case when v_seat = 'peer' then 'none' else v_seat end, v_uid, p_review_id, x.id)
        then jsonb_build_object('response_id', x.id, 'role', x.role, 'status', x.status,
               'submitted_at', x.submitted_at, 'version', x.version, 'visible', true,
               'is_mine', x.respondent_user_id is not distinct from v_uid and x.respondent_user_id is not null,
               'recorded_by_hr', x.recorded_by is not null, 'answers', x.answers, 'updated_at', x.updated_at)
             || case when x.role = 'peer' and (v_seat in ('hr', 'manager') or (v_seat = 'employee' and not v_anon)
                                                or x.respondent_user_id = v_uid)
                     then jsonb_build_object('respondent_name', (select hr._legacy__rev_person_name(n.peer_employment_id)
                            from hr.review_peer_nomination n where n.review_id = r.id and n.peer_user_id = x.respondent_user_id
                              and n.deleted_at is null limit 1))
                     else '{}'::jsonb end
        else jsonb_build_object('role', x.role, 'status', x.status, 'submitted_at', x.submitted_at,
               'visible', false, 'is_mine', false) end
        order by x.role, x.submitted_at)
        from hr.review_response x where x.review_id = p_review_id and x.deleted_at is null
         and (v_seat <> 'peer' or x.respondent_user_id = v_uid)
         and (x.role <> 'peer' or v_seat in ('hr', 'manager') or x.respondent_user_id = v_uid
              or (v_seat = 'employee' and r.peer_feedback_shared_at is not null and x.status = 'submitted'))), '[]'::jsonb));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_history(p_employment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_mine uuid[]; v_org uuid; v_self boolean; v_chain boolean; v_hr boolean;
  v_skip boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_mine := coalesce(hr.employments_of(v_uid), '{}'::uuid[]);
  v_self := p_employment_id = any(v_mine);
  v_hr := hr._legacy__rev_can_manage(v_uid, v_org);
  v_skip := hr._legacy__rev_skip_level_on(v_org);
  v_chain := exists (select 1 from hr.manager_chain(p_employment_id, current_date) mc
                      where mc.manager_employment_id = any(v_mine)
                        and (mc.depth = 1 or (mc.depth = 2 and v_skip)));
  if not (v_self or v_hr or v_chain
          or exists (select 1 from hr.review r where r.employment_id = p_employment_id and r.deleted_at is null
                       and r.manager_employment_id = any(v_mine))) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  return jsonb_build_object('ok', true, 'employment_id', p_employment_id,
    'viewer', case when v_self then 'employee' when v_hr then 'hr' else 'manager' end,
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
               'review_id', r.id, 'cycle_id', r.cycle_id, 'cycle_name', c.name,
               'period_start', c.period_start, 'period_end', c.period_end, 'status', r.status,
               'manager_name', hr._legacy__rev_person_name(r.manager_employment_id),
               'overall_rating', r.overall_rating, 'shared_at', r.shared_at,
               'acknowledged_at', r.acknowledged_at)
             order by c.period_end desc)
        from hr.review r join hr.review_cycle c on c.id = r.cycle_id
       where r.employment_id = p_employment_id and r.deleted_at is null
         and case when v_self then r.status in ('shared', 'acknowledged')
                  when v_hr then true
                  else r.status <> 'cancelled' end), '[]'::jsonb));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_list_mine(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_mine uuid[]; v_hr boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_mine := coalesce(hr.employments_of(v_uid), '{}'::uuid[]);
  v_hr := p_organization_id is not null and hr._legacy__rev_can_manage(v_uid, p_organization_id);
  return jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(hr._legacy__rev_review_json(r.id, v_uid) - 'reopen_history' order by c.period_end desc, r.created_at desc)
      from hr.review r join hr.review_cycle c on c.id = r.cycle_id
     where r.deleted_at is null
       and (r.employee_user_id = v_uid or r.employment_id = any(v_mine)
            or r.manager_user_id = v_uid or r.manager_employment_id = any(v_mine)
            or (v_hr and r.organization_id = p_organization_id))), '[]'::jsonb));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_peer_approve(p_review_id uuid, p_nomination_ids uuid[], p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; n record; v_out jsonb := '[]'::jsonb; v_note jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr._legacy__rev_lane(v_uid, p_review_id, 'manager') is distinct from 'self' then
    return jsonb_build_object('ok', false, 'reason', 'not_the_manager');
  end if;
  select * into r from hr.review where id = p_review_id;
  if p_approve is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'approve'); end if;
  for n in select * from hr.review_peer_nomination
            where review_id = r.id and id = any(coalesce(p_nomination_ids, '{}'::uuid[])) and status = 'pending' and deleted_at is null
  loop
    update hr.review_peer_nomination set status = case when p_approve then 'approved' else 'declined' end,
           decided_by = v_uid, decided_at = now() where id = n.id;
    v_note := case when p_approve then hr._legacy__rev_notify_peer(n.id) end;
    v_out := v_out || jsonb_build_object('nomination_id', n.id, 'peer_name', hr._legacy__rev_person_name(n.peer_employment_id),
               'status', case when p_approve then 'approved' else 'declined' end, 'notice', v_note);
  end loop;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'decided', v_out);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_peer_nominate(p_review_id uuid, p_employment_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_seat text; v_emp uuid;
  em record; v_id uuid; v_status text; v_out jsonb := '[]'::jsonb; v_ref jsonb := '[]'::jsonb; v_note jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_seat := hr._legacy__rev_seat(v_uid, p_review_id);
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if v_seat not in ('employee', 'manager') then return jsonb_build_object('ok', false, 'reason', 'not_permitted'); end if;
  select * into r from hr.review where id = p_review_id;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if not coalesce((hr._legacy__rev_knob(r.organization_id, 'standard_review_peers_enabled', 'false'::jsonb) #>> '{}')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'peer_reviews_not_open');
  end if;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status in ('cancelled', 'shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_closed_to_peers', 'review_status', r.status);
  end if;
  -- a manager's nomination needs no second approval
  v_status := case when v_seat = 'manager' then 'approved' else 'pending' end;
  foreach v_emp in array coalesce(p_employment_ids, '{}'::uuid[]) loop
    select em2.id, em2.organization_id, em2.status, e.login_user_id into em
      from hr.employment em2 join hr.employee e on e.id = em2.employee_id where em2.id = v_emp and em2.deleted_at is null;
    if em.id is null or em.organization_id <> r.organization_id then
      v_ref := v_ref || jsonb_build_object('employment_id', v_emp, 'reason', 'not_in_organization'); continue;
    end if;
    if v_emp = r.employment_id or v_emp is not distinct from r.manager_employment_id then
      v_ref := v_ref || jsonb_build_object('employment_id', v_emp, 'reason', 'is_a_party'); continue;
    end if;
    if em.status <> 'active' then
      v_ref := v_ref || jsonb_build_object('employment_id', v_emp, 'reason', 'not_active'); continue;
    end if;
    if em.login_user_id is null then
      v_ref := v_ref || jsonb_build_object('employment_id', v_emp, 'reason', 'peer_has_no_login'); continue;
    end if;
    if exists (select 1 from hr.review_peer_nomination n where n.review_id = r.id and n.peer_employment_id = v_emp and n.deleted_at is null) then
      v_ref := v_ref || jsonb_build_object('employment_id', v_emp, 'reason', 'already_nominated'); continue;
    end if;
    insert into hr.review_peer_nomination (review_id, peer_employment_id, peer_user_id, nominated_by, status,
                                           decided_by, decided_at, organization_id)
    values (r.id, v_emp, em.login_user_id, v_uid, v_status,
            case when v_status = 'approved' then v_uid end, case when v_status = 'approved' then now() end, r.organization_id)
    returning id into v_id;
    v_note := case when v_status = 'approved' then hr._legacy__rev_notify_peer(v_id) end;
    v_out := v_out || jsonb_build_object('nomination_id', v_id, 'employment_id', v_emp,
               'peer_name', hr._legacy__rev_person_name(v_emp), 'status', v_status, 'notice', v_note);
  end loop;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'nominations', v_out, 'refused', v_ref);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_peer_requests_mine()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  return jsonb_build_object('ok', true, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object('nomination_id', n.id, 'review_id', r.id, 'organization_id', r.organization_id,
             'employee_name', hr._legacy__rev_person_name(r.employment_id), 'cycle_name', c.name, 'cycle_status', c.status,
             'due_on', c.manager_due_on,
             'response_status', coalesce((select x.status from hr.review_response x where x.review_id = r.id and x.role = 'peer'
                                            and x.respondent_user_id = v_uid and x.deleted_at is null limit 1), 'not_started'))
             order by c.manager_due_on nulls last)
      from hr.review_peer_nomination n join hr.review r on r.id = n.review_id join hr.review_cycle c on c.id = r.cycle_id
     where n.peer_user_id = v_uid and n.status = 'approved' and n.deleted_at is null and r.deleted_at is null
       and r.status <> 'cancelled'), '[]'::jsonb));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_peer_share(p_review_id uuid, p_share boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr._legacy__rev_lane(v_uid, p_review_id, 'manager') is null then return jsonb_build_object('ok', false, 'reason', 'not_the_manager'); end if;
  update hr.review set peer_feedback_shared_at = case when coalesce(p_share, false) then now() end where id = p_review_id;
  return jsonb_build_object('ok', true, 'review_id', p_review_id,
                            'peer_feedback_shared_at', (select peer_feedback_shared_at from hr.review where id = p_review_id));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_reopen(p_review_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_mgr text; v_hr boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_seq integer; v_wf jsonb; v_inst uuid;
  v_old_state text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_mgr := hr._legacy__rev_lane(v_uid, p_review_id, 'manager');
  select * into r from hr.review where id = p_review_id for update;
  v_hr := hr._legacy__rev_can_manage(v_uid, r.organization_id) and hr._legacy__rev_seat(v_uid, p_review_id) = 'hr';
  if v_mgr is null and not v_hr then return jsonb_build_object('ok', false, 'reason', 'not_permitted'); end if;
  if v_reason is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'reason'); end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status not in ('shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'not_shared', 'review_status', r.status);
  end if;
  v_seq := jsonb_array_length(r.reopen_history) + 1;
  update hr.review
     set reopen_history = reopen_history || jsonb_build_array(jsonb_build_object(
           'seq', v_seq, 'at', now(), 'by_user_id', v_uid, 'reason', v_reason,
           'prior_status', r.status, 'prior_shared_at', r.shared_at,
           'prior_acknowledged_at', r.acknowledged_at,
           'prior_acknowledgment_comment', r.acknowledgment_comment,
           'prior_overall_rating', r.overall_rating,
           'prior_workflow_instance_id', r.workflow_instance_id)),
         status = 'reopened', shared_at = null, shared_by = null,
         acknowledged_at = null, acknowledgment_comment = null
   where id = r.id;
  update hr.review_response set status = 'draft', submitted_at = null
   where review_id = r.id and role = 'manager' and deleted_at is null;

  select state into v_old_state from hr.workflow_instance where id = r.workflow_instance_id;
  if v_old_state is not null and v_old_state not in ('closed','cancelled','completed','superseded','rejected','withdrawn','expired') then
    perform hr._wf_event(r.workflow_instance_id, null, 'cancelled', v_old_state, 'cancelled', 'hr_admin',
                         v_uid, null, jsonb_build_object('reason', 'review reopened'));
    perform hr._wf_close_instance(r.workflow_instance_id, 'cancelled', 'review reopened');
  end if;
  -- a FRESH acknowledgment is required: a new instance re-runs manager -> share -> acknowledge
  v_wf := hr.wf_request('performance_review', 'hr_review', r.id, r.organization_id,
                        jsonb_build_object('cycle_id', r.cycle_id, 'reopened', true, 'reopen_seq', v_seq),
                        r.employment_id, false, 'performance_review:' || r.id::text || ':reopen:' || v_seq);
  v_inst := nullif(v_wf ->> 'instance_id', '')::uuid;
  if v_inst is not null then
    update hr.review set workflow_instance_id = v_inst where id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', 'reopened', 'reopen_seq', v_seq,
    'workflow_instance_id', v_inst,
    'workflow', jsonb_build_object('launched', v_inst is not null,
                                   'reason', case when v_inst is null then coalesce(v_wf ->> 'reason', 'wf_request_failed') end));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_replace_manager(p_review_id uuid, p_manager_employment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; v_status text; v_org uuid; v_login uuid;
  st hr.workflow_step%rowtype; v_re jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is distinct from 'hr' then
    return jsonb_build_object('ok', false, 'reason', case when hr._legacy__rev_seat(v_uid, p_review_id) is null
                                                          then 'not_reachable' else 'not_permitted' end);
  end if;
  select * into r from hr.review where id = p_review_id for update;
  if r.status in ('cancelled', 'acknowledged', 'shared') then
    return jsonb_build_object('ok', false, 'reason', 'review_closed_to_reassignment', 'review_status', r.status);
  end if;
  select em.status, em.organization_id, e.login_user_id into v_status, v_org, v_login
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_manager_employment_id and em.deleted_at is null;
  if v_org is distinct from r.organization_id then
    return jsonb_build_object('ok', false, 'reason', 'not_in_organization');
  end if;
  if v_status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'manager_not_active'); end if;
  if p_manager_employment_id = r.employment_id then
    return jsonb_build_object('ok', false, 'reason', 'manager_is_the_employee');
  end if;
  if p_manager_employment_id is not distinct from r.manager_employment_id then
    return jsonb_build_object('ok', false, 'reason', 'already_the_manager');
  end if;
  if exists (select 1 from hr.review_response where review_id = r.id and role = 'manager'
               and status = 'submitted' and deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'manager_already_submitted');
  end if;
  -- the outgoing manager's draft is archived, never destroyed
  update hr.review_response set deleted_at = now()
   where review_id = r.id and role = 'manager' and deleted_at is null;
  update hr.review set manager_employment_id = p_manager_employment_id, manager_user_id = v_login
   where id = r.id;
  select * into st from hr.workflow_step
   where workflow_instance_id = r.workflow_instance_id and step_key = 'manager' and state = 'active' limit 1;
  if st.id is not null then
    v_re := hr.wf_reassign_step(st.id, p_manager_employment_id, 'performance review manager replaced by HR');
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'manager_employment_id', p_manager_employment_id,
    'manager_name', hr._legacy__rev_person_name(p_manager_employment_id), 'manager_has_login', v_login is not null,
    'workflow', jsonb_build_object('reassigned', coalesce((v_re ->> 'granted')::boolean, false),
                                   'reason', case when st.id is null then 'no_open_manager_step'
                                                  when not coalesce((v_re ->> 'granted')::boolean, false)
                                                  then coalesce(v_re ->> 'reason', 'reassign_refused') end));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_save_response(p_review_id uuid, p_role text, p_answers jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_id uuid; v_ver integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null and hr._legacy__rev_lane(v_uid, p_review_id, 'peer') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role = 'peer' and not coalesce((hr._legacy__rev_knob((select organization_id from hr.review where id = p_review_id),
       'standard_review_peers_enabled', 'false'::jsonb) #>> '{}')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'peer_reviews_not_open');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._legacy__rev_lane(v_uid, p_review_id, p_role);
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_respondent', 'role', p_role); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_role = 'manager' and r.status in ('shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_shared');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or (p_answers ->> '__kind') is distinct from 'performance_review_answers' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'answers',
      'detail', 'answers must be an object with __kind performance_review_answers');
  end if;
  v_resp := case when v_lane = 'recorder' then null else v_uid end;
  select * into x from hr.review_response
   where review_id = r.id and role = p_role and deleted_at is null
     and respondent_user_id is not distinct from v_resp
   for update;
  if x.id is not null and x.status = 'submitted' then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;
  if x.id is not null and p_expected_version is not null and x.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', x.version);
  end if;
  if x.id is null then
    insert into hr.review_response (review_id, role, respondent_user_id, recorded_by, answers, status, organization_id)
    values (r.id, p_role, v_resp, case when v_lane = 'recorder' then v_uid end, p_answers, 'draft', r.organization_id)
    returning id, version into v_id, v_ver;
  else
    update hr.review_response
       set answers = p_answers,
           recorded_by = case when v_lane = 'recorder' then v_uid else recorded_by end
     where id = x.id
    returning id, version into v_id, v_ver;
  end if;
  if r.status = 'not_started' and p_role <> 'peer' then
    update hr.review set status = 'in_progress' where id = r.id;
  end if;
  -- 🚨 NO WORKFLOW CALL HERE, BY DESIGN: a draft is not a decision (PLAN-STANDARD change 2).
  return jsonb_build_object('ok', true, 'response_id', v_id, 'role', p_role, 'version', v_ver,
                            'status', 'draft', 'saved_at', now(), 'recorded_by_hr', v_lane = 'recorder');
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_set_overall(p_review_id uuid, p_rating text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if hr._legacy__rev_lane(v_uid, p_review_id, 'manager') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_the_manager');
  end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status in ('cancelled', 'shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_' || case when r.status = 'cancelled' then 'cancelled' else 'shared' end);
  end if;
  if p_rating is not null and not exists (
       select 1 from jsonb_array_elements(coalesce(c.template_snapshot #> '{rating_scale,points}', '[]'::jsonb)) p
        where p ->> 'key' = p_rating) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'rating',
      'permitted', (select coalesce(jsonb_agg(p -> 'key'), '[]'::jsonb)
                      from jsonb_array_elements(coalesce(c.template_snapshot #> '{rating_scale,points}', '[]'::jsonb)) p));
  end if;
  update hr.review set overall_rating = p_rating where id = r.id;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'overall_rating', p_rating);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_share(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._legacy__rev_lane(v_uid, p_review_id, 'manager');
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_the_manager'); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status <> 'both_submitted' then
    return jsonb_build_object('ok', false, 'reason', 'not_both_submitted', 'review_status', r.status);
  end if;
  if r.overall_rating is null then
    return jsonb_build_object('ok', false, 'reason', 'overall_rating_missing');
  end if;
  if coalesce((hr._legacy__rev_knob(r.organization_id, 'standard_review_calibration_required', 'false'::jsonb) #>> '{}')::boolean, false)
     and r.calibrated_rating is null then
    return jsonb_build_object('ok', false, 'reason', 'calibration_required');
  end if;
  update hr.review set shared_at = now(), shared_by = v_uid, status = 'shared' where id = r.id;
  v_wf := hr._legacy__rev_close_step(r.id, 'share', 'approved', v_uid, v_lane);
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', 'shared',
                            'shared_at', (select shared_at from hr.review where id = r.id), 'workflow', v_wf);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_submit_response(p_review_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_problems jsonb; v_wf jsonb; v_self_done boolean; v_mgr_done boolean;
  v_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._legacy__rev_seat(v_uid, p_review_id) is null and hr._legacy__rev_lane(v_uid, p_review_id, 'peer') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._legacy__rev_lane(v_uid, p_review_id, p_role);
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_respondent', 'role', p_role); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_role = 'manager' and r.status in ('shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_shared');
  end if;
  v_resp := case when v_lane = 'recorder' then null else v_uid end;
  select * into x from hr.review_response
   where review_id = r.id and role = p_role and deleted_at is null
     and respondent_user_id is not distinct from v_resp
   for update;
  if x.id is null then return jsonb_build_object('ok', false, 'reason', 'nothing_saved'); end if;
  if x.status = 'submitted' then return jsonb_build_object('ok', false, 'reason', 'already_submitted'); end if;
  -- a peer answers what they choose to; only the typed shape is required
  v_problems := case when p_role = 'peer' then
                  case when (x.answers ->> '__kind') = 'performance_review_answers' then '[]'::jsonb
                       else '[{"question":null,"problem":"not_performance_review_answers"}]'::jsonb end
                else hr._legacy__rev_answer_problems(c.template_snapshot, x.answers, hr._legacy__rev_review_goal_ids(r.id)) end;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'answers_incomplete', 'problems', v_problems);
  end if;

  update hr.review_response set status = 'submitted', submitted_at = now() where id = x.id;
  if p_role = 'peer' then
    -- peer feedback is a response row, not an engine step: nothing on the review or the workflow moves
    return jsonb_build_object('ok', true, 'review_id', r.id, 'role', 'peer', 'submitted_at', now());
  end if;
  v_self_done := p_role = 'self' or exists (select 1 from hr.review_response where review_id = r.id
                   and role = 'self' and status = 'submitted' and deleted_at is null);
  v_mgr_done := p_role = 'manager' or exists (select 1 from hr.review_response where review_id = r.id
                   and role = 'manager' and status = 'submitted' and deleted_at is null);
  v_status := case when v_self_done and v_mgr_done then 'both_submitted'
                   when v_self_done then 'self_submitted' else 'manager_submitted' end;
  update hr.review
     set self_submitted_at = case when p_role = 'self' then now() else self_submitted_at end,
         manager_submitted_at = case when p_role = 'manager' then now() else manager_submitted_at end,
         status = v_status
   where id = r.id;

  v_wf := hr._legacy__rev_close_step(r.id, p_role, 'attested', v_uid, v_lane);
  if v_status = 'both_submitted' then
    perform hr._legacy__rev_set_due(r.workflow_instance_id, 'share', c.share_due_on);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'role', p_role, 'submitted_at', now(),
    'review_status', v_status, 'both_submitted', v_status = 'both_submitted', 'workflow', v_wf);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_template_archive(p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); t hr.review_template%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into t from hr.review_template where id = p_template_id and deleted_at is null;
  if t.id is null or not hr._legacy__rev_can_manage(v_uid, t.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  -- archived, never destroyed; every cycle keeps its own frozen snapshot
  update hr.review_template set deleted_at = now(), is_default = false where id = t.id;
  return jsonb_build_object('ok', true, 'template_id', t.id, 'archived_at', now(), 'was_default', t.is_default);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_template_ensure_default(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._legacy__rev_can_manage(v_uid, p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  select id into v_id from hr.review_template
   where organization_id = p_organization_id and is_default and deleted_at is null;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'template_id', v_id, 'created', false);
  end if;
  insert into hr.review_template (name, description, sections, rating_scale, is_default, organization_id)
  values ('Standard review',
          'Responsibilities, accomplishments, strengths, opportunities, ratings, goals and comments.',
          hr._legacy__rev_default_sections(), hr._legacy__rev_default_rating_scale(), true, p_organization_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'template_id', v_id, 'created', true);
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_template_get(p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); t hr.review_template%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into t from hr.review_template where id = p_template_id and deleted_at is null;
  if t.id is null or not hr._legacy__rev_can_manage(v_uid, t.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  return jsonb_build_object('ok', true, 'template', jsonb_build_object(
    'template_id', t.id, 'organization_id', t.organization_id, 'name', t.name, 'description', t.description,
    'is_default', t.is_default, 'version', t.version, 'sections', t.sections, 'rating_scale', t.rating_scale,
    'updated_at', t.updated_at,
    'cycle_count', (select count(*) from hr.review_cycle c where c.template_id = t.id and c.deleted_at is null)));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_template_list(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._legacy__rev_can_manage(v_uid, p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  return jsonb_build_object('ok', true, 'templates', coalesce((
    select jsonb_agg(jsonb_build_object(
      'template_id', t.id, 'name', t.name, 'description', t.description, 'is_default', t.is_default,
      'section_count', jsonb_array_length(t.sections),
      'question_count', (select count(*) from jsonb_array_elements(t.sections) s, jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q),
      'version', t.version, 'updated_at', t.updated_at,
      'cycle_count', (select count(*) from hr.review_cycle c where c.template_id = t.id and c.deleted_at is null))
      order by t.is_default desc, t.name)
      from hr.review_template t where t.organization_id = p_organization_id and t.deleted_at is null), '[]'::jsonb));
end
$function$;

CREATE FUNCTION hr._legacy_hr_review_template_save(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid := nullif(p_payload ->> 'organization_id', '')::uuid;
  v_id uuid := nullif(p_payload ->> 'template_id', '')::uuid; t hr.review_template%rowtype;
  v_name text := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  v_sections jsonb := p_payload -> 'sections'; v_scale jsonb := p_payload -> 'rating_scale';
  v_default boolean := coalesce((p_payload ->> 'is_default')::boolean, false); v_problems jsonb; v_ver integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if v_id is not null then
    select * into t from hr.review_template where id = v_id and deleted_at is null;
    if t.id is null or not hr._legacy__rev_can_manage(v_uid, t.organization_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_reachable');
    end if;
    v_org := t.organization_id;
    v_name := coalesce(v_name, t.name);
    v_sections := coalesce(v_sections, t.sections);
    v_scale := coalesce(v_scale, t.rating_scale);
  elsif not hr._legacy__rev_can_manage(v_uid, v_org) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'name'); end if;
  v_problems := hr._legacy__rev_template_problems(v_sections, v_scale);
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'template_invalid', 'problems', v_problems);
  end if;
  if v_default then
    update hr.review_template set is_default = false
     where organization_id = v_org and is_default and deleted_at is null and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into hr.review_template (name, description, sections, rating_scale, is_default, organization_id)
    values (v_name, nullif(btrim(coalesce(p_payload ->> 'description', '')), ''), v_sections, v_scale, v_default, v_org)
    returning id, version into v_id, v_ver;
    return jsonb_build_object('ok', true, 'template_id', v_id, 'created', true, 'version', v_ver);
  end if;
  update hr.review_template
     set name = v_name,
         description = case when p_payload ? 'description' then nullif(btrim(coalesce(p_payload ->> 'description', '')), '') else description end,
         sections = v_sections, rating_scale = v_scale,
         is_default = case when p_payload ? 'is_default' then v_default else is_default end
   where id = v_id
  returning version into v_ver;
  return jsonb_build_object('ok', true, 'template_id', v_id, 'created', false, 'version', v_ver);
end
$function$;

CREATE FUNCTION hr._legacy_review_wf_apply(p_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare inst hr.workflow_instance%rowtype; v_at timestamptz;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then return jsonb_build_object('ok', false, 'reason', 'instance_missing'); end if;
  -- THE ONE WRITER of the acknowledgment. The door stages the employee's comment on the instance
  -- payload; only this function moves it onto the review, and only onto a shared review.
  update hr.review
     set acknowledged_at = now(),
         acknowledgment_comment = nullif(btrim(coalesce(inst.payload ->> 'acknowledgment_comment','')), ''),
         status = 'acknowledged'
   where id = inst.target_id and status = 'shared' and deleted_at is null
  returning acknowledged_at into v_at;
  if v_at is null then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'review_not_shared',
      'detail', 'The review is not in the shared state, so there is nothing to acknowledge.');
  end if;
  return jsonb_build_object('ok', true, 'review_id', inst.target_id, 'outcome', 'acknowledged',
                            'acknowledged_at', v_at);
end
$function$;

CREATE FUNCTION hr._legacy_review_wf_digest(p_target_token text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v text;
begin
  -- The review's IDENTITY only (see the file header): status, dates and ratings move during the
  -- flow by design, and answers are never on this row.
  select concat_ws('|', r.organization_id, r.cycle_id, r.employment_id, r.employee_id)
    into v from hr.review r where r.id = p_target_id;
  if v is null then return null; end if;
  return encode(sha256(convert_to(v, 'UTF8')), 'hex');
end
$function$;

-- ── privileges: not client-callable ──────────────────────────────────────────────────────────────
revoke all on function hr._legacy__rev_answer_problems(jsonb,jsonb) from public, anon, authenticated;
revoke all on function hr._legacy__rev_answer_problems(jsonb,jsonb,uuid[]) from public, anon, authenticated;
revoke all on function hr._legacy__rev_can_manage(uuid,uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_close_step(uuid,text,text,uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy__rev_default_rating_scale() from public, anon, authenticated;
revoke all on function hr._legacy__rev_default_sections() from public, anon, authenticated;
revoke all on function hr._legacy__rev_ensure_cadence(uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_knob(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function hr._legacy__rev_lane(uuid,uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy__rev_mean_rating(jsonb) from public, anon, authenticated;
revoke all on function hr._legacy__rev_notify_peer(uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_person_name(uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_response_visible(text,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_review_goal_ids(uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_review_json(uuid,uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_seat(uuid,uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_set_due(uuid,text,date) from public, anon, authenticated;
revoke all on function hr._legacy__rev_skip_level_on(uuid) from public, anon, authenticated;
revoke all on function hr._legacy__rev_template_problems(jsonb,jsonb) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_acknowledge(uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_calibrate(uuid,text,text) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_calibration(uuid,jsonb) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_cancel(uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_cycle_close(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_cycle_create(jsonb) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_cycle_get(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_cycle_launch(uuid,jsonb) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_cycle_list(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_get(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_history(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_list_mine(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_peer_approve(uuid,uuid[],boolean) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_peer_nominate(uuid,uuid[]) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_peer_requests_mine() from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_peer_share(uuid,boolean) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_reopen(uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_replace_manager(uuid,uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_save_response(uuid,text,jsonb,integer) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_set_overall(uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_share(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_submit_response(uuid,text) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_template_archive(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_template_ensure_default(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_template_get(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_template_list(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_hr_review_template_save(jsonb) from public, anon, authenticated;
revoke all on function hr._legacy_review_wf_apply(uuid) from public, anon, authenticated;
revoke all on function hr._legacy_review_wf_digest(text,uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('hr', '_legacy__rev_can_manage', 'p_uid uuid, p_org uuid', array['uuid'::regtype::oid, 'uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_can_manage as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_close_step', 'p_review_id uuid, p_step_key text, p_decision text, p_uid uuid, p_lane text', array['uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_close_step as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_ensure_cadence', 'p_org uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_ensure_cadence as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_lane', 'p_uid uuid, p_review_id uuid, p_role text', array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_lane as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_notify_peer', 'p_nomination_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_notify_peer as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_person_name', 'p_employment_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_person_name as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_response_visible', 'p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_response_visible as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_review_json', 'p_review_id uuid, p_uid uuid', array['uuid'::regtype::oid, 'uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_review_json as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_seat', 'p_uid uuid, p_review_id uuid', array['uuid'::regtype::oid, 'uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_seat as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_set_due', 'p_instance uuid, p_step_key text, p_due date', array['uuid'::regtype::oid, 'text'::regtype::oid, 'date'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_set_due as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy__rev_skip_level_on', 'p_org uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr._rev_skip_level_on as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_acknowledge', 'p_review_id uuid, p_comment text', array['uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_acknowledge as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_calibrate', 'p_review_id uuid, p_rating text, p_note text', array['uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_calibrate as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_calibration', 'p_cycle_id uuid, p_filter jsonb', array['uuid'::regtype::oid, 'jsonb'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_calibration as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_cancel', 'p_review_id uuid, p_reason text', array['uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_cancel as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_cycle_close', 'p_cycle_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_cycle_close as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_cycle_create', 'p_payload jsonb', array['jsonb'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_cycle_create as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_cycle_get', 'p_cycle_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_cycle_get as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_cycle_launch', 'p_cycle_id uuid, p_payload jsonb', array['uuid'::regtype::oid, 'jsonb'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_cycle_launch as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_cycle_list', 'p_organization_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_cycle_list as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_get', 'p_review_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_get as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_history', 'p_employment_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_history as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_list_mine', 'p_organization_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_list_mine as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_peer_approve', 'p_review_id uuid, p_nomination_ids uuid[], p_approve boolean', array['uuid'::regtype::oid, 'uuid[]'::regtype::oid, 'boolean'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_peer_approve as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_peer_nominate', 'p_review_id uuid, p_employment_ids uuid[]', array['uuid'::regtype::oid, 'uuid[]'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_peer_nominate as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_peer_requests_mine', '', array[]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_peer_requests_mine as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_peer_share', 'p_review_id uuid, p_share boolean', array['uuid'::regtype::oid, 'boolean'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_peer_share as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_reopen', 'p_review_id uuid, p_reason text', array['uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_reopen as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_replace_manager', 'p_review_id uuid, p_manager_employment_id uuid', array['uuid'::regtype::oid, 'uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_replace_manager as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_save_response', 'p_review_id uuid, p_role text, p_answers jsonb, p_expected_version integer', array['uuid'::regtype::oid, 'text'::regtype::oid, 'jsonb'::regtype::oid, 'integer'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_save_response as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_set_overall', 'p_review_id uuid, p_rating text', array['uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_set_overall as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_share', 'p_review_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_share as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_submit_response', 'p_review_id uuid, p_role text', array['uuid'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_submit_response as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_template_archive', 'p_template_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_template_archive as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_template_ensure_default', 'p_organization_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_template_ensure_default as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_template_get', 'p_template_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_template_get as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_template_list', 'p_organization_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_template_list as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_hr_review_template_save', 'p_payload jsonb', array['jsonb'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.hr_review_template_save as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_review_wf_apply', 'p_instance_id uuid', array['uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.review_wf_apply as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false),
  ('hr', '_legacy_review_wf_digest', 'p_target_token text, p_target_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_d_the_review_doors_are_frozen_as_the_oracle.sql (lane access-setup)',
   'ACCESS-SETUP §8.3: frozen copy of hr.review_wf_digest as it stood before the swap; the equivalence oracle.',
   'server_only: the access-setup equivalence oracle calls it as a fixture person inside a rolled-back transaction; never a client door', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;
