-- hr_l1_70 — ONE ACTOR PER ROW, NOT ONE ROW PER ACTOR.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 THE DEFECT. Three HR doors resolved a person by their LOGIN — `hr.employee.login_user_id =
-- <some actor column>` — as an ordinary LEFT JOIN inside a row-producing `jsonb_agg`. A login is
-- NOT a key on `hr.employee`: there is no unique index on `login_user_id`, and after the rehire /
-- restore work (hr_l1_66 · 67 · 68) TWO un-archived `hr.employee` rows sharing ONE login in ONE
-- organization is a SUPPORTED shape, not a corruption. When that shape exists, the join stops
-- being a lookup and becomes a multiplier: every row of the outer query comes back once PER
-- matching employee row.
--
--   `public.hr_employment_history`  · `left join hr.employee act on act.login_user_id = pa.created_by`
--                                     — DUPLICATED EVERY POSITION ASSIGNMENT in the Job tab.
--   `public.hr_pending_changes`     · `left join hr.employee req on req.login_user_id = pa.created_by`
--                                     — duplicated every PENDING position change.
--   `hr.member_employee_links`      · `left join hr.employee e on e.login_user_id = u.uid`
--                                     — returned ONE MEMBER TWICE on the member↔employee seam.
--
-- 🚨 WHAT IS AND IS NOT HAPPENING IN PRODUCTION TODAY — MEASURED, NOT ASSUMED. One live
-- organization already holds the shape: `2643e470…` has `G2V-Priya Raman` (782e1d1e…) and
-- `Zzz Linkprobe` (a1c0e2ad…), both un-archived, both on login `20149d3f…`.
--   · `hr.member_employee_links` IS WRONG RIGHT NOW. Called for that member it returns TWO link
--     objects for one `user_id` — one `"directory_status": "active"`, one `"prehire"` — so the
--     seam contradicts itself and a caller keyed on `user_id` gets whichever arrives last.
--     Captured verbatim as the RED control before this migration.
--   · `hr_employment_history` and `hr_pending_changes` are ARMED BUT NOT YET FIRING. All 37 live
--     position assignments were recorded by ONE login (`87a6e699…`), which maps to exactly one
--     employee row in each org it appears in, so nothing duplicates today. The filed report said
--     a real employer's history door was returning duplicated rows; the SHAPE is live, the
--     DUPLICATION is not — the first assignment recorded by a shared login lights it up. RED was
--     therefore CONSTRUCTED, in a rolled-back transaction: re-pointing one employee's three
--     assignments at the shared login made the door return 6 rows for 3 assignments, with
--     `recorded_by` alternating "G2V-Priya Raman" / "Zzz Linkprobe".
--
-- 🎯 THE FIX KEYS ON WHAT IDENTIFIES THE ROW. The outer row — a position assignment, or one
-- requested `user_id` — is the thing being listed, and it must appear exactly once. So the actor
-- lookup becomes a LEFT JOIN LATERAL … LIMIT 1: by construction it contributes exactly one row
-- per outer row, so the cardinality of the result is the cardinality of the subject table and
-- cannot be changed by how many employee records happen to share a login. This is DEDUPLICATION
-- BY CONSTRUCTION, not `distinct` — no legitimately distinct assignment can be collapsed away,
-- because no assignment is ever compared to another one.
--
-- The pick is DETERMINISTIC and states its preference out loud rather than taking an arbitrary
-- row: a live record before an archived one, and — where the answer is the SUBJECT rather than a
-- byline (`member_employee_links`) — an employee who actually holds an employment before one who
-- does not, then oldest record, then id. For a byline (`recorded_by`, `requested_by`) the rows
-- are one human's login either way, so any stable choice is the same answer.
--
-- 🚨 AND THE SEAM DOES NOT SILENTLY LOSE THE SECOND RECORD. `member_employee_links` exists to
-- answer "who is this member, as an employee" for an administrator; picking one row and saying
-- nothing would trade a visible duplicate for an invisible omission. It now also returns
-- `linked_employee_count` — the true number of employee records on that login in that employer
-- (computed as a window over the full match set, BEFORE the limit). It is 1 for everyone in this
-- database except the one member above, where it is 2.
--
-- 🚨 THE CENSUS OF THE CLASS. Every function in schema `hr` and every `public.hr_*` function was
-- read for a login-shaped join (`login_user_id` = `created_by` / `recorded_by` / `updated_by` /
-- any actor column) that can multiply rows, and for its quieter twin — a bare scalar subquery on
-- the same key, which does not duplicate but RAISES "more than one row returned by a subquery".
-- THREE functions were affected and all three are fixed here. Everything else is fan-out-immune
-- on its own terms and was left alone: keyed on `hr.employee.id` or `hr.employment.id` (unique),
-- or wrapped in `exists(…)`, `array_agg(distinct …)`, another aggregate, or an explicit `limit 1`.
-- No shape-B scalar subquery exists anywhere in the swept set.

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 — the employment history: the Job tab lists each assignment once.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_employment_history(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_v jsonb; v_kind text; v_on date := current_date;
begin
  if v_uid is null then
    raise exception 'hr_employment_history: no authenticated caller' using errcode = '42501';
  end if;
  v_v := hr._l1_viewer(v_uid, p_employee_id, v_on);
  if v_v is null or (v_v ->> 'kind') in ('none') then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_kind := v_v ->> 'kind';
  if v_kind = 'peer' then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  return jsonb_build_object(
    'granted', true,
    'spells', (select coalesce(jsonb_agg(jsonb_build_object(
        'employment_id', em.id, 'spell_number', em.spell_number, 'status', em.status,
        'hire_date', em.hire_date, 'original_hire_date', em.original_hire_date,
        'adjusted_service_date', em.adjusted_service_date,
        'probation_end_date', em.probation_end_date,
        'last_day_worked', em.last_day_worked, 'termination_date', em.termination_date,
        'is_rehire', em.is_rehire, 'prior_employment_id', em.prior_employment_id,
        'pay_group_id', em.pay_group_id,
        'employer_profile_id', em.employer_profile_id,
        'separation_id', case when v_kind = 'hr_admin' then em.separation_id end
      ) order by em.spell_number desc), '[]'::jsonb)
      from hr.employment em where em.employee_id = p_employee_id and em.deleted_at is null),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'employment_id', pa.employment_id,
        'job_title_id', pa.job_title_id, 'job_title', jt.title,
        'department_id', pa.department_id, 'department', d.name,
        'location_id', pa.location_id, 'location', l.name, 'timezone', l.tz,
        'jurisdiction_id', l.jurisdiction_id,
        'manager_employment_id', pa.manager_employment_id,
        'manager_name', mgr.display_name,
        'is_primary', pa.is_primary, 'worker_class', pa.worker_class,
        'flsa_status', pa.flsa_status, 'flsa_exemption_basis', pa.flsa_exemption_basis,
        'pay_basis', pa.pay_basis, 'schedule_class', pa.schedule_class,
        'fte', pa.fte, 'standard_hours_per_week', pa.standard_hours_per_week,
        'is_supervisor', pa.is_supervisor, 'cost_center', pa.cost_center,
        'eeo1_job_category', pa.eeo1_job_category,
        'effective_from', pa.effective_from, 'effective_to', pa.effective_to,
        'supersedes_id', pa.supersedes_id,
        'change_reason', cat.name,
        'recorded_at', pa.recorded_at,
        'recorded_by', act.display_name,
        'actor_type', coalesce(pa.metadata ->> 'actor_type', 'hr_admin'),
        'workflow_instance_id', pa.metadata ->> 'workflow_instance_id',
        'is_pending', pa.effective_from > v_on
      ) order by pa.effective_from desc, pa.recorded_at desc), '[]'::jsonb)
      from hr.position_assignment pa
      join hr.employment em on em.id = pa.employment_id and em.employee_id = p_employee_id
      left join hr.job_title jt on jt.id = pa.job_title_id
      left join hr.department d on d.id = pa.department_id
      left join hr.location l on l.id = pa.location_id
      left join hr.employment mem on mem.id = pa.manager_employment_id
      left join hr.employee mgr on mgr.id = mem.employee_id
      left join platform.categories cat on cat.id = pa.change_reason_category_id
      -- 🚨 ONE ACTOR PER ASSIGNMENT — A LOGIN IS NOT A KEY ON hr.employee (hr_l1_70).
      -- This was an ordinary equi-join from `pa.created_by` to the employee's login, narrowed by
      -- organization. (The old expression is NOT quoted here: this door's own contract BANS that
      -- text, and a pin cannot tell a call from a comment — the same trap the in_flight note in
      -- hr_pending_changes documents.) `login_user_id` carries no unique index, and
      -- two un-archived employee rows sharing one login in one employer is a SUPPORTED shape
      -- after the rehire/restore work — so the join multiplied every assignment once per
      -- matching employee row and the Job tab listed each job twice. Measured: 6 rows for 3
      -- assignments, `recorded_by` alternating between the two records.
      -- LATERAL … LIMIT 1 contributes exactly one row per assignment BY CONSTRUCTION, so the
      -- result's cardinality is the assignment table's and nothing can collapse two genuinely
      -- different assignments together. The order is stated so the byline is stable, not
      -- arbitrary: a live record before an archived one, then the oldest, then by id.
      left join lateral (
        select a.display_name
          from hr.employee a
         where a.login_user_id = pa.created_by
           and a.organization_id = em.organization_id
         order by (a.deleted_at is null) desc, a.created_at, a.id
         limit 1) act on true
     where pa.deleted_at is null),
    'reporting_lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', rl.id, 'employment_id', rl.employment_id,
        'manager_employment_id', rl.manager_employment_id, 'line_kind', rl.line_kind,
        'scope_note', rl.scope_note, 'effective_from', rl.effective_from,
        'effective_to', rl.effective_to, 'is_pending', rl.effective_from > v_on)
      order by rl.effective_from desc), '[]'::jsonb)
      from hr.reporting_line rl
      join hr.employment em on em.id = rl.employment_id and em.employee_id = p_employee_id
     where rl.deleted_at is null),
    'external_identities', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', xi.id, 'system_key', xi.system_key, 'external_id', xi.external_id,
        'external_url', xi.external_url, 'synced_at', xi.synced_at) order by xi.system_key), '[]'::jsonb)
      from hr.external_identity xi
     where xi.employee_id = p_employee_id and xi.deleted_at is null),
    'engagements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'employment_id', g.employment_id,
        'platform_of_record', g.platform_of_record,
        'platform_external_id', g.platform_external_id, 'platform_url', g.platform_url,
        'engagement_terms', g.engagement_terms, 'starts_on', g.starts_on, 'ends_on', g.ends_on,
        'auto_renew', g.auto_renew, 'status', g.status,
        'sow_file_id', g.sow_file_id, 'w9_file_id', g.w9_file_id,
        'agreement_file_id', g.agreement_file_id) order by g.starts_on desc), '[]'::jsonb)
      from hr.engagement g
      join hr.employment em on em.id = g.employment_id and em.employee_id = p_employee_id
     where g.deleted_at is null));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — the pending-changes door: one entry per scheduled change.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_pending_changes(p_employment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
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
      -- 🚨 ONE REQUESTER PER PENDING CHANGE (hr_l1_70) — the same defect the Job tab carried,
      -- in the same construction. A plain join on `req.login_user_id = pa.created_by` listed
      -- one scheduled change twice, with a different name on each copy, the moment two employee
      -- rows shared a login. LATERAL … LIMIT 1 makes one row per change structural.
      left join lateral (
        select r.display_name
          from hr.employee r
         where r.login_user_id = pa.created_by
           and r.organization_id = pa.organization_id
         order by (r.deleted_at is null) desc, r.created_at, r.id
         limit 1) req on true
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
       -- 🚨 THE STATES THIS FILTER NAMED DO NOT EXIST.
       -- It asked for four states that `hr.workflow_instance` has never held; the table's
       -- vocabulary is ('active','closed','failed','cancelled'), and the `hr.wf_request` door
       -- creates every request as 'active'. So `in_flight` was ALWAYS an empty array, for
       -- every flow and every person, and it looked exactly like "nothing is pending".
       -- That is what made a self-service edit vanish: the request really was opened, the
       -- approver really was waiting, and the field went back to showing its old value
       -- because the one door that could have said otherwise answered with [].
       -- A closed vocabulary invented rather than read is not a narrower filter, it is an
       -- empty one — and an empty list is the most convincing lie a door can tell.
       --
       -- 🚨 THAT DOOR IS NAMED UNQUALIFIED ON PURPOSE — DO NOT "FIX" IT TO hr.<name>.
       -- The F1 gate (hr.stable_doors_that_write) builds its call graph by testing whether
       -- one function's prosrc CONTAINS another's qualified name. It cannot tell a call from
       -- a comment, so writing the schema-qualified name here — as this comment originally
       -- did — invented an edge from this STABLE read door to a writer, and transitively to
       -- six more, turning F1 red over prose. The reach was never real: this function calls
       -- nothing. Keep workflow-door names unqualified inside comments in STABLE doors.
       and wi.state = 'active'
       and wi.deleted_at is null));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — the member↔employee seam: one link per member, and the truth about the rest.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.member_employee_links(p_organization_id uuid, p_user_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_role text; v_is_hr boolean; v_can_link boolean; v_links jsonb;
begin
  if v_uid is null then
    raise exception 'hr_member_employee_links: no authenticated caller' using errcode = '42501';
  end if;

  -- org-admin gated: this draws a seam across the whole member list, which is an administrative
  -- view of who is who. A plain employee has no business enumerating it.
  v_role  := hr._l1_org_role(v_uid, p_organization_id);
  v_is_hr := hr._punch_capability(v_uid, 'identity.write',       null, v_today, p_organization_id)
          or hr._punch_capability(v_uid, 'working_record.write', null, v_today, p_organization_id);

  if coalesce(v_role, '') not in ('owner','admin') and not v_is_hr then
    return jsonb_build_object('granted', false, 'reason', 'no_standing',
      'detail', 'Only an organization owner, admin, or HR can see the employee seam.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id',              u.uid,
           'employee_id',          e.id,
           'display_name',         e.display_name,
           -- derived, never stored (D4); null when this member is not an employee here
           'directory_status',     hr.employee_directory_status(e.id, v_today),
           -- 🚨 THE SECOND RECORD IS REPORTED, NOT HIDDEN (hr_l1_70). See the lateral below:
           -- this list answers ONE row per member, so where a login carries more than one
           -- employee record only one can be named. Saying nothing about the others would
           -- trade a visible duplicate for an invisible omission, which is worse on an
           -- administrative seam whose entire job is who-is-who. This is the true count of
           -- live employee records on that login in this employer — 1 for everyone, 2 for
           -- the one member who has it.
           'linked_employee_count', coalesce(e.linked_count, 0),
           -- decision 5: no store exists for this decision; it is false for everyone until a
           -- writer ships. It is NOT inferred from a missing or soft-deleted employee row.
           'marked_not_employee',  false)
         order by u.ord), '[]'::jsonb)
    into v_links
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) with ordinality as u(uid, ord)
    -- 🚨 ONE LINK PER MEMBER — AND THIS ONE WAS WRONG IN PRODUCTION (hr_l1_70).
    -- As an ordinary equi-join from the requested user id to the employee's login (the old
    -- expression is NOT quoted here — this function's contract bans that text, and a pin cannot
    -- tell a call from a comment), a login carrying
    -- two un-archived employee rows in this employer put TWO objects into `links` for ONE
    -- requested `user_id`. Measured live in org 2643e470…: the same member came back once as
    -- "G2V-Priya Raman" / active and once as "Zzz Linkprobe" / prehire, so the seam
    -- contradicted itself and a caller keyed on `user_id` kept whichever arrived last.
    -- LATERAL … LIMIT 1 makes one-row-per-member structural. Unlike a byline, the row picked
    -- here IS the answer, so the preference is stated: an employee who actually holds an
    -- employment outranks one who does not, then the oldest record, then id. `count(*) over ()`
    -- is evaluated over the full match set BEFORE the limit, so the count stays honest.
    left join lateral (
      select x.id, x.display_name, (count(*) over ())::int as linked_count
        from hr.employee x
       where x.login_user_id = u.uid
         and x.organization_id = p_organization_id
         and x.deleted_at is null
       order by (x.current_employment_id is not null) desc, x.created_at, x.id
       limit 1) e on true;

  -- creating an employee is an HR write, not a membership power
  v_can_link := hr._punch_capability(v_uid, 'identity.write', null, v_today, p_organization_id);

  return jsonb_build_object('granted', true, 'links', v_links, 'can_link', coalesce(v_can_link, false));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 4 — the pins. A login-shaped join must never come back as a plain join.
-- ──────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_employment_history','hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql',
       array['ONE ACTOR PER ASSIGNMENT', 'where a.login_user_id = pa.created_by'],
       array['left join hr.employee act on act.login_user_id'],
       'hr.employee.login_user_id carries NO unique index, and two un-archived employee rows '
       || 'sharing one login in one employer is a SUPPORTED shape after the rehire/restore work. '
       || 'As a plain join it stops being a lookup and becomes a multiplier: every position '
       || 'assignment came back once per matching employee row (measured: 6 rows for 3 '
       || 'assignments, recorded_by alternating between the two records). The lateral with '
       || 'LIMIT 1 contributes exactly one row per assignment BY CONSTRUCTION — restoring the '
       || 'plain join re-opens the duplication.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_employment_history'
                     and c.home_migration = 'hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_pending_changes','hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql',
       array['ONE REQUESTER PER PENDING CHANGE', 'where r.login_user_id = pa.created_by'],
       array['left join hr.employee req on req.login_user_id'],
       'The same login-shaped join as hr_employment_history, in the same construction: it listed '
       || 'one scheduled position change twice, with a different requester name on each copy, '
       || 'whenever two employee rows shared a login. One row per change must stay structural.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_pending_changes'
                     and c.home_migration = 'hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'hr','member_employee_links','hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql',
       array['ONE LINK PER MEMBER', 'linked_employee_count', '(count(*) over ())::int as linked_count'],
       array['on e.login_user_id = u.uid'],
       'This one was WRONG IN PRODUCTION, not merely armed: in org 2643e470 one member came back '
       || 'as two link objects — active and prehire — so the member-employee seam contradicted '
       || 'itself and a caller keyed on user_id kept whichever arrived last. One row per member '
       || 'is now structural (LATERAL … LIMIT 1), and because the row picked here IS the answer '
       || 'rather than a byline, linked_employee_count must keep reporting the records not '
       || 'named — dropping it trades a visible duplicate for a silent omission.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'hr' and c.function_name = 'member_employee_links'
                     and c.home_migration = 'hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql');

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 5 — the guard: prove the class is closed, in this transaction.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $chk$
declare v_broken int; v_plain int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname in ('public.hr_employment_history','public.hr_pending_changes',
                   'hr.member_employee_links');
  if v_broken > 0 then
    raise exception 'hr_l1_70: % contract clause(s) broken', v_broken;
  end if;

  -- The census, re-run as an assertion rather than trusted from the sweep: no hr.* or public.hr_*
  -- function may join hr.employee on a login-shaped column as a PLAIN join any more.
  select count(*) into v_plain
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f'
     and (n.nspname = 'hr' or (n.nspname = 'public' and p.proname like 'hr\_%'))
     and pg_get_functiondef(p.oid) ~* 'join\s+hr\.employee\s+\w+\s*\n?\s*on\s+\w+\.login_user_id';
  if v_plain > 0 then
    raise exception 'hr_l1_70: % function(s) still join hr.employee on a login as a plain join', v_plain;
  end if;
end
$chk$;
