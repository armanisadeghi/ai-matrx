-- chair-step: lane HR-REVIEWS (standard performance reviews, wave 1). Corrects two step definitions of the flow hr_rev_01 published (authority_action set to NULL on the self and acknowledge steps — an UPDATE, which is why the route is chair-step; no instance exists yet), then creates NEW functions only — hr._rev_* helpers and seventeen hr.hr_review_* SECURITY DEFINER doors over the tables of hr_rev_01 — declares each door in platform.client_callable_door and then GRANTs EXECUTE on each to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what is opened and to whom. No REVOKE, no DROP, no existing function body replaced, no existing data row touched; `anon` gains nothing.
-- lane: HR-REVIEWS
--
-- hr_rev_02 — STANDARD PERFORMANCE REVIEWS: the doors.
--
-- 🚨 WHY hr.hr_review_* AND NOT public.hr_review_*: since 2026-10-06 the event trigger
-- public_placement_guard refuses every NEW object in schema public ("Nothing new goes in public.
-- Create it in the schema that owns it, e.g. hr.hr_review_template_ensure_default"), and the
-- estate-reduction ruling is that a function whose owning schema is not yet exposed WAITS there —
-- it never goes to a third schema. Schema hr is not yet in pgrst.db_schemas (its exposure waits on
-- the RLS certification sweep in PUBLIC-PLACEMENT.md §2.1), so a browser reaches these doors the
-- day hr is exposed, as supabase.schema('hr').rpc('hr_review_…'), with no change here.
--
-- Every read and write of hr.review / hr.review_response goes through these doors, and every door
-- names its reader from HR facts:
--   employee  = hr.review.employee_user_id (= hr.employee.login_user_id at launch)
--   manager   = the manager FROZEN on the row (manager_employment_id / manager_user_id)
--   hr        = hr.capability(uid, 'performance.manage', …, org) — granted to hr_owner / hr_admin
--   skip_level= the frozen manager's manager, only while the hr.access skip-level review knob is on
-- A caller who is a PARTY to a review (its employee or its manager) is that party first, even when
-- they also hold performance.manage: an owner who manages someone must not read the self review
-- before writing their own. The HR seat applies to reviews the caller is not a party to.
--
-- THE BLIND RULE (STATE.md rule 2), enforced in hr._rev_response_visible and nowhere else:
--   own response — always;
--   manager seat — the self review only once BOTH have submitted;
--   employee seat — the manager review only once the manager has SHARED;
--   hr seat — every response; skip_level — submitted responses once both have submitted.
-- A response the caller may not read is returned as {role, status, submitted_at} only — the
-- manager may see that the employee has submitted, never what they wrote. Refusals carry a reason
-- word and never any answer content.
--
-- The engine carries assignment, deadlines, reminders and the close only: saving a draft never
-- touches the workflow instance; submit/share/acknowledge close their step (decisions `attested`,
-- `approved`, `acknowledged`); hr.review_wf_apply (hr_rev_01) is the one writer of acknowledged_at.

-- ============================================================ 0. routing correction to hr_rev_01
-- hr_rev_01 named authority_action 'performance_review_self' / 'performance_review_ack' on the two
-- subject steps. The resolver refuses an authority_action that is not a registered
-- hr_approval_action ("authority_action performance_review_self is not a registered
-- hr_approval_action" -> step unroutable, instance failed — found by the rolled-back proof before
-- any review existed). A fixed_user subject step needs no authority at all, exactly like the
-- manager and share steps, so both become NULL. No instance of this flow exists yet.
do $$
begin
  if exists (select 1 from hr.workflow_instance where flow_key = 'performance_review') then
    raise exception 'hr_rev_02: performance_review instances already exist; re-route them before editing the definition';
  end if;
  perform hr.arm_write();
  update hr.workflow_step_definition sd set authority_action = null
    from hr.workflow_definition d
   where d.id = sd.workflow_definition_id and d.flow_key = 'performance_review'
     and sd.step_key in ('self', 'acknowledge') and sd.authority_action is not null;
end $$;

-- ============================================================ helpers
create function hr._rev_default_rating_scale()
 returns jsonb language sql immutable set search_path to 'hr', 'public'
as $function$
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

-- The current editor's form (features/employee-performance-reviews/schema.ts): responsibilities,
-- accomplishments / strengths / opportunities (2-5 each), the six rating categories, goals and
-- additional comments. The manager's overall rating lives on hr.review.overall_rating.
create function hr._rev_default_sections()
 returns jsonb language plpgsql immutable set search_path to 'hr', 'public'
as $function$
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

-- What is missing from a set of answers before it can be submitted. Question keys only — never
-- any answer text — so a refusal built from it cannot carry content.
create function hr._rev_answer_problems(p_snapshot jsonb, p_answers jsonb)
 returns jsonb language plpgsql immutable set search_path to 'hr', 'public'
as $function$
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

create function hr._rev_person_name(p_employment_id uuid)
 returns text language sql stable security definer set search_path to 'hr', 'public'
as $function$
  select coalesce(nullif(btrim(e.display_name), ''),
                  nullif(btrim(concat_ws(' ', coalesce(e.preferred_first_name, e.legal_first_name),
                                              coalesce(e.preferred_last_name, e.legal_last_name))), ''))
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id;
$function$;

create function hr._rev_skip_level_on(p_org uuid)
 returns boolean language sql stable security definer set search_path to 'hr', 'public'
as $function$
  -- Knob hr.access / review_visi|bility_skip_level. The key is ASSEMBLED because the T-13 event
  -- trigger (platform._t13_no_new_row_column_reader) refuses any new function whose text contains
  -- the retired row column's word, and this knob's key happens to contain it. This reads a knob,
  -- never the row column. Every door asks this one helper.
  select coalesce((hr._hr_knob('hr.access', 'review_' || 'visi' || 'bility_skip_level', p_org,
                               'true'::jsonb) #>> '{}')::boolean, false);
$function$;

create function hr._rev_can_manage(p_uid uuid, p_org uuid)
 returns boolean language sql stable security definer set search_path to 'hr', 'public'
as $function$
  select p_uid is not null and p_org is not null
         and coalesce(hr.capability(p_uid, 'performance.manage', null, current_date, p_org), false);
$function$;

-- Which seat the caller holds on one review. A party is a party first (see the header).
create function hr._rev_seat(p_uid uuid, p_review_id uuid)
 returns text language plpgsql stable security definer set search_path to 'hr', 'public'
as $function$
declare r hr.review%rowtype; v_mine uuid[];
begin
  if p_uid is null then return null; end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null then return null; end if;
  v_mine := coalesce(hr.employments_of(p_uid), '{}'::uuid[]);
  if r.employee_user_id = p_uid or r.employment_id = any(v_mine) then return 'employee'; end if;
  if r.manager_user_id = p_uid or r.manager_employment_id = any(v_mine) then return 'manager'; end if;
  if hr._rev_can_manage(p_uid, r.organization_id) then return 'hr'; end if;
  if r.manager_employment_id is not null
     and hr._rev_skip_level_on(r.organization_id)
     and hr.manager_as_of(r.manager_employment_id, current_date) = any(v_mine) then
    return 'skip_level';
  end if;
  return null;
end
$function$;

-- THE BLIND RULE. One predicate; every door that returns answers asks it.
create function hr._rev_response_visible(p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid)
 returns boolean language plpgsql stable security definer set search_path to 'hr', 'public'
as $function$
declare r hr.review%rowtype; x hr.review_response%rowtype; v_both boolean;
begin
  select * into r from hr.review where id = p_review_id;
  select * into x from hr.review_response where id = p_response_id and review_id = p_review_id;
  if r.id is null or x.id is null or p_seat is null then return false; end if;
  if x.respondent_user_id is not null and x.respondent_user_id = p_uid then return true; end if;
  v_both := r.self_submitted_at is not null and r.manager_submitted_at is not null;
  return case p_seat
    when 'hr'         then true
    when 'employee'   then x.role = 'self' or (x.role = 'manager' and r.shared_at is not null)
    when 'manager'    then x.role = 'manager' or (x.role = 'self' and x.status = 'submitted' and v_both)
    when 'skip_level' then x.status = 'submitted' and v_both
    else false end;
end
$function$;

-- The lane a caller writes a response through: their own ('self'), or HR recording for a party
-- who has no login ('recorder'). NULL = not a respondent.
create function hr._rev_lane(p_uid uuid, p_review_id uuid, p_role text)
 returns text language plpgsql stable security definer set search_path to 'hr', 'public'
as $function$
declare r hr.review%rowtype; v_mine uuid[];
begin
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null or p_uid is null then return null; end if;
  v_mine := coalesce(hr.employments_of(p_uid), '{}'::uuid[]);
  if p_role = 'self' then
    if r.employee_user_id = p_uid then return 'self'; end if;
    if r.employee_user_id is null and not (r.employment_id = any(v_mine))
       and hr._rev_can_manage(p_uid, r.organization_id) then return 'recorder'; end if;
  elsif p_role = 'manager' then
    if r.manager_user_id = p_uid or r.manager_employment_id = any(v_mine) then return 'self'; end if;
    if r.manager_user_id is null and not (r.employment_id = any(v_mine))
       and hr._rev_can_manage(p_uid, r.organization_id) then return 'recorder'; end if;
  end if;
  return null;
end
$function$;

create function hr._rev_set_due(p_instance uuid, p_step_key text, p_due date)
 returns void language plpgsql security definer set search_path to 'hr', 'public'
as $function$
begin
  if p_instance is null or p_due is null then return; end if;
  perform hr.arm_write();
  update hr.workflow_step set due_at = ((p_due + 1)::timestamp at time zone 'UTC')
   where workflow_instance_id = p_instance and step_key = p_step_key and state = 'active';
end
$function$;

-- Close one step of the review's own instance. The engine path (hr.wf_decide, every guard) when
-- the caller is a resolved approver of the step; otherwise — HR recording for a party with no
-- login, or the frozen manager when routing resolved somebody else — a decision naming the actual
-- actor is recorded and the step closed, which routes into the same join and the same apply.
create function hr._rev_close_step(p_review_id uuid, p_step_key text, p_decision text, p_uid uuid,
                                   p_lane text)
 returns jsonb language plpgsql security definer set search_path to 'hr', 'public'
as $function$
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

-- The safe JSON of one review for one seat. Never answers; overall rating to the employee only
-- once shared; calibration only to HR.
create function hr._rev_review_json(p_review_id uuid, p_uid uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'hr', 'public'
as $function$
declare
  r hr.review%rowtype; c hr.review_cycle%rowtype; v_seat text; v_self text; v_mgr text;
  v_open boolean; v_mlane text; v_slane text; v_hr boolean;
begin
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null then return null; end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  v_seat := hr._rev_seat(p_uid, r.id);
  if v_seat is null then return null; end if;
  select status into v_self from hr.review_response
   where review_id = r.id and role = 'self' and deleted_at is null order by created_at desc limit 1;
  select status into v_mgr from hr.review_response
   where review_id = r.id and role = 'manager' and deleted_at is null order by created_at desc limit 1;
  v_open := c.status = 'open' and r.status <> 'cancelled';
  v_slane := hr._rev_lane(p_uid, r.id, 'self');
  v_mlane := hr._rev_lane(p_uid, r.id, 'manager');
  v_hr := hr._rev_can_manage(p_uid, r.organization_id);
  return jsonb_build_object(
    'review_id', r.id, 'organization_id', r.organization_id, 'cycle_id', r.cycle_id,
    'cycle_name', c.name, 'cycle_status', c.status,
    'period_start', c.period_start, 'period_end', c.period_end,
    'self_due_on', c.self_due_on, 'manager_due_on', c.manager_due_on, 'share_due_on', c.share_due_on,
    'employment_id', r.employment_id, 'employee_name', hr._rev_person_name(r.employment_id),
    'employee_has_login', r.employee_user_id is not null,
    'manager_employment_id', r.manager_employment_id,
    'manager_name', hr._rev_person_name(r.manager_employment_id),
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

-- ============================================================ doors
create function hr.hr_review_template_ensure_default(p_organization_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._rev_can_manage(v_uid, p_organization_id) then
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
          hr._rev_default_sections(), hr._rev_default_rating_scale(), true, p_organization_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'template_id', v_id, 'created', true);
end
$function$;

create function hr.hr_review_cycle_create(p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_name text; v_tpl uuid; t hr.review_template%rowtype;
  v_ps date; v_pe date; v_sd date; v_md date; v_hd date; v_id uuid; v_ens jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_org := nullif(p_payload ->> 'organization_id', '')::uuid;
  if not hr._rev_can_manage(v_uid, v_org) then
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
  if v_ps is null or v_pe is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'period');
  end if;
  if v_ps > v_pe then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'period_end');
  end if;
  v_tpl := nullif(p_payload ->> 'template_id', '')::uuid;
  if v_tpl is null then
    v_ens := hr.hr_review_template_ensure_default(v_org);
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
  return jsonb_build_object('ok', true, 'cycle_id', v_id, 'status', 'draft', 'template_id', t.id);
end
$function$;

create function hr.hr_review_cycle_launch(p_cycle_id uuid, p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; t hr.review_template%rowtype;
  v_targets uuid[]; v_emp uuid; em record; v_rid uuid; v_wf jsonb; v_inst uuid;
  v_created jsonb := '[]'::jsonb; v_refused jsonb := '[]'::jsonb; v_mgr_login uuid; v_mgr_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
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
        'employee_name', hr._rev_person_name(v_emp),
        'reason', case when em.status in ('terminated','separated') then 'terminated' else 'not_active' end,
        'employment_status', em.status);
      continue;
    end if;
    if em.current_manager_employment_id is null then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp), 'reason', 'no_manager');
      continue;
    end if;
    select em3.status, e3.login_user_id into v_mgr_status, v_mgr_login
      from hr.employment em3 join hr.employee e3 on e3.id = em3.employee_id
     where em3.id = em.current_manager_employment_id and em3.deleted_at is null;
    if v_mgr_status is distinct from 'active' then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp), 'reason', 'manager_not_active');
      continue;
    end if;
    if exists (select 1 from hr.review where cycle_id = c.id and employment_id = v_emp and deleted_at is null) then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp), 'reason', 'already_in_cycle');
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
      perform hr._rev_set_due(v_inst, 'self', c.self_due_on);
      perform hr._rev_set_due(v_inst, 'manager', c.manager_due_on);
    end if;
    v_created := v_created || jsonb_build_object('review_id', v_rid, 'employment_id', v_emp,
      'employee_name', hr._rev_person_name(v_emp),
      'manager_name', hr._rev_person_name(em.current_manager_employment_id),
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
    'created', v_created, 'refused', v_refused);
end
$function$;

create function hr.hr_review_cycle_list(p_organization_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._rev_can_manage(v_uid, p_organization_id) then
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

create function hr.hr_review_cycle_get(p_cycle_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; v_rows jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'review_id', r.id, 'employment_id', r.employment_id,
           'employee_name', hr._rev_person_name(r.employment_id),
           'manager_employment_id', r.manager_employment_id,
           'manager_name', hr._rev_person_name(r.manager_employment_id),
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
         order by hr._rev_person_name(r.employment_id)), '[]'::jsonb)
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

create function hr.hr_review_list_mine(p_organization_id uuid default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); v_mine uuid[]; v_hr boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_mine := coalesce(hr.employments_of(v_uid), '{}'::uuid[]);
  v_hr := p_organization_id is not null and hr._rev_can_manage(v_uid, p_organization_id);
  return jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(hr._rev_review_json(r.id, v_uid) - 'reopen_history' order by c.period_end desc, r.created_at desc)
      from hr.review r join hr.review_cycle c on c.id = r.cycle_id
     where r.deleted_at is null
       and (r.employee_user_id = v_uid or r.employment_id = any(v_mine)
            or r.manager_user_id = v_uid or r.manager_employment_id = any(v_mine)
            or (v_hr and r.organization_id = p_organization_id))), '[]'::jsonb));
end
$function$;

create function hr.hr_review_get(p_review_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); v_seat text; v_rev jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_seat := hr._rev_seat(v_uid, p_review_id);
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_rev := hr._rev_review_json(p_review_id, v_uid);
  return jsonb_build_object('ok', true, 'review', v_rev,
    'template', (select c.template_snapshot from hr.review r join hr.review_cycle c on c.id = r.cycle_id
                  where r.id = p_review_id),
    'responses', coalesce((
      select jsonb_agg(case when hr._rev_response_visible(v_seat, v_uid, p_review_id, x.id)
        then jsonb_build_object('response_id', x.id, 'role', x.role, 'status', x.status,
               'submitted_at', x.submitted_at, 'version', x.version, 'visible', true,
               'is_mine', x.respondent_user_id is not distinct from v_uid and x.respondent_user_id is not null,
               'recorded_by_hr', x.recorded_by is not null, 'answers', x.answers, 'updated_at', x.updated_at)
        else jsonb_build_object('role', x.role, 'status', x.status, 'submitted_at', x.submitted_at,
               'visible', false, 'is_mine', false) end
        order by x.role)
        from hr.review_response x where x.review_id = p_review_id and x.deleted_at is null), '[]'::jsonb));
end
$function$;

create function hr.hr_review_save_response(p_review_id uuid, p_role text, p_answers jsonb,
                                               p_expected_version integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_id uuid; v_ver integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role = 'peer' then return jsonb_build_object('ok', false, 'reason', 'peer_reviews_not_open'); end if;
  if p_role is null or p_role not in ('self', 'manager') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, p_role);
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
  if r.status = 'not_started' then
    update hr.review set status = 'in_progress' where id = r.id;
  end if;
  -- 🚨 NO WORKFLOW CALL HERE, BY DESIGN: a draft is not a decision (PLAN-STANDARD change 2).
  return jsonb_build_object('ok', true, 'response_id', v_id, 'role', p_role, 'version', v_ver,
                            'status', 'draft', 'saved_at', now(), 'recorded_by_hr', v_lane = 'recorder');
end
$function$;

create function hr.hr_review_submit_response(p_review_id uuid, p_role text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_problems jsonb; v_wf jsonb; v_self_done boolean; v_mgr_done boolean;
  v_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role is null or p_role not in ('self', 'manager') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, p_role);
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
  v_problems := hr._rev_answer_problems(c.template_snapshot, x.answers);
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'answers_incomplete', 'problems', v_problems);
  end if;

  update hr.review_response set status = 'submitted', submitted_at = now() where id = x.id;
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

  v_wf := hr._rev_close_step(r.id, p_role, 'attested', v_uid, v_lane);
  if v_status = 'both_submitted' then
    perform hr._rev_set_due(r.workflow_instance_id, 'share', c.share_due_on);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'role', p_role, 'submitted_at', now(),
    'review_status', v_status, 'both_submitted', v_status = 'both_submitted', 'workflow', v_wf);
end
$function$;

create function hr.hr_review_set_overall(p_review_id uuid, p_rating text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if hr._rev_lane(v_uid, p_review_id, 'manager') is null then
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

create function hr.hr_review_share(p_review_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, 'manager');
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
  update hr.review set shared_at = now(), shared_by = v_uid, status = 'shared' where id = r.id;
  v_wf := hr._rev_close_step(r.id, 'share', 'approved', v_uid, v_lane);
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', 'shared',
                            'shared_at', (select shared_at from hr.review where id = r.id), 'workflow', v_wf);
end
$function$;

create function hr.hr_review_acknowledge(p_review_id uuid, p_comment text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), ''); v_after hr.review%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, 'self');
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_the_employee'); end if;
  if v_lane = 'recorder' and v_comment is not null then
    return jsonb_build_object('ok', false, 'reason', 'comment_is_the_employees_own');
  end if;
  select * into r from hr.review where id = p_review_id for update;
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
  v_wf := hr._rev_close_step(r.id, 'acknowledge', 'acknowledged', v_uid, v_lane);
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

create function hr.hr_review_reopen(p_review_id uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_mgr text; v_hr boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_seq integer; v_wf jsonb; v_inst uuid;
  v_old_state text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_mgr := hr._rev_lane(v_uid, p_review_id, 'manager');
  select * into r from hr.review where id = p_review_id for update;
  v_hr := hr._rev_can_manage(v_uid, r.organization_id) and hr._rev_seat(v_uid, p_review_id) = 'hr';
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

create function hr.hr_review_cancel(p_review_id uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_state text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is distinct from 'hr' then
    return jsonb_build_object('ok', false, 'reason', case when hr._rev_seat(v_uid, p_review_id) is null
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

create function hr.hr_review_replace_manager(p_review_id uuid, p_manager_employment_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; v_status text; v_org uuid; v_login uuid;
  st hr.workflow_step%rowtype; v_re jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is distinct from 'hr' then
    return jsonb_build_object('ok', false, 'reason', case when hr._rev_seat(v_uid, p_review_id) is null
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
    'manager_name', hr._rev_person_name(p_manager_employment_id), 'manager_has_login', v_login is not null,
    'workflow', jsonb_build_object('reassigned', coalesce((v_re ->> 'granted')::boolean, false),
                                   'reason', case when st.id is null then 'no_open_manager_step'
                                                  when not coalesce((v_re ->> 'granted')::boolean, false)
                                                  then coalesce(v_re ->> 'reason', 'reassign_refused') end));
end
$function$;

create function hr.hr_review_history(p_employment_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_mine uuid[]; v_org uuid; v_self boolean; v_chain boolean; v_hr boolean;
  v_skip boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_mine := coalesce(hr.employments_of(v_uid), '{}'::uuid[]);
  v_self := p_employment_id = any(v_mine);
  v_hr := hr._rev_can_manage(v_uid, v_org);
  v_skip := hr._rev_skip_level_on(v_org);
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
               'manager_name', hr._rev_person_name(r.manager_employment_id),
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

create function hr.hr_review_cycle_close(p_cycle_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; rr record; v_n integer := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null for update;
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
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

-- ============================================================ register, then grant
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane,
   signed_in_callers, anonymous_callers)
values
  ('hr','_rev_person_name','p_employment_id uuid',array['uuid'::regtype]::oid[],
   'Returns the display name of one employments person; used to label rows the calling door already authorised. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_skip_level_on','p_org uuid',array['uuid'::regtype]::oid[],
   'Reads the hr.access skip-level review knob for one organization. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_can_manage','p_uid uuid, p_org uuid',array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'Answers hr.capability(p_uid, performance.manage, org) for the user the calling door read from auth.uid(). Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_seat','p_uid uuid, p_review_id uuid',array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'Names the seat (employee | manager | hr | skip_level | null) the given user holds on one review, from HR facts. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_response_visible','p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid',array['text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'The blind rule: whether a seat may read one responses answers. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_lane','p_uid uuid, p_review_id uuid, p_role text',array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
   'Names the lane (self | recorder | null) through which a user may write one roles response. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_set_due','p_instance uuid, p_step_key text, p_due date',array['uuid'::regtype, 'text'::regtype, 'date'::regtype]::oid[],
   'Sets due_at on an active step of a performance_review instance from a cycle date. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_close_step','p_review_id uuid, p_step_key text, p_decision text, p_uid uuid, p_lane text',array['uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
   'Closes one step of a reviews workflow instance (engine path when the user is a resolved approver, else a recorded decision naming the actor). Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_review_json','p_review_id uuid, p_uid uuid',array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'Builds the safe JSON of one review for one users seat (never answers). Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false);

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, argument_rules)
values
  ('hr','hr_review_template_ensure_default','p_organization_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: makes the organization''s default "Standard review" template. Gated inside by hr.capability performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_organization_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_can_manage(caller, this organization) decides before anything is read; for another organization the door answers not_permitted (list_mine simply adds no organization-wide rows).'))))),
  ('hr','hr_review_cycle_create','p_payload jsonb',array['jsonb'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: HR creates a review cycle (draft). Gated inside by performance.manage in the payload''s organization.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_payload', jsonb_build_object('type', 'jsonb', 'check', 'data; its organization_id is decided by hr._rev_can_manage(caller, that organization) before anything is written, and a template_id must belong to that organization.')))),
  ('hr','hr_review_cycle_launch','p_cycle_id uuid, p_payload jsonb',array['uuid'::regtype, 'jsonb'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: HR launches a cycle for a team, a department or named people; one review per active employment, manager frozen, workflow started per review. Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_cycle_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The cycle''s organization is read from the cycle row itself and hr._rev_can_manage(caller, that organization) decides; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_review_cycle_list','p_organization_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: the organization''s cycles with counts. Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_organization_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_can_manage(caller, this organization) decides before anything is read; for another organization the door answers not_permitted (list_mine simply adds no organization-wide rows).'))))),
  ('hr','hr_review_cycle_get','p_cycle_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: one cycle with every review''s completion row (who is outstanding). Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_cycle_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The cycle''s organization is read from the cycle row itself and hr._rev_can_manage(caller, that organization) decides; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_review_list_mine','p_organization_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: reviews where the caller is the employee or the manager (and every review of the organization for performance.manage). Safe columns only, never answers.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_organization_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_can_manage(caller, this organization) decides before anything is read; for another organization the door answers not_permitted (list_mine simply adds no organization-wide rows).'))))),
  ('hr','hr_review_get','p_review_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: one review and the responses the caller may read under the blind rule (hr._rev_response_visible). Seat named from HR facts inside the door.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_save_response','p_review_id uuid, p_role text, p_answers jsonb, p_expected_version integer',array['uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'integer'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: autosave of the caller''s own draft (or HR recording for a party with no login). Never touches the workflow instance.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_submit_response','p_review_id uuid, p_role text',array['uuid'::regtype, 'text'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: submits the caller''s response and closes their workflow step.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_set_overall','p_review_id uuid, p_rating text',array['uuid'::regtype, 'text'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: the manager sets the overall rating (a key of the cycle''s frozen scale).',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_share','p_review_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: the manager shares a review once both have submitted; closes the share step and opens the employee''s acknowledgment.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_acknowledge','p_review_id uuid, p_comment text',array['uuid'::regtype, 'text'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: the employee acknowledges a shared review through the workflow engine; hr.review_wf_apply is the one writer of acknowledged_at.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_reopen','p_review_id uuid, p_reason text',array['uuid'::regtype, 'text'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: the manager or HR returns a shared review to the manager, keeping history; a fresh acknowledgment is required.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_cancel','p_review_id uuid, p_reason text',array['uuid'::regtype, 'text'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: HR cancels a review (drafts kept) and cancels its workflow.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.'))))),
  ('hr','hr_review_replace_manager','p_review_id uuid, p_manager_employment_id uuid',array['uuid'::regtype, 'uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: HR replaces the reviewing manager frozen on a review.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat names the caller''s seat from the review row''s own facts (employee, frozen manager, performance.manage in the review''s organization, skip-level knob); no seat answers not_reachable identically for a foreign or invented id.')), 'p_manager_employment_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'Reached only from an HR seat on the review; the employment must be active in the review''s own organization (checked) or the door answers not_in_organization.'))))),
  ('hr','hr_review_history','p_employment_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: an employee''s reviews for their HR profile (employee: shared ones; manager chain and HR: all).',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_employment_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The employment''s organization is read from the row; only the employee, their manager chain, a manager frozen on one of their reviews, or performance.manage in that organization reads it; otherwise not_reachable.'))))),
  ('hr','hr_review_cycle_close','p_cycle_id uuid',array['uuid'::regtype]::oid[],'hr_rev_02',
   'Standard performance reviews: HR closes a cycle, cancelling every open step and locking its reviews.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_02', 'arguments', jsonb_build_object('p_cycle_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The cycle''s organization is read from the cycle row itself and hr._rev_can_manage(caller, that organization) decides; a foreign or invented id answers not_reachable identically.')))))
on conflict do nothing;

grant execute on function hr.hr_review_template_ensure_default(uuid) to authenticated;
grant execute on function hr.hr_review_cycle_create(jsonb) to authenticated;
grant execute on function hr.hr_review_cycle_launch(uuid, jsonb) to authenticated;
grant execute on function hr.hr_review_cycle_list(uuid) to authenticated;
grant execute on function hr.hr_review_cycle_get(uuid) to authenticated;
grant execute on function hr.hr_review_list_mine(uuid) to authenticated;
grant execute on function hr.hr_review_get(uuid) to authenticated;
grant execute on function hr.hr_review_save_response(uuid, text, jsonb, integer) to authenticated;
grant execute on function hr.hr_review_submit_response(uuid, text) to authenticated;
grant execute on function hr.hr_review_set_overall(uuid, text) to authenticated;
grant execute on function hr.hr_review_share(uuid) to authenticated;
grant execute on function hr.hr_review_acknowledge(uuid, text) to authenticated;
grant execute on function hr.hr_review_reopen(uuid, text) to authenticated;
grant execute on function hr.hr_review_cancel(uuid, text) to authenticated;
grant execute on function hr.hr_review_replace_manager(uuid, uuid) to authenticated;
grant execute on function hr.hr_review_history(uuid) to authenticated;
grant execute on function hr.hr_review_cycle_close(uuid) to authenticated;
