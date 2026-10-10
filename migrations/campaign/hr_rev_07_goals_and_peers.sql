-- chair-step: lane HR-REVIEWS wave 3. Creates two NEW tables through platform.create_entity_table (hr.goal — Organization, entity; hr.review_peer_nomination — Organization class, list scope mine), each certified inside this file, with FK indexes and same-organization triggers; adds one nullable column hr.review.peer_feedback_shared_at; replaces six bodies (declared below) to admit the goal_review question type, peer responses and the goals of a review; creates goal and peer doors with their platform.client_callable_door rows and GRANT EXECUTE to `authenticated`. No DROP, no REVOKE, no data row changed.
-- lane: HR-REVIEWS
-- based-on: hr._rev_template_problems(jsonb, jsonb) 44381eb9ef410d9a2aa4055e88359a841dfad88b4805e3989a2d20064b17809c
-- based-on: hr._rev_response_visible(text, uuid, uuid, uuid) c22671edc74120f5aed403e27ac025bd0057b84627db8dbbaa011eded96260d4
-- based-on: hr._rev_lane(uuid, uuid, text) 66a16674a494efc08cbde1cafcc896d7ad087e78cc0c31b0c056be5339d5429b
-- based-on: hr.hr_review_get(uuid) 1f2ebf53aef469effadaf25f871c74511efb9ef5d02aabe73879f0cf2c109715
-- based-on: hr.hr_review_save_response(uuid, text, jsonb, integer) 0eca4aad472e24adf2933651fb699ce51d4de1b791949f56a127c22564bd628b
-- based-on: hr.hr_review_submit_response(uuid, text) a521e6478e4a0515d6b2af73e43af40f8228c0132bcf1d07abb82b2bd81b81ec
--
-- hr_rev_07 — STANDARD REVIEWS WAVE 3: goals (OKR alignment) and peer feedback.
--   Goals are Organization records, open to read for the organization; owner, manager chain and
--   performance.manage edit. Progress is kept as a write-once-append history on the row.
--   A template question of type goal_review pulls the employee's goals overlapping the cycle into
--   hr_review_get (answers key "goals.<goal_id>").
--   Peers are response rows with role 'peer', never engine steps: nominated by the employee or the
--   manager (manager nominations are approved at once), approved by the manager, told through
--   communication.notify_from_sql (event hr.performance.peer_feedback_requested), read by the
--   manager and HR, by the employee only once the manager shares peer feedback, names stripped
--   when the anonymous knob is on.

select platform.create_entity_table(
  'hr', 'goal', 'hr_goal', 'Goal',
  array[
    'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
    'title text NOT NULL',
    'description text',
    'measure text',
    'target_value numeric',
    'current_value numeric',
    'unit text',
    'start_on date',
    'due_on date',
    'status text NOT NULL DEFAULT ''on_track'' CHECK (status IN (''on_track'',''at_risk'',''off_track'',''done'',''dropped''))',
    'progress numeric NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100)',
    'parent_goal_id uuid REFERENCES hr.goal(id)',
    'cycle_id uuid REFERENCES hr.review_cycle(id)',
    'progress_history jsonb NOT NULL DEFAULT ''[]''::jsonb',
    'CONSTRAINT goal_dates_ck CHECK (start_on IS NULL OR due_on IS NULL OR start_on <= due_on)',
    'CONSTRAINT goal_not_own_parent_ck CHECK (parent_goal_id IS NULL OR parent_goal_id <> id)'
  ],
  'entity', false, true, 'none', false, false, false, false, null, 'organization', 'organization');

select platform.create_entity_table(
  'hr', 'review_peer_nomination', 'hr_review_peer_nomination', 'Peer feedback nomination',
  array[
    'review_id uuid NOT NULL REFERENCES hr.review(id)',
    'peer_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
    'peer_user_id uuid',
    'nominated_by uuid',
    'status text NOT NULL DEFAULT ''pending'' CHECK (status IN (''pending'',''approved'',''declined''))',
    'decided_by uuid',
    'decided_at timestamptz'
  ],
  'entity', false, true, 'none', false, false, false, false, null, 'organization', 'mine');

create index goal_employment_idx on hr.goal (employment_id);
create index goal_parent_idx on hr.goal (parent_goal_id);
create index goal_cycle_idx on hr.goal (cycle_id);
create index review_peer_nomination_review_idx on hr.review_peer_nomination (review_id);
create index review_peer_nomination_peer_idx on hr.review_peer_nomination (peer_employment_id);
create index review_peer_nomination_peer_user_idx on hr.review_peer_nomination (peer_user_id);
create unique index review_peer_nomination_one_per_peer_uq on hr.review_peer_nomination (review_id, peer_employment_id)
  where deleted_at is null;

create trigger trg_same_org_hr_goal_employment_id before insert or update of employment_id on hr.goal
  for each row execute function platform.assert_same_org('employment_id', 'hr.employment');
create trigger trg_same_org_hr_goal_parent_goal_id before insert or update of parent_goal_id on hr.goal
  for each row execute function platform.assert_same_org('parent_goal_id', 'hr.goal');
create trigger trg_same_org_hr_goal_cycle_id before insert or update of cycle_id on hr.goal
  for each row execute function platform.assert_same_org('cycle_id', 'hr.review_cycle');
create trigger trg_same_org_hr_review_peer_nomination_review_id before insert or update of review_id on hr.review_peer_nomination
  for each row execute function platform.assert_same_org('review_id', 'hr.review');
create trigger trg_same_org_hr_review_peer_nomination_peer_employment_id before insert or update of peer_employment_id on hr.review_peer_nomination
  for each row execute function platform.assert_same_org('peer_employment_id', 'hr.employment');

do $$
begin
  if not iam.canonical_certify_ok('hr', 'goal', 'hr_goal') then
    raise exception 'hr_rev_07: hr.goal is not certified';
  end if;
  if not iam.canonical_certify_ok('hr', 'review_peer_nomination', 'hr_review_peer_nomination') then
    raise exception 'hr_rev_07: hr.review_peer_nomination is not certified';
  end if;
end $$;

alter table hr.review add column peer_feedback_shared_at timestamptz;

-- ============================================================ replaced bodies
CREATE OR REPLACE FUNCTION hr._rev_template_problems(p_sections jsonb, p_scale jsonb)
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

CREATE OR REPLACE FUNCTION hr._rev_response_visible(p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid)
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
                           and (v_both or hr._rev_knob(r.organization_id, 'standard_review_manager_sees_self',
                                                       '"after_both_submit"'::jsonb) #>> '{}' = 'after_employee_submits'))
    when 'skip_level' then x.status = 'submitted' and v_both
    else false end;
end
$function$;

CREATE OR REPLACE FUNCTION hr._rev_lane(p_uid uuid, p_review_id uuid, p_role text)
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
       and hr._rev_can_manage(p_uid, r.organization_id) then return 'recorder'; end if;
  elsif p_role = 'manager' then
    if r.manager_user_id = p_uid or r.manager_employment_id = any(v_mine) then return 'self'; end if;
    if r.manager_user_id is null and not (r.employment_id = any(v_mine))
       and hr._rev_can_manage(p_uid, r.organization_id) then return 'recorder'; end if;
  elsif p_role = 'peer' then
    if exists (select 1 from hr.review_peer_nomination n where n.review_id = r.id and n.peer_user_id = p_uid
                 and n.status = 'approved' and n.deleted_at is null) then return 'self'; end if;
  end if;
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION hr.hr_review_save_response(p_review_id uuid, p_role text, p_answers jsonb, p_expected_version integer DEFAULT NULL::integer)
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
  if hr._rev_seat(v_uid, p_review_id) is null and hr._rev_lane(v_uid, p_review_id, 'peer') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role = 'peer' and not coalesce((hr._rev_knob((select organization_id from hr.review where id = p_review_id),
       'standard_review_peers_enabled', 'false'::jsonb) #>> '{}')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'peer_reviews_not_open');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
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
  if r.status = 'not_started' and p_role <> 'peer' then
    update hr.review set status = 'in_progress' where id = r.id;
  end if;
  -- 🚨 NO WORKFLOW CALL HERE, BY DESIGN: a draft is not a decision (PLAN-STANDARD change 2).
  return jsonb_build_object('ok', true, 'response_id', v_id, 'role', p_role, 'version', v_ver,
                            'status', 'draft', 'saved_at', now(), 'recorded_by_hr', v_lane = 'recorder');
end
$function$;

CREATE OR REPLACE FUNCTION hr.hr_review_submit_response(p_review_id uuid, p_role text)
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
  if hr._rev_seat(v_uid, p_review_id) is null and hr._rev_lane(v_uid, p_review_id, 'peer') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
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
  -- a peer answers what they choose to; only the typed shape is required
  v_problems := case when p_role = 'peer' then
                  case when (x.answers ->> '__kind') = 'performance_review_answers' then '[]'::jsonb
                       else '[{"question":null,"problem":"not_performance_review_answers"}]'::jsonb end
                else hr._rev_answer_problems(c.template_snapshot, x.answers) end;
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

  v_wf := hr._rev_close_step(r.id, p_role, 'attested', v_uid, v_lane);
  if v_status = 'both_submitted' then
    perform hr._rev_set_due(r.workflow_instance_id, 'share', c.share_due_on);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'role', p_role, 'submitted_at', now(),
    'review_status', v_status, 'both_submitted', v_status = 'both_submitted', 'workflow', v_wf);
end
$function$;

CREATE OR REPLACE FUNCTION hr.hr_review_get(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_seat text; v_rev jsonb; r hr.review%rowtype; c hr.review_cycle%rowtype;
        v_anon boolean; v_goals jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_seat := hr._rev_seat(v_uid, p_review_id);
  if v_seat is null and hr._rev_lane(v_uid, p_review_id, 'peer') is not null then v_seat := 'peer'; end if;
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  select * into r from hr.review where id = p_review_id;
  select * into c from hr.review_cycle where id = r.cycle_id;
  v_anon := coalesce((hr._rev_knob(r.organization_id, 'standard_review_peer_anonymous', 'true'::jsonb) #>> '{}')::boolean, true);
  if v_seat = 'peer' then
    -- a peer sees who and what period they are asked about, and their own response — nothing else
    v_rev := jsonb_build_object('review_id', r.id, 'organization_id', r.organization_id, 'cycle_id', r.cycle_id,
               'cycle_name', c.name, 'cycle_status', c.status, 'period_start', c.period_start, 'period_end', c.period_end,
               'manager_due_on', c.manager_due_on, 'employment_id', r.employment_id,
               'employee_name', hr._rev_person_name(r.employment_id), 'my_seat', 'peer', 'status', r.status);
  else
    v_rev := hr._rev_review_json(p_review_id, v_uid)
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
                 'peer_name', hr._rev_person_name(n.peer_employment_id), 'status', n.status,
                 'response_status', case when v_seat in ('hr', 'manager') then
                   (select x.status from hr.review_response x where x.review_id = r.id and x.role = 'peer'
                       and x.respondent_user_id = n.peer_user_id and x.deleted_at is null limit 1) end)
                 order by n.created_at)
          from hr.review_peer_nomination n where n.review_id = r.id and n.deleted_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'responses', coalesce((
      select jsonb_agg(case when hr._rev_response_visible(case when v_seat = 'peer' then 'none' else v_seat end, v_uid, p_review_id, x.id)
        then jsonb_build_object('response_id', x.id, 'role', x.role, 'status', x.status,
               'submitted_at', x.submitted_at, 'version', x.version, 'visible', true,
               'is_mine', x.respondent_user_id is not distinct from v_uid and x.respondent_user_id is not null,
               'recorded_by_hr', x.recorded_by is not null, 'answers', x.answers, 'updated_at', x.updated_at)
             || case when x.role = 'peer' and (v_seat in ('hr', 'manager') or (v_seat = 'employee' and not v_anon)
                                                or x.respondent_user_id = v_uid)
                     then jsonb_build_object('respondent_name', (select hr._rev_person_name(n.peer_employment_id)
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

-- ============================================================ goal helpers
create function hr._goal_can_read(p_uid uuid, p_org uuid)
 returns boolean language sql stable security definer set search_path to 'hr', 'public'
as $function$
  -- Organization records: anyone employed by the organization, and HR, reads them.
  select p_uid is not null and (
    exists (select 1 from hr.employment em where em.id = any(coalesce(hr.employments_of(p_uid), '{}'::uuid[]))
              and em.organization_id = p_org and em.deleted_at is null)
    or hr._rev_can_manage(p_uid, p_org));
$function$;

create function hr._goal_can_edit(p_uid uuid, p_employment_id uuid)
 returns boolean language plpgsql stable security definer set search_path to 'hr', 'public'
as $function$
declare v_mine uuid[] := coalesce(hr.employments_of(p_uid), '{}'::uuid[]); v_org uuid;
begin
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null or p_uid is null then return false; end if;
  return p_employment_id = any(v_mine)
      or exists (select 1 from hr.manager_chain(p_employment_id, current_date) mc where mc.manager_employment_id = any(v_mine))
      or hr._rev_can_manage(p_uid, v_org);
end
$function$;

create function hr._goal_json(g hr.goal)
 returns jsonb language sql stable set search_path to 'hr', 'public'
as $function$
  select jsonb_build_object('goal_id', g.id, 'organization_id', g.organization_id, 'employment_id', g.employment_id,
    'owner_name', hr._rev_person_name(g.employment_id), 'title', g.title, 'description', g.description,
    'measure', g.measure, 'target_value', g.target_value, 'current_value', g.current_value, 'unit', g.unit,
    'start_on', g.start_on, 'due_on', g.due_on, 'status', g.status, 'progress', g.progress,
    'parent_goal_id', g.parent_goal_id, 'cycle_id', g.cycle_id, 'version', g.version, 'updated_at', g.updated_at,
    'child_count', (select count(*) from hr.goal c where c.parent_goal_id = g.id and c.deleted_at is null));
$function$;

-- ============================================================ goal doors
create function hr.hr_goal_list(p_employment_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); v_org uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null or not hr._goal_can_read(v_uid, v_org) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  return jsonb_build_object('ok', true, 'employment_id', p_employment_id,
    'can_edit', hr._goal_can_edit(v_uid, p_employment_id),
    'goals', coalesce((select jsonb_agg(hr._goal_json(g) order by g.due_on nulls last, g.title)
                         from hr.goal g where g.employment_id = p_employment_id and g.deleted_at is null), '[]'::jsonb));
end
$function$;

create function hr.hr_goal_list_team(p_manager_employment_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); v_org uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select organization_id into v_org from hr.employment where id = p_manager_employment_id and deleted_at is null;
  if v_org is null or not hr._goal_can_read(v_uid, v_org) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  return jsonb_build_object('ok', true, 'manager_employment_id', p_manager_employment_id,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', em.id, 'name', hr._rev_person_name(em.id),
               'can_edit', hr._goal_can_edit(v_uid, em.id),
               'goals', coalesce((select jsonb_agg(hr._goal_json(g) order by g.due_on nulls last, g.title)
                                    from hr.goal g where g.employment_id = em.id and g.deleted_at is null), '[]'::jsonb))
             order by hr._rev_person_name(em.id))
        from hr.employment em
       where em.current_manager_employment_id = p_manager_employment_id and em.deleted_at is null
         and em.status = 'active' and em.organization_id = v_org), '[]'::jsonb));
end
$function$;

create function hr.hr_goal_save(p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_id uuid := nullif(p_payload ->> 'goal_id', '')::uuid; g hr.goal%rowtype;
  v_emp uuid; v_org uuid; v_title text; v_status text; v_progress numeric; v_parent uuid; v_cycle uuid;
  v_start date; v_due date; v_ver integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if v_id is not null then
    select * into g from hr.goal where id = v_id and deleted_at is null;
    if g.id is null or not hr._goal_can_edit(v_uid, g.employment_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_reachable');
    end if;
    v_emp := g.employment_id;
  else
    v_emp := nullif(p_payload ->> 'employment_id', '')::uuid;
    if v_emp is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'employment_id'); end if;
    if not hr._goal_can_edit(v_uid, v_emp) then return jsonb_build_object('ok', false, 'reason', 'not_permitted'); end if;
  end if;
  select organization_id into v_org from hr.employment where id = v_emp;
  v_title := coalesce(nullif(btrim(coalesce(p_payload ->> 'title', '')), ''), g.title);
  if v_title is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'title'); end if;
  v_status := coalesce(nullif(p_payload ->> 'status', ''), g.status, 'on_track');
  if v_status not in ('on_track','at_risk','off_track','done','dropped') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'status');
  end if;
  begin
    v_progress := coalesce((p_payload ->> 'progress')::numeric, g.progress, 0);
    v_start := case when p_payload ? 'start_on' then nullif(p_payload ->> 'start_on', '')::date else g.start_on end;
    v_due := case when p_payload ? 'due_on' then nullif(p_payload ->> 'due_on', '')::date else g.due_on end;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'values');
  end;
  if v_progress < 0 or v_progress > 100 then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'progress'); end if;
  if v_start is not null and v_due is not null and v_start > v_due then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'due_on');
  end if;
  v_parent := case when p_payload ? 'parent_goal_id' then nullif(p_payload ->> 'parent_goal_id', '')::uuid else g.parent_goal_id end;
  if v_parent is not null then
    if v_parent = v_id or not exists (select 1 from hr.goal p where p.id = v_parent and p.organization_id = v_org and p.deleted_at is null) then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'parent_goal_id');
    end if;
    -- no loops: the proposed parent may not sit below this goal
    if v_id is not null and exists (
         with recursive up(id, parent) as (select p.id, p.parent_goal_id from hr.goal p where p.id = v_parent
                                          union all select p.id, p.parent_goal_id from hr.goal p join up on p.id = up.parent)
         select 1 from up where up.id = v_id) then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'parent_goal_id', 'detail', 'alignment_loop');
    end if;
  end if;
  v_cycle := case when p_payload ? 'cycle_id' then nullif(p_payload ->> 'cycle_id', '')::uuid else g.cycle_id end;
  if v_cycle is not null and not exists (select 1 from hr.review_cycle c where c.id = v_cycle and c.organization_id = v_org) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'cycle_id');
  end if;
  if v_id is null then
    insert into hr.goal (employment_id, title, description, measure, target_value, current_value, unit, start_on, due_on,
                         status, progress, parent_goal_id, cycle_id, organization_id)
    values (v_emp, v_title, nullif(btrim(coalesce(p_payload ->> 'description', '')), ''),
            nullif(btrim(coalesce(p_payload ->> 'measure', '')), ''),
            nullif(p_payload ->> 'target_value', '')::numeric, nullif(p_payload ->> 'current_value', '')::numeric,
            nullif(btrim(coalesce(p_payload ->> 'unit', '')), ''), v_start, v_due, v_status, v_progress, v_parent, v_cycle, v_org)
    returning id, version into v_id, v_ver;
    return jsonb_build_object('ok', true, 'goal_id', v_id, 'created', true, 'version', v_ver);
  end if;
  update hr.goal set title = v_title,
    description = case when p_payload ? 'description' then nullif(btrim(coalesce(p_payload ->> 'description', '')), '') else description end,
    measure = case when p_payload ? 'measure' then nullif(btrim(coalesce(p_payload ->> 'measure', '')), '') else measure end,
    target_value = case when p_payload ? 'target_value' then nullif(p_payload ->> 'target_value', '')::numeric else target_value end,
    current_value = case when p_payload ? 'current_value' then nullif(p_payload ->> 'current_value', '')::numeric else current_value end,
    unit = case when p_payload ? 'unit' then nullif(btrim(coalesce(p_payload ->> 'unit', '')), '') else unit end,
    start_on = v_start, due_on = v_due, status = v_status, progress = v_progress, parent_goal_id = v_parent, cycle_id = v_cycle
   where id = v_id
  returning version into v_ver;
  return jsonb_build_object('ok', true, 'goal_id', v_id, 'created', false, 'version', v_ver);
end
$function$;

create function hr.hr_goal_update_progress(p_goal_id uuid, p_current_value numeric default null,
                                           p_progress numeric default null, p_status text default null,
                                           p_note text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); g hr.goal%rowtype; v_status text; v_progress numeric; v_entry jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into g from hr.goal where id = p_goal_id and deleted_at is null for update;
  if g.id is null or not hr._goal_can_edit(v_uid, g.employment_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_status := coalesce(nullif(p_status, ''), g.status);
  if v_status not in ('on_track','at_risk','off_track','done','dropped') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'status');
  end if;
  v_progress := coalesce(p_progress,
                         case when p_current_value is not null and g.target_value is not null and g.target_value <> 0
                              then least(100, greatest(0, round(p_current_value / g.target_value * 100, 1))) end,
                         g.progress);
  if v_progress < 0 or v_progress > 100 then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'progress'); end if;
  v_entry := jsonb_strip_nulls(jsonb_build_object('at', now(), 'by_user_id', v_uid,
               'current_value', coalesce(p_current_value, g.current_value), 'progress', v_progress, 'status', v_status,
               'note', nullif(btrim(coalesce(p_note, '')), '')));
  update hr.goal set current_value = coalesce(p_current_value, current_value), progress = v_progress, status = v_status,
                     progress_history = progress_history || jsonb_build_array(v_entry)
   where id = g.id;
  return jsonb_build_object('ok', true, 'goal_id', g.id, 'progress', v_progress, 'status', v_status,
    'current_value', coalesce(p_current_value, g.current_value),
    'history', (select progress_history from hr.goal where id = g.id));
end
$function$;

create function hr.hr_goal_archive(p_goal_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); g hr.goal%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into g from hr.goal where id = p_goal_id and deleted_at is null;
  if g.id is null or not hr._goal_can_edit(v_uid, g.employment_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  update hr.goal set deleted_at = now() where id = g.id;
  return jsonb_build_object('ok', true, 'goal_id', g.id, 'archived_at', now(),
    'children_kept', (select count(*) from hr.goal c where c.parent_goal_id = g.id and c.deleted_at is null));
end
$function$;

-- ============================================================ peer helpers + doors
create function hr._rev_notify_peer(p_nomination_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'hr', 'public'
as $function$
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
                                  'cycle', jsonb_build_object('id', r.cycle_id), 'review_id', r.id),
               hr.link_names_its_employer('/hr/performance/reviews/' || r.id::text, r.organization_id),
               'hr_review', r.id, 'hr_review_peer:' || n.id::text);
  exception when others then
    raise warning 'hr._rev_notify_peer: notice for nomination % not sent [%] %', n.id, sqlstate, sqlerrm;
    return jsonb_build_object('sent', false, 'reason', 'notify_refused', 'sqlstate', sqlstate);
  end;
  return jsonb_build_object('sent', true, 'result', v_res);
end
$function$;

create function hr.hr_review_peer_nominate(p_review_id uuid, p_employment_ids uuid[])
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_seat text; v_emp uuid;
  em record; v_id uuid; v_status text; v_out jsonb := '[]'::jsonb; v_ref jsonb := '[]'::jsonb; v_note jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_seat := hr._rev_seat(v_uid, p_review_id);
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if v_seat not in ('employee', 'manager') then return jsonb_build_object('ok', false, 'reason', 'not_permitted'); end if;
  select * into r from hr.review where id = p_review_id;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if not coalesce((hr._rev_knob(r.organization_id, 'standard_review_peers_enabled', 'false'::jsonb) #>> '{}')::boolean, false) then
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
    v_note := case when v_status = 'approved' then hr._rev_notify_peer(v_id) end;
    v_out := v_out || jsonb_build_object('nomination_id', v_id, 'employment_id', v_emp,
               'peer_name', hr._rev_person_name(v_emp), 'status', v_status, 'notice', v_note);
  end loop;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'nominations', v_out, 'refused', v_ref);
end
$function$;

create function hr.hr_review_peer_approve(p_review_id uuid, p_nomination_ids uuid[], p_approve boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; n record; v_out jsonb := '[]'::jsonb; v_note jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr._rev_lane(v_uid, p_review_id, 'manager') is distinct from 'self' then
    return jsonb_build_object('ok', false, 'reason', 'not_the_manager');
  end if;
  select * into r from hr.review where id = p_review_id;
  if p_approve is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'approve'); end if;
  for n in select * from hr.review_peer_nomination
            where review_id = r.id and id = any(coalesce(p_nomination_ids, '{}'::uuid[])) and status = 'pending' and deleted_at is null
  loop
    update hr.review_peer_nomination set status = case when p_approve then 'approved' else 'declined' end,
           decided_by = v_uid, decided_at = now() where id = n.id;
    v_note := case when p_approve then hr._rev_notify_peer(n.id) end;
    v_out := v_out || jsonb_build_object('nomination_id', n.id, 'peer_name', hr._rev_person_name(n.peer_employment_id),
               'status', case when p_approve then 'approved' else 'declined' end, 'notice', v_note);
  end loop;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'decided', v_out);
end
$function$;

create function hr.hr_review_peer_requests_mine()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  return jsonb_build_object('ok', true, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object('nomination_id', n.id, 'review_id', r.id, 'organization_id', r.organization_id,
             'employee_name', hr._rev_person_name(r.employment_id), 'cycle_name', c.name, 'cycle_status', c.status,
             'due_on', c.manager_due_on,
             'response_status', coalesce((select x.status from hr.review_response x where x.review_id = r.id and x.role = 'peer'
                                            and x.respondent_user_id = v_uid and x.deleted_at is null limit 1), 'not_started'))
             order by c.manager_due_on nulls last)
      from hr.review_peer_nomination n join hr.review r on r.id = n.review_id join hr.review_cycle c on c.id = r.cycle_id
     where n.peer_user_id = v_uid and n.status = 'approved' and n.deleted_at is null and r.deleted_at is null
       and r.status <> 'cancelled'), '[]'::jsonb));
end
$function$;

create function hr.hr_review_peer_share(p_review_id uuid, p_share boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr._rev_lane(v_uid, p_review_id, 'manager') is null then return jsonb_build_object('ok', false, 'reason', 'not_the_manager'); end if;
  update hr.review set peer_feedback_shared_at = case when coalesce(p_share, false) then now() end where id = p_review_id;
  return jsonb_build_object('ok', true, 'review_id', p_review_id,
                            'peer_feedback_shared_at', (select peer_feedback_shared_at from hr.review where id = p_review_id));
end
$function$;

-- ============================================================ register, then grant
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane,
   signed_in_callers, anonymous_callers)
values
  ('hr','_goal_can_read','p_uid uuid, p_org uuid',array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'Answers whether a user is employed by (or HR for) an organization, for goal reads. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_07_goals_and_peers.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_goal_* / hr.hr_review_peer_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_goal_can_edit','p_uid uuid, p_employment_id uuid',array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'Answers whether a user is the goal owner, in the owners manager chain, or holds performance.manage there. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_07_goals_and_peers.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_goal_* / hr.hr_review_peer_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false),
  ('hr','_rev_notify_peer','p_nomination_id uuid',array['uuid'::regtype]::oid[],
   'Sends the peer-feedback notice for one approved nomination through communication.notify_from_sql. Checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_07_goals_and_peers.sql (HR-REVIEWS)',
   'server_only: called only from inside the hr.hr_goal_* / hr.hr_review_peer_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.',
   false, false);

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, argument_rules)
values
  ('hr','hr_goal_list','p_employment_id uuid',array['uuid'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: Goals of one person (Organization records).',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_employment_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The employment''s organization is read from its row and hr._goal_can_read / hr._goal_can_edit decide; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_goal_list_team','p_manager_employment_id uuid',array['uuid'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: Goals of a managers direct reports.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_manager_employment_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The employment''s organization is read from its row and hr._goal_can_read / hr._goal_can_edit decide; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_goal_save','p_payload jsonb',array['jsonb'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: Creates or edits a goal (owner, manager chain, performance.manage).',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_payload', jsonb_build_object('type', 'jsonb', 'check', 'data; an existing goal_id is reached only through hr._goal_can_edit on its owner, a new goal only on the payload''s employment_id; parent and cycle must be in the same organization.')))),
  ('hr','hr_goal_update_progress','p_goal_id uuid, p_current_value numeric, p_progress numeric, p_status text, p_note text',array['uuid'::regtype, 'numeric'::regtype, 'numeric'::regtype, 'text'::regtype, 'text'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: Records goal progress with an appended history entry.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_goal_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The goal''s owner employment is read from its row and hr._goal_can_edit decides; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_goal_archive','p_goal_id uuid',array['uuid'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: Archives a goal.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_goal_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The goal''s owner employment is read from its row and hr._goal_can_edit decides; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_review_peer_nominate','p_review_id uuid, p_employment_ids uuid[]',array['uuid'::regtype, 'uuid[]'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: The employee or manager nominates peers for feedback on a review (knob standard_review_peers_enabled).',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat / hr._rev_lane name the caller''s seat from the review row''s own facts; no seat answers not_reachable identically.')), 'p_employment_ids', jsonb_build_object('type', 'uuid[]', 'foreign', jsonb_build_object('bounded', true, 'note', 'Each id must be an active employment of the review''s own organization (checked one by one); others are refused by name.'))))),
  ('hr','hr_review_peer_approve','p_review_id uuid, p_nomination_ids uuid[], p_approve boolean',array['uuid'::regtype, 'uuid[]'::regtype, 'boolean'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: The manager approves or declines peer nominations; approved peers are notified.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat / hr._rev_lane name the caller''s seat from the review row''s own facts; no seat answers not_reachable identically.')), 'p_nomination_ids', jsonb_build_object('type', 'uuid[]', 'foreign', jsonb_build_object('bounded', true, 'note', 'Only nominations of this review, already admitted by the seat check, are touched; other ids are ignored.'))))),
  ('hr','hr_review_peer_requests_mine','',array[]::oid[],'hr_rev_07',
   'Standard performance reviews: The callers approved peer-feedback requests.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object())),
  ('hr','hr_review_peer_share','p_review_id uuid, p_share boolean',array['uuid'::regtype, 'boolean'::regtype]::oid[],'hr_rev_07',
   'Standard performance reviews: The manager shares (or withdraws) submitted peer feedback with the employee.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_07', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_seat / hr._rev_lane name the caller''s seat from the review row''s own facts; no seat answers not_reachable identically.')))))
on conflict do nothing;

grant execute on function hr.hr_goal_list(uuid) to authenticated;
grant execute on function hr.hr_goal_list_team(uuid) to authenticated;
grant execute on function hr.hr_goal_save(jsonb) to authenticated;
grant execute on function hr.hr_goal_update_progress(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function hr.hr_goal_archive(uuid) to authenticated;
grant execute on function hr.hr_review_peer_nominate(uuid, uuid[]) to authenticated;
grant execute on function hr.hr_review_peer_approve(uuid, uuid[], boolean) to authenticated;
grant execute on function hr.hr_review_peer_requests_mine() to authenticated;
grant execute on function hr.hr_review_peer_share(uuid, boolean) to authenticated;
