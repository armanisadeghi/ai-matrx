-- chair-step: it REPLACES two HR function bodies, `hr._wf_unproject_step(uuid,text)` and
--   `hr._wf_project_step(uuid)`, so a superseded approval task is really closed (or the failure is
--   recorded by name), and a holder the step is handed back to gets their task back; it declares
--   hr._wf_unproject_step's (missing) server-only row in platform.client_callable_door, which the
--   provision guard requires of a replaced SECURITY DEFINER body; and it REPAIRS the approval tasks
--   the silent failure left open on closed steps (6 on production, SELECT-only 2026-09-22), one
--   `history.migration_log` line each. No table, trigger, grant or policy is touched.
--   `create or replace function` takes ACCESS SHARE; the repair takes row locks on those tasks
--   only: not window-class. The inverse puts both production bodies back verbatim and reopens the
--   repaired tasks:
--   `migrations/inverse/hrloopcleanup_b_a_superseded_approval_task_closes_or_says_why_down.sql`.
-- lock: platform
-- lane: HR-LOOP-CLEANUP
-- based-on: hr._wf_unproject_step(uuid, text) 37d96ce22ded6d3c3aa6a326a4468b7fa0a97e2cb2e3de9ddf4af08d4b52fa7e
-- based-on: hr._wf_project_step(uuid) d664692a89016d61b7ea3748282455a62d979ab59710173625127af742324c6e
--
-- HR-LOOP-CLEANUP, LEFTOVER 3 — `hr._wf_unproject_step(..., 'superseded')` FAILED SILENTLY.
--
-- WHY. Six callers close an approval holder's task with the outcome 'superseded' (wf_escalate,
-- wf_reassign_step, _wf_target_changed, _wf_close_instance, and _wf_close_step twice). The body
-- handed that word straight to `public.wsp_resolve_system_task`, which accepts only completed /
-- cancelled / dismissed and RAISES `invalid outcome superseded`; the body wrapped each call in
-- `exception when others then null` and counted it as closed anyway. So every withdrawn, cancelled,
-- reassigned or escalated request left its approver's task sitting open in their inbox, and the
-- function reported that it had closed it. Production today: 6 approval tasks open on steps that
-- were cancelled (withdrawn leave requests and a superseded timecard approval at Oak Street
-- Studio).
--
-- WHY THE FIX IS NOT JUST "MAP superseded TO cancelled". wf_escalate's refused path (RD 2) and
-- wf_reassign_step unproject the step and then PROJECT it again, often to the same holder. The
-- projector goes through wsp_upsert_system_task, which leaves a closed task closed — so a naive
-- cancel would take the task away from the very person the step was just handed back to. So:
--   1. `_wf_unproject_step` maps 'superseded' to the task status 'cancelled' and stamps the task
--      `metadata.hr_superseded = {at, step_id, prior_status}` in the same single write.
--      completed / cancelled / dismissed go through the door as before. ANY OTHER outcome is a
--      named refusal (SQLSTATE 22023) — a caller bug, never swallowed. A task that cannot be closed
--      for any other reason is recorded: an `unprojection_failed` workflow event (sqlstate, detail,
--      outcome, holder), the same shape `_wf_project_step` has always written as
--      `projection_failed`, plus a WARNING. It returns the number of tasks it ACTUALLY closed.
--   2. `_wf_project_step` reopens, before it upserts, a task of this same step and holder that is
--      'cancelled' AND carries `hr_superseded` — to its prior status — so the holder the step is
--      handed back to has their task again. A task a person completed, or cancelled by hand (no
--      stamp), is never reopened.
-- Proof: scripts/campaign-tests/hrloopcleanup_green.sql clauses 3–6, RED on the clone before this
-- file (clause 3: "the superseded task is still inbox, and the function said it closed 1").

set local lock_timeout = '5s';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('hr', '_wf_unproject_step', 'p_step uuid, p_outcome text', array['uuid'::regtype, 'text'::regtype]::oid[],
        'Server-internal HR helper. p_step is a row selector, not an authorization input: its callers (hr.wf_escalate, hr.wf_reassign_step, hr._wf_target_changed, hr._wf_close_instance, hr._wf_close_step) establish identity and capability before delegating here. NULL rule: a NULL or unmatched p_step returns 0 and writes nothing; an outcome outside completed/cancelled/dismissed/superseded raises 22023.',
        'hrloopcleanup_b_a_superseded_approval_task_closes_or_says_why',
        'server_only: no client role holds EXECUTE on hr._wf_unproject_step (proacl is postgres and service_role only); it is reached only from other HR SECURITY DEFINER functions, never over PostgREST.',
        false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

CREATE OR REPLACE FUNCTION hr._wf_unproject_step(p_step uuid, p_outcome text DEFAULT 'completed'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0; v_org uuid;
        v_status text; v_key text; v_res jsonb; v_rows integer;
begin
  -- HR-LOOP-CLEANUP (2026-09-24): 'superseded' is a WORKFLOW word; the task door speaks
  -- completed / cancelled / dismissed. It used to be passed through, raise inside the door, and be
  -- swallowed below — so a superseded approver's task never closed while this counted it closed.
  v_status := case p_outcome when 'superseded' then 'cancelled'
                             when 'completed'  then 'completed'
                             when 'cancelled'  then 'cancelled'
                             when 'dismissed'  then 'dismissed' end;
  if v_status is null then
    raise exception 'hr._wf_unproject_step: % is not an outcome an approval task closes with (completed, cancelled, dismissed, superseded)', p_outcome
      using errcode = '22023';
  end if;

  select * into st from hr.workflow_step where id = p_step;
  if not found then return 0; end if;
  v_org := st.organization_id;
  foreach u in array coalesce(st.resolved_user_ids, '{}'::uuid[]) loop
    v_key := 'hrwf:' || p_step::text || ':' || u::text;
    begin
      if p_outcome = 'superseded' then
        -- One write: the status and the stamp hr._wf_project_step reads to hand the task back if
        -- this step is projected to the same holder again (wf_escalate RD 2, wf_reassign_step).
        update workspace.tasks t
           set status = 'cancelled', updated_at = now(),
               metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object('hr_superseded',
                            jsonb_build_object('at', now(), 'step_id', p_step, 'prior_status', t.status))
         where t.organization_id = v_org and t.dedupe_key = v_key and t.deleted_at is null
           and t.status not in ('completed', 'cancelled', 'dismissed');
        get diagnostics v_rows = row_count;
        v_n := v_n + v_rows;
      else
        v_res := public.wsp_resolve_system_task(v_key, v_status, v_org);
        if coalesce((v_res ->> 'resolved')::boolean, false) then
          v_n := v_n + 1;
        end if;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: the step still closes, and the task that did not is on the record.
      perform hr._wf_event(st.workflow_instance_id, p_step, 'unprojection_failed', null, null,
                           'automation', null, null,
                           jsonb_build_object('sqlstate', sqlstate, 'detail', sqlerrm,
                                              'outcome', p_outcome, 'user_id', u, 'dedupe_key', v_key));
      raise warning 'hr._wf_unproject_step: the approval task % was not closed (% %); recorded as an unprojection_failed event', v_key, sqlstate, sqlerrm;
    end;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION hr._wf_project_step(p_step uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
  d jsonb; u uuid; v_n integer := 0; v_task uuid;
begin
  if not (hr._hr_knob('hr.workflow', 'inbox_project_tasks', (select ws.organization_id from hr.workflow_step ws where ws.id = p_step), null) #>> '{}')::boolean then return 0; end if;
  select * into st   from hr.workflow_step where id = p_step;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  -- 🚨 `true` is load-bearing: workspace.tasks is internal-visibility machinery shared with the
  -- general /tasks list, and the sensitivity split has to survive the projection.
  d := hr._wf_display(p_step, true);

  foreach u in array st.resolved_user_ids loop
    -- HR-LOOP-CLEANUP (2026-09-24): the step is this holder's again (an escalation that found
    -- nobody better, a reassignment back), so the task hr._wf_unproject_step cancelled as
    -- SUPERSEDED is theirs again, at the status it had. A task someone completed, or cancelled by
    -- hand, carries no stamp and is never reopened.
    update workspace.tasks t
       set status = coalesce(t.metadata -> 'hr_superseded' ->> 'prior_status', 'inbox'),
           metadata = t.metadata - 'hr_superseded', updated_at = now()
     where t.organization_id = inst.organization_id
       and t.dedupe_key = 'hrwf:' || p_step::text || ':' || u::text
       and t.deleted_at is null and t.status = 'cancelled' and t.metadata ? 'hr_superseded';
    v_task := (public.wsp_upsert_system_task(
      p_dedupe_key      => 'hrwf:' || p_step::text || ':' || u::text,
      p_title           => d ->> 'title',
      p_description     => d ->> 'step_label',
      p_origin          => 'system',
      p_source_type     => 'hr_workflow_step',
      p_source_id       => p_step::text,
      p_source_url      => '/hr/tasks/' || inst.id::text || '?org=' || inst.organization_id::text || '&step=' || p_step::text,
      p_source_label    => 'HR approvals',
      p_due_date        => st.due_at::date,
      p_priority        => case inst.priority when 'low' then 'low'
                                              when 'urgent' then 'high'
                                              when 'high' then 'high'
                                              else 'medium' end,
      p_assignee_id     => u,
      p_organization_id => inst.organization_id,
      p_metadata        => jsonb_build_object('flow_key', inst.flow_key, 'instance_id', inst.id,
                                              'sensitivity_tier', inst.sensitivity_tier)) ->> 'id')::uuid;
    v_n := v_n + 1;
    if st.workspace_task_id is null and v_task is not null then
      perform hr.arm_write();
      update hr.workflow_step set workspace_task_id = v_task where id = p_step;
    end if;
  end loop;
  return v_n;
exception when others then
  perform hr._wf_event(st.workflow_instance_id, p_step, 'projection_failed', null, null,
                       'automation', null, null,
                       jsonb_build_object('sqlstate', sqlstate, 'detail', sqlerrm));
  return 0;
end $function$;

-- THE REPAIR: approval tasks the silent failure left open. A task is stale when its step is
-- closed, or when its holder no longer holds the step. It closes the way _wf_close_step would have
-- closed it (a decided step's tasks complete; every other closed state is a supersession), with the
-- same stamp, and one migration_log line carrying its prior status for the inverse.
create temporary table _hlc_tasks on commit drop as
select t.id, t.organization_id, t.status as status_before, s.id as step_id, s.state as step_state,
       case when s.state in ('approved', 'auto_approved', 'rejected', 'returned') then 'completed'
            else 'cancelled' end as status_after
  from workspace.tasks t
  join hr.workflow_step s on s.id::text = split_part(t.dedupe_key, ':', 2)
 where t.dedupe_key like 'hrwf:%' and t.deleted_at is null
   and t.status not in ('completed', 'cancelled', 'dismissed')
   and (s.state not in ('pending', 'active', 'awaiting_result')
        or not (split_part(t.dedupe_key, ':', 3) = any (coalesce(s.resolved_user_ids, '{}'::uuid[])::text[])));

insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
select x.organization_id, 'approval_task_closed_with_its_step', 'task', x.id,
       jsonb_build_object('kind', 'restore', 'lane', 'HR-LOOP-CLEANUP',
                          'status_before', x.status_before, 'status_after', x.status_after),
       format('HR-LOOP-CLEANUP (2026-09-24): approval task %s -> %s. Its step %s is %s; hr._wf_unproject_step failed silently when the step closed, so the task stayed open.',
              x.status_before, x.status_after, x.step_id, x.step_state)
  from _hlc_tasks x;

update workspace.tasks t
   set status = x.status_after, updated_at = now(),
       completed_at = case when x.status_after = 'completed' then now() else t.completed_at end,
       metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object('hr_superseded',
                    jsonb_build_object('at', now(), 'step_id', x.step_id, 'prior_status', x.status_before,
                                       'lane', 'HR-LOOP-CLEANUP'))
  from _hlc_tasks x
 where t.id = x.id;

do $receipt$
begin
  raise notice 'HR-LOOP-CLEANUP: 2 bodies replaced; % stale approval task(s) closed with their step (% cancelled, % completed)',
    (select count(*) from _hlc_tasks), (select count(*) from _hlc_tasks where status_after = 'cancelled'),
    (select count(*) from _hlc_tasks where status_after = 'completed');
end
$receipt$;
