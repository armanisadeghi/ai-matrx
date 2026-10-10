-- chair-step: inverse of accesssetup_g — restores every standard-review door body as it stood before the swap (one seat by precedence, my_seat), recreates hr._rev_seat, hr._rev_lane and hr._rev_response_visible with their door rows, and drops hr._review_reaches and hr._review_lane. Run it together with the client commit that reads my_seat (revert the client in the same push).
-- lane: access-setup
-- lock: hr,iam

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION hr._rev_seat(p_uid uuid, p_review_id uuid)
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
  if hr._rev_can_manage(p_uid, r.organization_id) then return 'hr'; end if;
  if r.manager_employment_id is not null
     and hr._rev_skip_level_on(r.organization_id)
     and hr.manager_as_of(r.manager_employment_id, current_date) = any(v_mine) then
    return 'skip_level';
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION hr._rev_review_json(p_review_id uuid, p_uid uuid)
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_acknowledge(p_review_id uuid, p_comment text DEFAULT NULL::text)
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
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, 'self');
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_the_employee'); end if;
  if v_lane = 'recorder' and v_comment is not null then
    return jsonb_build_object('ok', false, 'reason', 'comment_is_the_employees_own');
  end if;
  select * into r from hr.review where id = p_review_id for update;
  if v_comment is not null
     and not coalesce((hr._rev_knob(r.organization_id, 'standard_review_ack_comment', 'true'::jsonb) #>> '{}')::boolean, true) then
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_calibrate(p_review_id uuid, p_rating text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null for update;
  if r.id is null or not hr._rev_can_manage(v_uid, r.organization_id) then
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_calibration(p_cycle_id uuid, p_filter jsonb DEFAULT '{}'::jsonb)
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
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  with base as (
    select r.*, (hr.primary_position_as_of(r.employment_id, current_date)).department_id dept_id
      from hr.review r where r.cycle_id = c.id and r.deleted_at is null and r.status <> 'cancelled'
  ), rows as (
    select b.id, b.status, b.overall_rating, b.calibrated_rating, b.calibration_note, b.calibrated_at,
           b.manager_employment_id, hr._rev_person_name(b.employment_id) employee_name,
           hr._rev_person_name(b.manager_employment_id) manager_name, d.name department,
           (select hr._rev_mean_rating(x.answers) from hr.review_response x where x.review_id = b.id
              and x.role = 'self' and x.status = 'submitted' and x.deleted_at is null limit 1) self_overall,
           (select hr._rev_mean_rating(x.answers) from hr.review_response x where x.review_id = b.id
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_cancel(p_review_id uuid, p_reason text)
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_history(p_employment_id uuid)
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_list_mine(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_peer_approve(p_review_id uuid, p_nomination_ids uuid[], p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_peer_nominate(p_review_id uuid, p_employment_ids uuid[])
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_peer_requests_mine()
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
             'employee_name', hr._rev_person_name(r.employment_id), 'cycle_name', c.name, 'cycle_status', c.status,
             'due_on', c.manager_due_on,
             'response_status', coalesce((select x.status from hr.review_response x where x.review_id = r.id and x.role = 'peer'
                                            and x.respondent_user_id = v_uid and x.deleted_at is null limit 1), 'not_started'))
             order by c.manager_due_on nulls last)
      from hr.review_peer_nomination n join hr.review r on r.id = n.review_id join hr.review_cycle c on c.id = r.cycle_id
     where n.peer_user_id = v_uid and n.status = 'approved' and n.deleted_at is null and r.deleted_at is null
       and r.status <> 'cancelled'), '[]'::jsonb));
end
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_peer_share(p_review_id uuid, p_share boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr._rev_lane(v_uid, p_review_id, 'manager') is null then return jsonb_build_object('ok', false, 'reason', 'not_the_manager'); end if;
  update hr.review set peer_feedback_shared_at = case when coalesce(p_share, false) then now() end where id = p_review_id;
  return jsonb_build_object('ok', true, 'review_id', p_review_id,
                            'peer_feedback_shared_at', (select peer_feedback_shared_at from hr.review where id = p_review_id));
end
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_reopen(p_review_id uuid, p_reason text)
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_replace_manager(p_review_id uuid, p_manager_employment_id uuid)
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_set_overall(p_review_id uuid, p_rating text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_share(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
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
  if coalesce((hr._rev_knob(r.organization_id, 'standard_review_calibration_required', 'false'::jsonb) #>> '{}')::boolean, false)
     and r.calibrated_rating is null then
    return jsonb_build_object('ok', false, 'reason', 'calibration_required');
  end if;
  update hr.review set shared_at = now(), shared_by = v_uid, status = 'shared' where id = r.id;
  v_wf := hr._rev_close_step(r.id, 'share', 'approved', v_uid, v_lane);
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', 'shared',
                            'shared_at', (select shared_at from hr.review where id = r.id), 'workflow', v_wf);
end
$function$
;

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
                else hr._rev_answer_problems(c.template_snapshot, x.answers, hr._rev_review_goal_ids(r.id)) end;
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
$function$
;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers) values ('hr', '_rev_lane', 'p_uid uuid, p_review_id uuid, p_role text', '{2950,2950,25}'::oid[], 'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)', 'Names the lane (self | recorder | null) through which a user may write one roles response. Checked against nothing a caller supplies because no client calls it.', 'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.', 'f', 'f') on conflict (schema_name, function_name, identity_argtypes) do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers) values ('hr', '_rev_response_visible', 'p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid', '{25,2950,2950,2950}'::oid[], 'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)', 'The blind rule: whether a seat may read one responses answers. Checked against nothing a caller supplies because no client calls it.', 'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.', 'f', 'f') on conflict (schema_name, function_name, identity_argtypes) do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers) values ('hr', '_rev_seat', 'p_uid uuid, p_review_id uuid', '{2950,2950}'::oid[], 'matrx-frontend/migrations/campaign/hr_rev_02_standard_review_doors.sql (HR-REVIEWS)', 'Names the seat (employee | manager | hr | skip_level | null) the given user holds on one review, from HR facts. Checked against nothing a caller supplies because no client calls it.', 'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.', 'f', 'f') on conflict (schema_name, function_name, identity_argtypes) do nothing;
revoke all on function hr._rev_seat(uuid, uuid) from public, anon, authenticated;
revoke all on function hr._rev_lane(uuid, uuid, text) from public, anon, authenticated;
revoke all on function hr._rev_response_visible(text, uuid, uuid, uuid) from public, anon, authenticated;
delete from platform.client_callable_door where schema_name = 'hr' and function_name in ('_review_reaches', '_review_lane');
drop function if exists hr._review_lane(uuid, uuid, text);
drop function if exists hr._review_reaches(uuid, uuid);
