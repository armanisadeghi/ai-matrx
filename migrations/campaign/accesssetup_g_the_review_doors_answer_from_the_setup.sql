-- chair-step: it REPLACES the bodies of every live standard-review door that decides who sees or does what (hr.hr_review_get, hr._rev_review_json, _save_response, _submit_response, _set_overall, _share, _acknowledge, _reopen, _cancel, _replace_manager, _calibrate, _calibration, _peer_nominate, _peer_approve, _peer_share, _peer_requests_mine, _list_mine, _history) with thin calls onto iam.seats_of / seats_opening / part_level / may_act / may_act_seat / redact_by_parts / records_where_seated, ADDS hr._review_lane and hr._review_reaches, and DROPS hr._rev_seat, hr._rev_lane and hr._rev_response_visible (nothing calls them after this; their frozen hr._legacy_ copies stay as the oracle). Doors return seats: text[] instead of my_seat; the client reads the list in the same push. Answers change only inside the written opening list (union across seats outside blind_wins, upper management, a fallback filling an empty required seat, a login linked after creation writing its own self-evaluation).
-- lane: access-setup
-- lock: hr,iam
-- based-on: hr._rev_review_json(uuid, uuid) a9313805258318d0df7e1c555ed76856454d24da7aed62cb7f0b4fc58211c0f7
-- based-on: hr.hr_review_get(uuid) 3df0ad8f2e02a303a163cd1de9f3ced49facd6224cce4422c1a5500fe61dd5f8
-- based-on: hr.hr_review_save_response(uuid, text, jsonb, integer) 0b82d35a3217066b5a82206d01fc9821ab08d9647cef1d5c54396395eb82eb72
-- based-on: hr.hr_review_submit_response(uuid, text) 5a3636d8ea2bc71ca24fac9f35098caca46a603af924917f750cf6acfad8ba56
-- based-on: hr.hr_review_set_overall(uuid, text) a69a8efe4279b5daa433d03f99ff2bc8ec691c9f54ef0b3439932743a2576208
-- based-on: hr.hr_review_share(uuid) 28919ff8b48d36c3c10df7604471ba7aa37b8383fef8d1b2da01dab273d7fb86
-- based-on: hr.hr_review_acknowledge(uuid, text) aa7a99a7a67cac20eecb1f07e8ca314e47f424b58eeb90c93224614223483f79
-- based-on: hr.hr_review_reopen(uuid, text) 4f3c36c9aedf51d04ad9bbb648e5def641890d9c9cc28bcb383eaebb575823fd
-- based-on: hr.hr_review_cancel(uuid, text) e55bb9153cd42190af75f01f3999015f2dc4b1291cd9fe9d96f8184c1fce749d
-- based-on: hr.hr_review_replace_manager(uuid, uuid) 991530e45259aa79a9d71f0860c74a2cda4694531eea14ec6f56368b9ef5e70d
-- based-on: hr.hr_review_calibrate(uuid, text, text) 0daabe20ec99ad11ca5aea5cf0c8fa0d1f56dd9f469c64dc9cc3b807c7502b66
-- based-on: hr.hr_review_calibration(uuid, jsonb) be60754116ec7d6bae155a55bde30099e98d5464c0d65fbb1078b3287e5a3d7c
-- based-on: hr.hr_review_peer_nominate(uuid, uuid[]) 92f3b9fa11ab216c9c0bf8e10105d4de7eef16bda353ebdb1aa4c81146599dba
-- based-on: hr.hr_review_peer_approve(uuid, uuid[], boolean) 1a10f63a95d0df664c8086a1f6888be4b6a9712ff78d248e304ab6974c421f9a
-- based-on: hr.hr_review_peer_share(uuid, boolean) fa2c57bf15d5e36595f7082ea5965094e60eb272ec38841d63f8df40cc6a4cde
-- based-on: hr.hr_review_peer_requests_mine() 0bf2899f996e35054bf55d4531078a996ad99be9d92bc0c5709140c8d4893bf4
-- based-on: hr.hr_review_list_mine(uuid) 19b0d11d2db8f574f3cca243a64d23741123f88aa7cf586177e3e446574deddd
-- based-on: hr.hr_review_history(uuid) 4a782b1489f3776583272255d95b7bb0a04b4b4db12e8567b339d6c4f69dc19f
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §7 "Every door changes", §8 step 4.
-- Inverse: migrations/inverse/accesssetup_g_the_review_doors_answer_from_the_setup_down.sql
--
-- Unchanged on purpose: the organization-level doors (_cycle_*, _template_*) stay on hr._rev_can_manage, as
-- the plan says; _calibration adds upper management through hr.review_seat_upper_in_org; review_wf_apply is the
-- workflow engine's writer (no person, no seat) and review_wf_digest names no person. Each door keeps its own
-- state checks and refusal words; only WHO is decided by the setup.

-- ── two small helpers every door asks ────────────────────────────────────────────────────────────
-- the review is live and the person holds a seat that opens it
create or replace function hr._review_reaches(p_uid uuid, p_review_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select p_uid is not null
     and exists (select 1 from hr.review r where r.id = p_review_id and r.deleted_at is null)
     and cardinality(coalesce(iam.seats_opening(p_uid, 'hr_review', p_review_id), '{}'::text[])) > 0;
$function$;

-- the lane a person writes one response in: 'self' (their own editor cell), 'recorder' (an editor cell lent
-- by the recorder rule: the seat's holder has no login) or null
create or replace function hr._review_lane(p_uid uuid, p_review_id uuid, p_role text)
 returns text
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select case when bool_or(not c.borrowed) then 'self' when bool_or(c.borrowed) then 'recorder' end
    from iam._cells_for(p_uid, 'hr_review', p_review_id,
                        case p_role when 'self' then 'self_evaluation' when 'manager' then 'manager_evaluation'
                                    when 'peer' then 'peer_input' end) c
   where c.level >= 'editor'::public.permission_level and c.reached
     and exists (select 1 from hr.review r where r.id = p_review_id and r.deleted_at is null);
$function$;

revoke all on function hr._review_reaches(uuid, uuid) from public, anon, authenticated;
revoke all on function hr._review_lane(uuid, uuid, text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('hr', '_review_reaches', 'p_uid uuid, p_review_id uuid', array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_g_the_review_doors_answer_from_the_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: whether a person reaches one review (a seat that opens it, iam.seats_opening).',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.', false, false),
  ('hr', '_review_lane', 'p_uid uuid, p_review_id uuid, p_role text', array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_g_the_review_doors_answer_from_the_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: the lane (self | recorder) a person writes one review response in, from iam._cells_for.',
   'server_only: called only from inside the hr.hr_review_* SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

-- ── the review JSON: built whole, then redacted by parts ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr._rev_review_json(p_review_id uuid, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  r hr.review%rowtype; c hr.review_cycle%rowtype; v_self text; v_mgr text; v_open boolean;
  v_slvl public.permission_level; v_mlvl public.permission_level;
begin
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null or not hr._review_reaches(p_uid, r.id) then return null; end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  select status into v_self from hr.review_response
   where review_id = r.id and role = 'self' and deleted_at is null order by created_at desc limit 1;
  select status into v_mgr from hr.review_response
   where review_id = r.id and role = 'manager' and deleted_at is null order by created_at desc limit 1;
  v_open := c.status = 'open' and r.status <> 'cancelled';
  v_slvl := iam.part_level(p_uid, 'hr_review', r.id, 'self_evaluation');
  v_mlvl := iam.part_level(p_uid, 'hr_review', r.id, 'manager_evaluation');
  -- every head column the setup maps to a part comes back only to a person whose part level allows it
  return iam.redact_by_parts('hr_review', r.id, p_uid, jsonb_build_object(
    'review_id', r.id, 'organization_id', r.organization_id, 'cycle_id', r.cycle_id,
    'cycle_name', c.name, 'cycle_status', c.status,
    'period_start', c.period_start, 'period_end', c.period_end,
    'self_due_on', c.self_due_on, 'manager_due_on', c.manager_due_on, 'share_due_on', c.share_due_on,
    'employment_id', r.employment_id, 'employee_name', hr._rev_person_name(r.employment_id),
    'employee_has_login', r.employee_user_id is not null,
    'manager_employment_id', r.manager_employment_id,
    'manager_name', hr._rev_person_name(r.manager_employment_id),
    'manager_has_login', r.manager_user_id is not null,
    'seats', to_jsonb(coalesce(iam.seats_of(p_uid, 'hr_review', r.id), '{}'::text[])),
    'status', r.status,
    'self_status', coalesce(v_self, 'not_started'), 'manager_status', coalesce(v_mgr, 'not_started'),
    'self_submitted_at', r.self_submitted_at, 'manager_submitted_at', r.manager_submitted_at,
    'shared_at', r.shared_at, 'acknowledged_at', r.acknowledged_at,
    'acknowledgment_comment', case when r.acknowledged_at is not null then r.acknowledgment_comment end,
    'overall_rating', r.overall_rating,
    'calibrated_rating', r.calibrated_rating,
    'calibration_note', r.calibration_note,
    'reopen_history', r.reopen_history,
    'cancelled_at', r.cancelled_at,
    'workflow_instance_id', r.workflow_instance_id,
    'can', jsonb_build_object(
      'save_self',      coalesce(v_open and coalesce(v_self, 'draft') = 'draft' and v_slvl >= 'editor'::public.permission_level, false),
      'submit_self',    coalesce(v_open and v_self = 'draft' and v_slvl >= 'editor'::public.permission_level, false),
      'save_manager',   coalesce(v_open and coalesce(v_mgr, 'draft') = 'draft' and r.status not in ('shared','acknowledged')
                        and v_mlvl >= 'editor'::public.permission_level, false),
      'submit_manager', coalesce(v_open and v_mgr = 'draft' and r.status not in ('shared','acknowledged')
                        and v_mlvl >= 'editor'::public.permission_level, false),
      'set_overall',    coalesce(v_open and r.status not in ('shared','acknowledged')
                        and iam.may_act(p_uid, 'hr_review', r.id, 'set_overall'), false),
      'share',          coalesce(v_open and r.status = 'both_submitted' and r.overall_rating is not null
                        and iam.may_act(p_uid, 'hr_review', r.id, 'release_to_employee'), false),
      'acknowledge',    coalesce(v_open and r.status = 'shared' and iam.may_act(p_uid, 'hr_review', r.id, 'acknowledge'), false),
      'reopen',         coalesce(v_open and r.status in ('shared','acknowledged') and iam.may_act(p_uid, 'hr_review', r.id, 'reopen'), false),
      'cancel',         coalesce(r.status not in ('cancelled','acknowledged') and iam.may_act(p_uid, 'hr_review', r.id, 'cancel'), false),
      'replace_manager', coalesce(r.status not in ('cancelled','acknowledged','shared')
                        and iam.may_act(p_uid, 'hr_review', r.id, 'replace_manager'), false))));
end
$function$;

-- ── reading one review ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.hr_review_get(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_seats text[]; v_opening text[]; v_peer_view boolean; v_rev jsonb;
        r hr.review%rowtype; c hr.review_cycle%rowtype; v_anon boolean; v_goals jsonb;
        v_names boolean; v_overview boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  v_opening := coalesce(iam.seats_opening(v_uid, 'hr_review', p_review_id), '{}'::text[]);
  if r.id is null or cardinality(v_opening) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_seats := coalesce(iam.seats_of(v_uid, 'hr_review', r.id), '{}'::text[]);
  -- a person whose only opening seat is peer sees who and what period they are asked about, and their own response
  v_peer_view := v_opening <@ array['peer'];
  select * into c from hr.review_cycle where id = r.cycle_id;
  v_anon := coalesce((hr._rev_knob(r.organization_id, 'standard_review_peer_anonymous', 'true'::jsonb) #>> '{}')::boolean, true);
  -- peer names and the peer overview come from the person's peer_input cells (declared names; an unstaged
  -- cell that is not own-rows-only follows peer input as a whole: every row listed, nominations' status shown)
  select coalesce(bool_or(cf.names = 'shown'
                          or (cf.names = 'knob:hr.performance/standard_review_peer_anonymous' and not v_anon)), false),
         coalesce(bool_or(cf.from_stage is null and cf.rows_rule <> 'own'), false)
    into v_names, v_overview
    from iam._cells_for(v_uid, 'hr_review', r.id, 'peer_input') cf where cf.reached and not v_peer_view;
  if v_peer_view then
    v_rev := jsonb_build_object('review_id', r.id, 'organization_id', r.organization_id, 'cycle_id', r.cycle_id,
               'cycle_name', c.name, 'cycle_status', c.status, 'period_start', c.period_start, 'period_end', c.period_end,
               'manager_due_on', c.manager_due_on, 'employment_id', r.employment_id,
               'employee_name', hr._rev_person_name(r.employment_id), 'seats', to_jsonb(v_seats), 'status', r.status);
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
    'peer_nominations', case when not v_peer_view
                              and iam.part_level(v_uid, 'hr_review', r.id, 'peer_nominations') is not null then coalesce((
        select jsonb_agg(jsonb_build_object('nomination_id', n.id, 'peer_employment_id', n.peer_employment_id,
                 'peer_name', hr._rev_person_name(n.peer_employment_id), 'status', n.status,
                 'response_status', case when v_overview then
                   (select x.status from hr.review_response x where x.review_id = r.id and x.role = 'peer'
                       and x.respondent_user_id = n.peer_user_id and x.deleted_at is null limit 1) end)
                 order by n.created_at)
          from hr.review_peer_nomination n where n.review_id = r.id and n.deleted_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'responses', coalesce((
      select jsonb_agg(case when x.vis
        then jsonb_build_object('response_id', x.id, 'role', x.role, 'status', x.status,
               'submitted_at', x.submitted_at, 'version', x.version, 'visible', true,
               'is_mine', x.respondent_user_id is not distinct from v_uid and x.respondent_user_id is not null,
               'recorded_by_hr', x.recorded_by is not null, 'answers', x.answers, 'updated_at', x.updated_at)
             || case when x.role = 'peer' and (v_names or x.respondent_user_id = v_uid)
                     then jsonb_build_object('respondent_name', (select hr._rev_person_name(n.peer_employment_id)
                            from hr.review_peer_nomination n where n.review_id = r.id and n.peer_user_id = x.respondent_user_id
                              and n.deleted_at is null limit 1))
                     else '{}'::jsonb end
        else jsonb_build_object('role', x.role, 'status', x.status, 'submitted_at', x.submitted_at,
               'visible', false, 'is_mine', false) end
        order by x.role, x.submitted_at)
        from (select x0.*, iam.part_level(v_uid, 'hr_review', r.id, null, 'hr_review_response', x0.id) is not null vis
                from hr.review_response x0 where x0.review_id = p_review_id and x0.deleted_at is null) x
       where (not v_peer_view or x.respondent_user_id = v_uid)
         and (x.role <> 'peer' or x.vis or v_overview or x.respondent_user_id = v_uid)), '[]'::jsonb));
end
$function$;

-- ── writing a response ───────────────────────────────────────────────────────────────────────────
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
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role = 'peer' and not coalesce((hr._rev_knob((select organization_id from hr.review where id = p_review_id),
       'standard_review_peers_enabled', 'false'::jsonb) #>> '{}')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'peer_reviews_not_open');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._review_lane(v_uid, p_review_id, p_role);
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
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._review_lane(v_uid, p_review_id, p_role);
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
  v_problems := case when p_role = 'peer' then
                  case when (x.answers ->> '__kind') = 'performance_review_answers' then '[]'::jsonb
                       else '[{"question":null,"problem":"not_performance_review_answers"}]'::jsonb end
                else hr._rev_answer_problems(c.template_snapshot, x.answers, hr._rev_review_goal_ids(r.id)) end;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'answers_incomplete', 'problems', v_problems);
  end if;
  update hr.review_response set status = 'submitted', submitted_at = now() where id = x.id;
  if p_role = 'peer' then
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

-- ── the manager's actions ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.hr_review_set_overall(p_review_id uuid, p_rating text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'set_overall') then
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

CREATE OR REPLACE FUNCTION hr.hr_review_share(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'release_to_employee') then
    return jsonb_build_object('ok', false, 'reason', 'not_the_manager');
  end if;
  v_lane := coalesce(hr._review_lane(v_uid, p_review_id, 'manager'), 'self');
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
$function$;

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
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'acknowledge') then
    return jsonb_build_object('ok', false, 'reason', 'not_the_employee');
  end if;
  v_lane := coalesce(hr._review_lane(v_uid, p_review_id, 'self'), 'self');
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
  -- the facts go on the INSTANCE, because the instance is what the one writer (hr.review_wf_apply) reads;
  -- the comment lands on the review's acknowledgment_comment, a final_summary column
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

CREATE OR REPLACE FUNCTION hr.hr_review_reopen(p_review_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_seq integer; v_wf jsonb; v_inst uuid;
  v_old_state text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'reopen') then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  select * into r from hr.review where id = p_review_id for update;
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

-- ── HR's actions on one review ───────────────────────────────────────────────────────────────────
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
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'cancel') then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
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
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'replace_manager') then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
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
  if r.id is null or not iam.may_act_seat(v_uid, 'hr_review', r.id, 'calibrate') then
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

-- the cycle board stays organization-level: HR in the organization, and upper management reads it
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
  if c.id is null or not (hr._rev_can_manage(v_uid, c.organization_id)
                          or hr.review_seat_upper_in_org(v_uid, c.organization_id)) then
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
$function$;

-- ── peers ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.hr_review_peer_nominate(p_review_id uuid, p_employment_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_emp uuid;
  em record; v_id uuid; v_status text; v_out jsonb := '[]'::jsonb; v_ref jsonb := '[]'::jsonb; v_note jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'peer_nominate') then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
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
  v_status := case when 'manager' = any(coalesce(iam.seats_of(v_uid, 'hr_review', r.id), '{}'::text[]))
                   then 'approved' else 'pending' end;
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

CREATE OR REPLACE FUNCTION hr.hr_review_peer_approve(p_review_id uuid, p_nomination_ids uuid[], p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; n record; v_out jsonb := '[]'::jsonb; v_note jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'peer_approve') then
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

CREATE OR REPLACE FUNCTION hr.hr_review_peer_share(p_review_id uuid, p_share boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if not iam.may_act_seat(v_uid, 'hr_review', p_review_id, 'peer_share') then
    return jsonb_build_object('ok', false, 'reason', 'not_the_manager');
  end if;
  update hr.review set peer_feedback_shared_at = case when coalesce(p_share, false) then now() end where id = p_review_id;
  return jsonb_build_object('ok', true, 'review_id', p_review_id,
                            'peer_feedback_shared_at', (select peer_feedback_shared_at from hr.review where id = p_review_id));
end
$function$;

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
      from hr.review r
      join hr.review_peer_nomination n on n.review_id = r.id and n.peer_user_id = v_uid and n.status = 'approved'
                                      and n.deleted_at is null
      join hr.review_cycle c on c.id = r.cycle_id
     where r.id in (select iam.records_where_seated(v_uid, 'hr_review'))
       and 'peer' = any(coalesce(iam.seats_of(v_uid, 'hr_review', r.id), '{}'::text[]))
       and r.deleted_at is null and r.status <> 'cancelled'), '[]'::jsonb));
end
$function$;

-- ── lists ────────────────────────────────────────────────────────────────────────────────────────
-- the set stays today's: the employee and the manager everywhere; HR (and now upper management) in the
-- organization the caller names
CREATE OR REPLACE FUNCTION hr.hr_review_list_mine(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  return jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(hr._rev_review_json(r.id, v_uid) - 'reopen_history' order by c.period_end desc, r.created_at desc)
      from hr.review r join hr.review_cycle c on c.id = r.cycle_id
     where r.deleted_at is null
       and r.id in (select iam.records_where_seated(v_uid, 'hr_review'))
       and (coalesce(iam.seats_of(v_uid, 'hr_review', r.id), '{}'::text[]) && array['employee', 'manager']
            or (p_organization_id is not null and r.organization_id = p_organization_id
                and coalesce(iam.seats_of(v_uid, 'hr_review', r.id), '{}'::text[]) && array['hr', 'upper_management']))), '[]'::jsonb));
end
$function$;

-- history stays scoped to the employment with today's chain logic; each entry is redacted by parts
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
      select jsonb_agg(iam.redact_by_parts('hr_review', r.id, v_uid, jsonb_build_object(
               'review_id', r.id, 'cycle_id', r.cycle_id, 'cycle_name', c.name,
               'period_start', c.period_start, 'period_end', c.period_end, 'status', r.status,
               'manager_name', hr._rev_person_name(r.manager_employment_id),
               'overall_rating', r.overall_rating, 'shared_at', r.shared_at,
               'acknowledged_at', r.acknowledged_at))
             order by c.period_end desc)
        from hr.review r join hr.review_cycle c on c.id = r.cycle_id
       where r.employment_id = p_employment_id and r.deleted_at is null
         and case when v_self then r.status in ('shared', 'acknowledged')
                  when v_hr then true
                  else r.status <> 'cancelled' end), '[]'::jsonb));
end
$function$;

-- ── the one-seat helpers: nothing calls them any more (their hr._legacy_ copies stay as the oracle) ───
delete from platform.client_callable_door where schema_name = 'hr' and function_name in ('_rev_seat', '_rev_lane', '_rev_response_visible');
drop function hr._rev_seat(uuid, uuid);
drop function hr._rev_lane(uuid, uuid, text);
drop function hr._rev_response_visible(text, uuid, uuid, uuid);
