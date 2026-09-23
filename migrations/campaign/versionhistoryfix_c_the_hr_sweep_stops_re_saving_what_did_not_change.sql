-- chair-step: it REPLACES three function bodies, `hr.wf_tick()`, `hr.wf_escalate(uuid,text)` and
--   `public.wsp_upsert_system_task(...)`, each with a minimal, commented edit (below), so the HR
--   workflow sweep stops re-escalating a refused step and stops re-saving rows that did not
--   change, and declares hr.wf_escalate's (missing) server-only row in platform.client_callable_door,
--   which the provision guard requires of a replaced SECURITY DEFINER body. No table, trigger, grant
--   or policy is touched; no other row is written. `create or replace
--   function` takes ACCESS SHARE only (not window-class). The inverse puts the three production
--   bodies back verbatim:
--   `migrations/inverse/versionhistoryfix_c_the_hr_sweep_stops_re_saving_what_did_not_change_down.sql`.
-- lock: platform
-- lane: VERSION-HISTORY-FIX
-- based-on: hr.wf_tick() cd9b7d24c2ea4df20fb05f06bf5321a6521ad87fd01f8af80bb26c273abf6b62
-- based-on: hr.wf_escalate(uuid, text) 118a27380b1eb9df83bf4b24e3d8784c34aeb8aac4b520a32629f0c3b24da101
-- based-on: public.wsp_upsert_system_task(text, text, text, text, text, text, text, text, date, text, uuid, uuid, uuid, jsonb) b84e71ac2f515f1b8134a82e8d9074ccc47e4154f5991566e85dfaf705476af5
--
-- VERSION-HISTORY-FIX — THE RE-SAVE LOOP, FIXED AT ITS SOURCE.
--
-- WHO KEPT RE-SAVING IDENTICAL ROWS (VERSION-HISTORY-CENSUS.md finding 1: ~16,300 phantom versions
-- each on hr.workflow_step_definition and workspace.tasks, both tables' newest phantom write at the
-- same instant). Traced on production, SELECT-only, 2026-09-23: the history rows written at
-- 2026-09-23 04:51:51.335808 are 24 hr_workflow_step UPDATEs, 8 hr_workflow_failure INSERTs and
-- 8 + 8 iam.permissions DELETE/INSERTs, actor tier `code`; 32 failures an hour, every hour = one run
-- every 15 minutes. The run is aidream's `hr_workflow_tick` schedule
-- (aidream/services/hr/schedules.py) calling `hr.wf_tick()`:
--   * PASS 4 picks every active step past its SLA with `escalated_at IS NULL` and calls
--     `hr.wf_escalate`.
--   * `hr.wf_escalate` re-resolves excluding the current approver; on 8 steps nobody better exists,
--     so (its RD 2) it restores the step exactly and records `resolution_evidence.escalation_refused`,
--     leaving `escalated_at` NULL. The next sweep picks the same step. Forever.
--   * Each attempt ran an UPDATE of hr.workflow_step_definition setting resolver_kind to itself (a
--     literal no-op: wf_activate_step never reads escalation_resolver_kind): the step definitions'
--     phantom versions;
--   * and `hr._wf_project_step` re-projected the approval task through
--     `public.wsp_upsert_system_task`, which UPDATEs an existing task unconditionally: the tasks'
--     phantom versions. (`hr._wf_unproject_step(..., 'superseded')` before it fails silently:
--     `wsp_resolve_system_task` refuses 'superseded' and the caller swallows the exception. Not
--     changed here; named in PROGRESS-VERSION-HISTORY-FIX.md.)
-- The waste is not only versions: every attempt opened a new failure row and sent the HR owner a
-- `hr.workflow.failure_raised` notification (production: 16,366 failure rows, 16,361 open, on 27
-- steps), and revoked and re-granted the approver's access.
--
-- THE FIX, THE CLASS: A WRITER COMPARES FIRST.
--   1. `hr.wf_tick()` PASS 4 (and PASS 3's escalate branch) skips a step whose escalation was
--      refused while the failure that refusal opened is still open or retrying: the HR owner's to
--      work. Resolve or abandon it and the next sweep tries again. This is PASS 5's own shape
--      (`not exists ... failure_class = 'result_unverified' and state in ('open','retrying')`).
--   2. `hr.wf_escalate` loses the no-op UPDATE.
--   3. `public.wsp_upsert_system_task` updates only when title, description, due date, source url
--      or source label would actually change; every system-task projector inherits it.
-- Proof: scripts/campaign-tests/versionhistoryfix_loop_green.sql, RED on the clone before this file
-- (clause 1: "one sweep opened 8 new failure row(s)"; clause 2: step definition v1723 -> v1724 ...;
-- clause 3 probe: task v1723 -> v1724), GREEN after.
--
-- DO THESE TWO TABLES ALSO NEED THE NO-OP TRIGGER? Not now: nothing reads their version (census
-- class c), and with the source fixed nothing writes them unchanged at volume. The trigger is the
-- guard where a client sends the number back; the census ratchet is the guard for the rest.

CREATE OR REPLACE FUNCTION hr.wf_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_max integer;
  v_reminders integer := 0; v_warned integer := 0; v_timeouts integer := 0;
  v_escalated integer := 0; v_results integer := 0; v_expired integer := 0;
  r record; u uuid; v_res jsonb; v_dec uuid;
  -- hr_l3_114: the failure this pass raises, and the human it was assigned to. Declared so PASS 5
  -- can hand `result_unverified` a recipient instead of the null it used to pass.
  v_fid uuid; v_assignee uuid;
begin
  -- §4.2: service role only. An envelope, not a raise (THE REFUSAL-ENVELOPE LAW).
  if auth.uid() is not null and not public.is_platform_admin() then
    return jsonb_build_object('granted', false, 'reason', 'service_role_only',
      'detail', 'hr.wf_tick is the scheduled sweep and is not callable by an ordinary user');
  end if;

  v_max  := (hr._knob('hr.workflow','tick_batch_max') #>> '{}')::integer;
  perform hr.arm_write();

  -- ---------------------------------------------------------------- PASS 1 — reminders
  for r in
    select s.id, s.workflow_instance_id, s.resolved_user_ids, s.due_at, s.reminders_sent,
           coalesce(sd.reminder_cadence_hours, d.reminder_cadence_hours) cadence, d.reminder_max
      from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_definition d on d.id = i.workflow_definition_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active'
       and s.reminders_sent < d.reminder_max
       and now() >= coalesce(s.last_reminder_at, s.activated_at)
                    + make_interval(hours => coalesce(sd.reminder_cadence_hours,
                                                      d.reminder_cadence_hours))
     order by s.activated_at
     limit v_max
  loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      -- "approvers who have not decided" — a quorum member who already decided is not reminded
      continue when exists (select 1 from hr.workflow_decision dd
                             where dd.workflow_step_id = r.id and dd.actor_user_id = u
                               and not dd.superseded_by_target_change);
      perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.step_reminder', 'reminder',
                            u, null, jsonb_build_object('due_at', r.due_at,
                                                        'reminder_number', r.reminders_sent + 1,
                                                        'reminder_max', r.reminder_max));
    end loop;
    update hr.workflow_step
       set reminders_sent = reminders_sent + 1, last_reminder_at = now() where id = r.id;
    perform hr._wf_event(r.workflow_instance_id, r.id, 'reminder_sent');
    v_reminders := v_reminders + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 2 — timeout warnings
  -- autonomy policy rule 4: the timeout must be visible BEFORE it fires (RD 4 — this pass runs
  -- before pass 3 so a step is never warned and applied in the same sweep).
  for r in
    select s.id, s.workflow_instance_id, s.resolved_user_ids, s.timeout_at,
           (hr._hr_knob('hr.workflow','timeout_warning_lead_hours', s.organization_id, null) #>> '{}')::integer as lead_hours
      from hr.workflow_step s
     where s.state = 'active' and s.autonomy_mode = 3
       and s.timeout_at is not null and s.timeout_warned_at is null
       and now() >= s.timeout_at - make_interval(hours =>
             (hr._hr_knob('hr.workflow','timeout_warning_lead_hours', s.organization_id, null) #>> '{}')::integer)
     order by s.timeout_at
     limit v_max
  loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.step_timeout_warning',
                            'timeout_warning', u, null,
                            jsonb_build_object('timeout_at', r.timeout_at, 'lead_hours', r.lead_hours));
    end loop;
    update hr.workflow_step set timeout_warned_at = now() where id = r.id;
    perform hr._wf_event(r.workflow_instance_id, r.id, 'timeout_warned');
    v_warned := v_warned + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 3 — timeouts (mode 3)
  for r in
    select s.id, s.workflow_instance_id, s.step_key, s.autonomy_mode, s.timeout_at,
           s.organization_id, sd.timeout_action
      from hr.workflow_step s
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active' and s.autonomy_mode = 3
       and s.timeout_at is not null and now() >= s.timeout_at
       -- VERSION-HISTORY-FIX (2026-09-24): an escalation that was already REFUSED, whose failure row
       -- an HR owner has not yet worked, is not tried again every sweep (see PASS 4).
       and (sd.timeout_action = 'apply'
            or not exists (select 1 from hr.workflow_failure f
                        where f.workflow_step_id = s.id and f.state in ('open','retrying')
                          and f.created_at >= (s.resolution_evidence -> 'escalation_refused' ->> 'at')::timestamptz))
     order by s.timeout_at
     limit v_max
  loop
    if r.timeout_action = 'apply' then
      -- §3.2: the step closes `auto_approved`, and the auto-decision is RECORDED as a decision row
      -- with actor_type='automation' — never as a state flip with no author.
      insert into hr.workflow_decision
        (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
         actor_type, approval_basis, autonomy_mode,
         calculation_snapshot)
      values (r.organization_id, r.workflow_instance_id, r.id, r.step_key, 'approved',
              'no decision was taken within the displayed timeout window',
              'automation', 'timeout', 3,
              jsonb_build_object('timeout_at', r.timeout_at, 'timeout_action', 'apply'))
      returning id into v_dec;
      perform hr._wf_event(r.workflow_instance_id, r.id, 'timeout_applied', 'active', 'auto_approved',
                           'automation', null, null, jsonb_build_object('decision_id', v_dec));
      perform hr._wf_close_step(r.id, 'auto_approved', 'mode_3_timeout');
    else
      perform hr.wf_escalate(r.id, 'mode 3 timeout elapsed with no decision');
    end if;
    v_timeouts := v_timeouts + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 4 — escalation
  for r in
    select s.id, s.workflow_instance_id
      from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_definition d on d.id = i.workflow_definition_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active' and s.escalated_at is null
       and ((sd.escalate_after_hours is not null
             and now() >= s.activated_at + make_interval(hours => sd.escalate_after_hours))
            or (s.due_at is not null and now() >= s.due_at and d.on_expiry = 'escalate'))
       -- VERSION-HISTORY-FIX (2026-09-24): THE SWEEP COMPARES FIRST. wf_escalate's refused path (RD 2)
       -- restores the step exactly and leaves escalated_at NULL, so without this the SAME step was
       -- escalated again every 15 minutes, forever: a new failure row and a failure_raised
       -- notification to the HR owner each time (16,366 rows on production for 27 steps), a revoke
       -- and re-grant, and identical re-saves of the step definition and the approval task. A refusal
       -- whose failure is still open or retrying is the HR owner's to work; once it is resolved or
       -- abandoned the next sweep tries the escalation again (PASS 5's shape for result_unverified).
       and not exists (select 1 from hr.workflow_failure f
                        where f.workflow_step_id = s.id and f.state in ('open','retrying')
                          and f.created_at >= (s.resolution_evidence -> 'escalation_refused' ->> 'at')::timestamptz)
     order by s.due_at nulls last
     limit v_max
  loop
    -- §1.9 pass 4: if escalation itself resolves to nobody, wf_escalate's activation opens the
    -- `unroutable` failure row. The request is never silently parked.
    perform hr.wf_escalate(r.id, 'SLA elapsed');
    v_escalated := v_escalated + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 5 — external results (RD 3)
  -- 🚨 THE AR2 CASE. A shutoff branch whose integration never reports back leaves the instance in
  -- `verifying` with an open `result_unverified` failure. IT NEVER REACHES `completed`.
  for r in
    select s.id, s.workflow_instance_id, s.result_due_at
      from hr.workflow_step s
     where s.state = 'awaiting_result' and s.result_due_at is not null
       and now() >= s.result_due_at
       and not exists (select 1 from hr.workflow_failure f
                        where f.workflow_step_id = s.id and f.failure_class = 'result_unverified'
                          and f.state in ('open','retrying'))
     order by s.result_due_at
     limit v_max
  loop
    v_fid := hr._wf_failure(r.workflow_instance_id, r.id, 'result_unverified',
      jsonb_build_object('result_due_at', r.result_due_at,
        'detail', 'the external effect was never confirmed within its window; this step cannot self-complete'));
    -- 🚨 hr_l3_114 — THE RECIPIENT, READ BACK RATHER THAN RE-DERIVED. This call used to pass
    -- `null, null`, and hr._wf_notify returns 0 on a null user, so hr.workflow.result_unverified
    -- has never reached one human being — the AR2 event whose whole purpose is that a failed
    -- access shutoff cannot pass unnoticed. hr._wf_failure ALREADY resolved the assignee one
    -- statement ago and stored it on the row it returns; reading it back is the only way to get
    -- it that cannot drift from the assignment itself. Re-running _wf_failure's role query here
    -- would be a second derivation of one fact, and the day the two disagree the person the
    -- inbox says owns the failure is not the person the email went to.
    select f.assigned_employment_id into v_assignee
      from hr.workflow_failure f where f.id = v_fid;
    perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.result_unverified', 'failure',
                          hr._wf_login_of(v_assignee), v_assignee,
                          jsonb_build_object('failure_id', v_fid,
                                             'failure_class', 'result_unverified',
                                             'result_due_at', r.result_due_at));
    v_results := v_results + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 6 — instance expiry (RD 3)
  for r in
    select i.id, d.on_expiry
      from hr.workflow_instance i
      join hr.workflow_definition d on d.id = i.workflow_definition_id
     where i.state = 'active' and i.due_at is not null and now() >= i.due_at
       and d.on_expiry in ('expire','auto_approve','hold')
     order by i.due_at
     limit v_max
  loop
    if r.on_expiry = 'expire' then
      perform hr._wf_close_instance(r.id, 'expired', 'due_at elapsed with on_expiry=expire');
    elsif r.on_expiry = 'auto_approve' then
      perform hr._wf_event(r.id, null, 'timeout_applied', 'active', 'approved', 'automation',
                           null, null, jsonb_build_object('on_expiry','auto_approve'));
      update hr.workflow_instance set state = 'approved', decided_at = now() where id = r.id;
      perform hr._wf_apply(r.id);
    else
      -- `hold` parks the instance VISIBLY: a failure row somebody owns, never a quiet stall.
      perform hr._wf_failure(r.id, null, 'definition_invalid',
        jsonb_build_object('on_expiry','hold',
          'detail','this instance passed its SLA and its definition says hold; a human must decide what happens next'));
    end if;
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object(
    'granted', true, 'ran_at', now(), 'batch_max', v_max,
    'reminders', v_reminders, 'timeout_warnings', v_warned, 'timeouts', v_timeouts,
    'escalations', v_escalated, 'results_unverified', v_results, 'instances_expired', v_expired);
end $function$;

CREATE OR REPLACE FUNCTION hr.wf_escalate(p_step_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; sd hr.workflow_step_definition%rowtype;
        inst hr.workflow_instance%rowtype; v_from uuid; v_res jsonb; u uuid; v_prev uuid[];
begin
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'step_not_found'); end if;
  if st.state <> 'active' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('a step in %s cannot be escalated', st.state));
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  -- 🚨 RD 1: A SELF-STEP CANNOT BE ESCALATED. Escalation re-resolves while EXCLUDING the current
  -- holders, so on an `allows_self` step it excludes the only person who may ever take it and the
  -- rung empties by construction. hr_l3_26 RD 2 already ruled this out in the automated lane —
  -- "escalating an attestation hands somebody else the employee's signature" — via on_expiry=hold.
  -- §8.2 node G is the deadline path here: reminders, then not_attested.
  if sd.allows_self then
    return jsonb_build_object('granted', false, 'reason', 'WF_SELF_STEP_NOT_ESCALATABLE',
      'detail', 'this step is the subject''s own to take, so there is nobody to escalate it to. Close it as not_attested through its failure row, or reassign the step if somebody else should now hold it.',
      'available_actions', jsonb_build_array('not_attested','reassign'));
  end if;

  v_from  := st.resolved_approver_ids[1];
  v_prev  := st.resolved_user_ids;

  perform hr.arm_write();
  perform hr._wf_revoke_step(p_step_id);
  perform hr._wf_unproject_step(p_step_id, 'superseded');

  -- re-resolve EXCLUDING the current holders, using the escalation resolver where one is declared
  update hr.workflow_step set state = 'pending' where id = p_step_id;
  -- VERSION-HISTORY-FIX (2026-09-24): the update of hr.workflow_step_definition that stood here set
  -- resolver_kind to itself: a no-op write (wf_activate_step never reads escalation_resolver_kind)
  -- that moved the definition's version on every escalation, 16,335 phantom versions on 11 rows
  -- on production. Removed; nothing read it.
  v_res := hr.wf_activate_step(p_step_id, st.resolved_approver_ids);

  if not (v_res ->> 'granted')::boolean then
    -- 🚨 RD 2: §1.9 pass 4 requires the FAILURE ROW ("if escalation itself resolves to nobody ->
    -- `unroutable` failure row") and the activation has already opened it — that is untouched. The
    -- spec says nothing about the STEP, and leaving it dead turns a failed improvement into a
    -- regression: before the attempt the request was actionable by its original approver, after it
    -- by nobody. The prior approver set is restored exactly, and the attempt goes on the record.
    update hr.workflow_step
       set state                 = 'active',
           state_reason          = null,
           resolved_approver_ids = st.resolved_approver_ids,
           resolved_user_ids     = st.resolved_user_ids,
           resolution_path       = st.resolution_path,
           activated_at          = st.activated_at,
           due_at                = st.due_at,
           resolution_evidence   = coalesce(st.resolution_evidence, '{}'::jsonb)
                                   || jsonb_build_object('escalation_refused',
                                        jsonb_build_object('at', now(),
                                                           'reason', v_res ->> 'reason',
                                                           'detail', v_res ->> 'detail'))
     where id = p_step_id;
    perform hr._wf_grant_step(p_step_id);
    perform hr._wf_project_step(p_step_id);
    perform hr._wf_event(inst.id, p_step_id, 'escalated', 'active', 'active', 'hr_admin',
                         auth.uid(), null,
                         jsonb_build_object('escalation', 'refused',
                                            'reason', v_res ->> 'reason',
                                            'restored_approver_ids', to_jsonb(st.resolved_approver_ids),
                                            'note', 'escalation found nobody better; the request is exactly as actionable as it was and the failure row records the attempt'));
    return v_res || jsonb_build_object('restored', true,
                                       'restored_approver_ids', to_jsonb(st.resolved_approver_ids));
  end if;

  update hr.workflow_step
     set escalated_at = now(), escalated_from_employment_id = v_from,
         state_reason = coalesce(p_reason, 'escalated')
   where id = p_step_id;
  perform hr._wf_event(inst.id, p_step_id, 'escalated', 'active', 'active', 'automation', null, null,
                       jsonb_build_object('from_employment_id', v_from, 'reason', p_reason));
  -- the new approver AND the escalated-from holder are both told (§6.1)
  select coalesce(array_agg((x)::uuid),'{}'::uuid[]) into v_prev
    from jsonb_array_elements_text(v_res -> 'user_ids') x;
  foreach u in array v_prev loop
    perform hr._wf_notify(inst.id, p_step_id, 'hr.workflow.step_escalated', 'escalation', u, null,
                          jsonb_build_object('reason', p_reason, 'from_employment_id', v_from));
  end loop;
  perform hr._wf_notify(inst.id, p_step_id, 'hr.workflow.step_escalated', 'escalation',
                        hr._wf_login_of(v_from), v_from,
                        jsonb_build_object('reason', p_reason, 'escalated_away', true));
  return v_res;
end $function$;

-- The provision guard asks every replaced SECURITY DEFINER body for its access decision IN DATA.
-- hr.wf_escalate never had one (it predates the door register); it is declared here as what it is:
-- EXECUTE is held by postgres and service_role only (proacl read 2026-09-23), and it is reached
-- from hr.wf_tick and from the signed-in door public.hr_wf_escalate, which resolves its caller
-- before delegating. Same shape as its sibling hr.wf_activate_step's row.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('hr', 'wf_escalate', 'p_step_id uuid, p_reason text', array['uuid'::regtype, 'text'::regtype]::oid[],
        'Server-internal HR helper. p_step_id is a row selector, not an authorization input: hr.wf_tick (service lane) and public.hr_wf_escalate (which resolves the signed-in caller and checks their HR capability first) establish identity before delegating here. NULL rule: a NULL or unmatched p_step_id returns {"granted": false, "reason": "step_not_found"} and writes nothing.',
        'versionhistoryfix_c_the_hr_sweep_stops_re_saving_what_did_not_change',
        'server_only: no client role holds EXECUTE on hr.wf_escalate (proacl is postgres and service_role only); it is reached from hr.wf_tick and from the public.hr_wf_escalate door, never over PostgREST.',
        false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

CREATE OR REPLACE FUNCTION public.wsp_upsert_system_task(p_dedupe_key text, p_title text, p_description text DEFAULT NULL::text, p_origin text DEFAULT 'system'::text, p_source_type text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text, p_source_url text DEFAULT NULL::text, p_source_label text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_priority text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'workspace'
AS $function$
declare
  v_org uuid;
  v_existing workspace.tasks%rowtype;
  v_id uuid;
begin
  if p_dedupe_key is null or length(trim(p_dedupe_key)) = 0 then
    raise exception 'wsp_upsert_system_task: dedupe_key is required';
  end if;
  -- THE CALL NAMES IT. The coalesce meant a system task raised for a person's work
  -- landed in their private workspace whenever the caller forgot the argument, where
  -- nobody else on their team could ever see it.
  v_org := p_organization_id;
  if v_org is null then
    raise exception 'Name the organization this task belongs to.'
      using errcode = '23502', hint = 'Pass p_organization_id.';
  end if;

  select * into v_existing from workspace.tasks
   where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
   limit 1;

  if found then
    if v_existing.status in ('completed','cancelled','dismissed') then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    update workspace.tasks
       set title = p_title,
           description = coalesce(p_description, description),
           due_date = coalesce(p_due_date, due_date),
           source_url = coalesce(p_source_url, source_url),
           source_label = coalesce(p_source_label, source_label),
           updated_at = now()
     where id = v_existing.id
       -- VERSION-HISTORY-FIX (2026-09-24): COMPARE FIRST. A projector re-sending what the task already
       -- says (hr._wf_project_step on every sweep) wrote the row anyway, 16,333 phantom versions on 9
       -- approval tasks on production. An unchanged task is left alone.
       and (title, description, due_date, source_url, source_label)
           is distinct from (p_title, coalesce(p_description, description), coalesce(p_due_date, due_date),
                             coalesce(p_source_url, source_url), coalesce(p_source_label, source_label));
    return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
  end if;

  begin
    insert into workspace.tasks (
      title, description, status, origin, source_type, source_id, source_url, source_label,
      dedupe_key, due_date, priority, assignee_id, organization_id, project_id,
      metadata, created_by
    ) values (
      p_title, p_description, 'inbox', coalesce(p_origin, 'system'),
      p_source_type, p_source_id, p_source_url, p_source_label,
      p_dedupe_key, p_due_date,
      nullif(p_priority, '')::task_priority,
      coalesce(p_assignee_id, (select auth.uid())), v_org, p_project_id,
      coalesce(p_metadata, '{}'::jsonb), (select auth.uid())
    ) returning id into v_id;
    return jsonb_build_object('id', v_id, 'created', true, 'status', 'inbox');
  exception when unique_violation then
    -- Lost a race (or the row exists but RLS hid it from our select).
    select * into v_existing from workspace.tasks
     where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
     limit 1;
    if found then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    return jsonb_build_object('id', null, 'created', false, 'status', null, 'reason', 'exists_not_visible');
  end;
end;
$function$;
