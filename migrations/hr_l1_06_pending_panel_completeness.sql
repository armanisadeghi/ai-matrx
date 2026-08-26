-- HR domain L1 — migration 6 of 6 (register item HRB-013, lane l1-employees).
--
-- THE PENDING PANEL'S TWO MISSING FACTS. `hr_pending_changes` gains the PRIOR value of every
-- future-dated row and the RESOLVED CURRENT APPROVER of every in-flight instance.
--
-- Authority: SPEC-EMPLOYEES §6.2. Applied live as `hr_l1_06_pending_panel_completeness`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 23 — THE CLIENT MUST NEVER INVENT A "WAS".
--
-- §6.2 requires the pending panel to list, per future-dated row, **"what changes, FROM WHAT TO
-- WHAT, its effective date, who requested it, its approval state, and — for anything still in
-- flight — its CURRENT APPROVER."** The first shipped `hr_pending_changes` returned only the
-- future row and the instance's `current_step` key. Caught by the client agent building the
-- panel, which correctly refused to reconstruct the prior value client-side: a guessed "was"
-- is a fabricated audit statement, and this panel is read in exactly the conversations where
-- that matters.
--
-- Both facts are in the database and neither was being returned:
--   · the prior value hangs off `supersedes_id`, which every amendment already sets
--     (hr_l1_03's `hr._l1_apply_position` / `_apply_compensation`);
--   · the current approver is `hr.workflow_step.resolved_approver_ids` on the ACTIVE step,
--     resolved to display names through the employment → employee join.
--
-- A row whose `supersedes_id` is null is a FIRST assignment, not a change — it comes back with
-- `previous: null` and `is_first: true` so the panel can say "starts as" rather than an empty
-- "from". Absence is reported as absence; it is never rendered as a blank.
--
-- The comp lane stays gated: `previous` on a compensation row is returned only to a viewer who
-- already passed the `comp.read` gate for the current row, because a prior salary is a salary.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

create or replace function public.hr_pending_changes(p_employment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_on date := current_date; v_emp_id uuid; v_v jsonb; v_kind text;
  v_comp boolean;
begin
  if v_uid is null then
    raise exception 'hr_pending_changes: no authenticated caller' using errcode = '42501';
  end if;
  select em.employee_id into v_emp_id from hr.employment em where em.id = p_employment_id;
  if v_emp_id is null then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_v := hr._l1_viewer(v_uid, v_emp_id, v_on);
  v_kind := coalesce(v_v ->> 'kind', 'none');
  if v_kind in ('none','peer') then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_comp := v_kind = 'self' or hr.capability(v_uid, 'comp.read', p_employment_id, v_on);

  return jsonb_build_object(
    'granted', true,
    'positions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'kind', 'position', 'effective_from', pa.effective_from,
        'job_title', jt.title, 'department', d.name, 'location', l.name,
        'manager_employment_id', pa.manager_employment_id,
        'fte', pa.fte, 'worker_class', pa.worker_class, 'flsa_status', pa.flsa_status,
        'change_reason', cat.name,
        'supersedes_id', pa.supersedes_id,
        'is_first', pa.supersedes_id is null,
        'requested_by', req.display_name,
        -- RECORDED DECISION 23: the FROM half, straight off supersedes_id. Never guessed.
        'previous', case when prev.id is null then null else jsonb_build_object(
            'id', prev.id, 'effective_from', prev.effective_from,
            'job_title', pjt.title, 'department', pd.name, 'location', pl.name,
            'manager_employment_id', prev.manager_employment_id,
            'fte', prev.fte, 'worker_class', prev.worker_class,
            'flsa_status', prev.flsa_status) end,
        'changed_fields', case when prev.id is null then '[]'::jsonb else (
            select coalesce(jsonb_agg(f), '[]'::jsonb) from (
              select 'job_title' as f where prev.job_title_id is distinct from pa.job_title_id
              union all select 'department' where prev.department_id is distinct from pa.department_id
              union all select 'location' where prev.location_id is distinct from pa.location_id
              union all select 'manager' where prev.manager_employment_id is distinct from pa.manager_employment_id
              union all select 'fte' where prev.fte is distinct from pa.fte
              union all select 'worker_class' where prev.worker_class is distinct from pa.worker_class
              union all select 'flsa_status' where prev.flsa_status is distinct from pa.flsa_status
            ) s) end,
        'can_cancel', true) order by pa.effective_from), '[]'::jsonb)
      from hr.position_assignment pa
      left join hr.job_title jt on jt.id = pa.job_title_id
      left join hr.department d on d.id = pa.department_id
      left join hr.location l on l.id = pa.location_id
      left join platform.categories cat on cat.id = pa.change_reason_category_id
      left join hr.employee req on req.login_user_id = pa.created_by
                               and req.organization_id = pa.organization_id
      left join hr.position_assignment prev on prev.id = pa.supersedes_id
      left join hr.job_title  pjt on pjt.id = prev.job_title_id
      left join hr.department pd  on pd.id  = prev.department_id
      left join hr.location   pl  on pl.id  = prev.location_id
     where pa.employment_id = p_employment_id and pa.deleted_at is null
       and pa.effective_from > v_on),

    'compensation', case when v_comp then (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', 'compensation', 'effective_from', c.effective_from,
        'component_kind', c.component_kind, 'amount', c.amount, 'currency', c.currency,
        'per_unit', c.per_unit, 'pay_basis', c.pay_basis,
        'change_reason', cat.name, 'approved_at', c.approved_at,
        'approved_by', appr.display_name,
        'supersedes_id', c.supersedes_id,
        'is_first', c.supersedes_id is null,
        -- a prior salary is a salary: only returned inside the comp lane the row already needed
        'previous', case when pc.id is null then null else jsonb_build_object(
            'id', pc.id, 'effective_from', pc.effective_from, 'amount', pc.amount,
            'currency', pc.currency, 'per_unit', pc.per_unit, 'pay_basis', pc.pay_basis) end,
        'delta', case when pc.id is null then null else c.amount - pc.amount end,
        'can_cancel', true) order by c.effective_from), '[]'::jsonb)
      from hr.compensation c
      left join platform.categories cat on cat.id = c.change_reason_category_id
      left join hr.compensation pc on pc.id = c.supersedes_id
      left join hr.employment aem on aem.id = c.approved_by_employment_id
      left join hr.employee appr on appr.id = aem.employee_id
     where c.employment_id = p_employment_id and c.deleted_at is null
       and c.effective_from > v_on) else '[]'::jsonb end,

    'reporting_lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', rl.id, 'kind', 'reporting_line', 'effective_from', rl.effective_from,
        'line_kind', rl.line_kind, 'manager_employment_id', rl.manager_employment_id,
        'manager_name', mgr.display_name,
        'supersedes_id', rl.supersedes_id, 'is_first', rl.supersedes_id is null,
        'previous', case when prl.id is null then null else jsonb_build_object(
            'id', prl.id, 'line_kind', prl.line_kind,
            'manager_employment_id', prl.manager_employment_id) end,
        'can_cancel', true) order by rl.effective_from), '[]'::jsonb)
      from hr.reporting_line rl
      left join hr.reporting_line prl on prl.id = rl.supersedes_id
      left join hr.employment mem on mem.id = rl.manager_employment_id
      left join hr.employee mgr on mgr.id = mem.employee_id
     where rl.employment_id = p_employment_id and rl.deleted_at is null
       and rl.effective_from > v_on),

    'in_flight', (select coalesce(jsonb_agg(jsonb_build_object(
        'instance_id', wi.id, 'flow_key', wi.flow_key, 'state', wi.state,
        'target_token', wi.target_token, 'target_id', wi.target_id,
        'submitted_at', wi.submitted_at, 'due_at', wi.due_at,
        'payload', case when v_comp or wi.flow_key <> 'pay_change' then wi.payload end,
        'current_step', act.step_key,
        'current_step_label', act.label,
        'current_step_due_at', act.due_at,
        -- RECORDED DECISION 23: the approver, by NAME. §6.2 asks who it is sitting with, and
        -- "Now with: hr_approval" is a step key, not an answer.
        'current_approvers', coalesce(act.approvers, '[]'::jsonb),
        'approvals_needed', act.approvals_needed,
        'approvals_received', act.approvals_received)
      order by wi.created_at desc), '[]'::jsonb)
      from hr.workflow_instance wi
      left join lateral (
        select ws.step_key, sd.label, ws.due_at, ws.approvals_needed, ws.approvals_received,
               (select coalesce(jsonb_agg(jsonb_build_object(
                          'employment_id', ae.employment_id, 'display_name', e2.display_name)
                        order by e2.display_name), '[]'::jsonb)
                  from unnest(ws.resolved_approver_ids) as ae(employment_id)
                  join hr.employment aem2 on aem2.id = ae.employment_id
                  join hr.employee e2 on e2.id = aem2.employee_id) as approvers
          from hr.workflow_step ws
          left join hr.workflow_step_definition sd on sd.id = ws.step_definition_id
         where ws.workflow_instance_id = wi.id and ws.state = 'active'
         order by ws.step_order limit 1) act on true
     where wi.subject_employment_id = p_employment_id
       and wi.state in ('draft','submitted','in_review','conflict')
       and wi.deleted_at is null));
end
$fn$;

do $$ begin
  execute 'revoke all on function public.hr_pending_changes(uuid) from public, anon';
  execute 'grant execute on function public.hr_pending_changes(uuid) to authenticated, service_role';
end $$;

-- ============================================================ assertions

do $$
declare v_src text; v_bad integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pending_changes';

  -- §6.2's two facts, each proven present rather than asserted in a comment
  if v_src not like '%supersedes_id%' or v_src not like '%''previous''%' then
    raise exception 'hr_l1_06: hr_pending_changes does not return the prior value (§6.2 "from what to what")';
  end if;
  if v_src not like '%resolved_approver_ids%' then
    raise exception 'hr_l1_06: hr_pending_changes does not resolve the current approver (§6.2)';
  end if;

  if has_function_privilege('anon', 'public.hr_pending_changes(uuid)', 'execute') then
    raise exception 'hr_l1_06: hr_pending_changes is executable by anon';
  end if;

  select count(*) into v_bad
    from platform.ddl_guard_log
   where acknowledged_at is null
     and (object_ref like 'hr.\_l1%' or object_ref like 'public.hr\_%');
  if v_bad > 0 then
    raise exception 'hr_l1_06: % unacked DDL guard row(s) on this file''s objects', v_bad;
  end if;
end $$;
