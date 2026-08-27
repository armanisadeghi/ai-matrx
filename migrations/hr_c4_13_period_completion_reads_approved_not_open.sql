-- HR domain C4 — migration 13 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 A PAY PERIOD COULD REACH `approved` WITH TIMECARDS NOBODY HAD APPROVED.
--
-- `hr.pay_period_transition`'s completion gate counted only rows in state `open`:
--
--     select count(*) into v_open from hr.pay_period_employment
--      where pay_period_id = p_pay_period_id and state = 'open';
--
-- `hr.pay_period_employment.state` is `open · attested · disputed · approved · exported · locked`.
-- The moment an EMPLOYEE attested, their row left `open` for `attested` — and the gate stopped
-- seeing it. So a period whose employees had all attested could be moved to `approved` before a
-- single manager had approved anything, and the refusal that should have named them never fired.
-- Measured in the HRB-008 proof the moment the chain was driven end to end for the first time
-- (2026-08-27): two attested-but-unapproved timecards, period approved, no refusal.
--
-- SPEC-WORKFLOW-ENGINE §8.2 states the gate as a question about **approval**, not about `open`:
--   *"Every employment row in the period approved or excluded?"* → no → *"Period stays submitted;
--   payroll dashboard shows exactly which employments are outstanding."*
-- SPEC-TIME §7.1 says the same from the period's side. The gate now asks that question.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE GATE IS `approved` OR BEYOND — `approved · exported · locked`. Those are the three states
--    in the CHECK that mean a manager has decided this timecard. `open`, `attested` and `disputed`
--    all mean the decision is still owed, and all three now block. There is no `excluded` state or
--    column on `hr.pay_period_employment` (verified live against the CHECK constraint), so §8.2's
--    "or excluded" has nothing to read yet; when exclusion is modelled it is added here, and until
--    then a row that should be excluded is visible and blocking rather than silently skipped.
--
-- 2. 🚨 AN UNRESOLVED DISAGREEMENT STILL DOES NOT BLOCK, AND THAT IS NOT A CONTRADICTION.
--    §7.1 / RD 6 is about the DISAGREEMENT FLAG (`disputed_at` set, `dispute_resolved_at` null),
--    which survives onto an `approved` row and travels to the export — approving over it is
--    legitimate and is recorded. The row STATE `disputed` is a different thing: it means the
--    employee attested with exception and the manager has not decided yet. The first must never
--    block; the second always must. The old gate blocked neither.
--
-- 3. THE REFUSAL NAMES WHO AND IN WHAT STATE. "3 timecards are still open" is not actionable when
--    the states differ — an employee who has not attested and a manager who has not approved are
--    two different people to chase. The refusal now lists `name (state)` and returns a structured
--    `outstanding` array the period page can render directly, plus the per-state counts.
--
-- 4. THE BODY IS REWRITTEN FROM THE LIVE CATALOG by exact-string replacement, as hr_c4_08…12
--    record, and the migration REFUSES to run if the expected text is absent. Idempotent.
--
-- Authority: SPEC-WORKFLOW-ENGINE §8.2 node L (approved or excluded), SPEC-TIME §7.1.
-- Applied live as `hr_c4_13_period_completion_reads_approved_not_open`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_13_cert_bad_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_cnt_old constant text := $o$  select count(*) into v_open from hr.pay_period_employment
   where pay_period_id = p_pay_period_id and state = 'open';$o$;
  v_cnt_new constant text := $o$  -- 🚨 §8.2 node L asks "every employment row APPROVED or excluded?", not "not open". A row that
  -- the employee attested has left `open` for `attested` and is still waiting on its manager;
  -- counting only `open` let a period reach `approved` with timecards nobody had approved.
  select count(*) into v_open from hr.pay_period_employment
   where pay_period_id = p_pay_period_id and state not in ('approved','exported','locked');$o$;

  v_ref_old constant text := $o$  if p_to_state = 'approved' and v_open > 0 then
    select string_agg(e.display_name, ', ' order by e.display_name) into v_names
      from (select ppe.employment_id from hr.pay_period_employment ppe
             where ppe.pay_period_id = p_pay_period_id and ppe.state = 'open'
             limit 10) x
      join hr.employment em on em.id = x.employment_id
      join hr.employee e on e.id = em.employee_id;
    return hr._time_refusal('hr_period_has_open_timecards',
      format('%s timecard(s) in this period are still open and have not been decided. Approve or exclude them first.', v_open),
      jsonb_build_object('open_count', v_open, 'sample', coalesce(v_names, ''),
                         'disputes_open', v_disputes,
                         'note', 'An unresolved disagreement does NOT block approval — only an undecided timecard does.'));
  end if;$o$;
  v_ref_new constant text := $o$  if p_to_state = 'approved' and v_open > 0 then
    -- name WHO and in WHAT state: "has not attested" and "attested, waiting on their manager" are
    -- two different people to chase, and a bare count cannot tell them apart.
    select string_agg(e.display_name || ' (' || x.state || ')', ', ' order by e.display_name),
           jsonb_agg(jsonb_build_object('employment_id', x.employment_id,
                                        'display_name', e.display_name,
                                        'state', x.state) order by e.display_name)
      into v_names, v_outstanding
      from (select ppe.employment_id, ppe.state from hr.pay_period_employment ppe
             where ppe.pay_period_id = p_pay_period_id
               and ppe.state not in ('approved','exported','locked')
             order by ppe.state, ppe.employment_id
             limit 10) x
      join hr.employment em on em.id = x.employment_id
      join hr.employee e on e.id = em.employee_id;
    return hr._time_refusal('hr_period_has_open_timecards',
      format('%s timecard(s) in this period have not been approved yet. A period is approved when every timecard in it is.', v_open),
      jsonb_build_object('open_count', v_open, 'sample', coalesce(v_names, ''),
                         'outstanding', coalesce(v_outstanding, '[]'::jsonb),
                         'by_state', coalesce((select jsonb_object_agg(s.state, s.n)
                                                 from (select state, count(*) n
                                                         from hr.pay_period_employment
                                                        where pay_period_id = p_pay_period_id
                                                          and state not in ('approved','exported','locked')
                                                        group by state) s), '{}'::jsonb),
                         'disputes_open', v_disputes,
                         'note', 'An unresolved DISAGREEMENT does not block approval — it travels to the export on the approved row. An undecided timecard does.'));
  end if;$o$;

  v_dec_old constant text := $o$  v_names    text;
$o$;
  v_dec_new constant text := $o$  v_names    text;
  v_outstanding jsonb;
$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if v_oid is null then raise exception 'hr_c4_13: hr.pay_period_transition does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_cnt_new in v_def) > 0 then
    raise notice 'hr_c4_13: the completion gate already reads approved; nothing to do';
    return;
  end if;
  if position(v_cnt_old in v_def) = 0 or position(v_ref_old in v_def) = 0
     or position(v_dec_old in v_def) = 0 then
    raise exception 'hr_c4_13: hr.pay_period_transition does not carry the expected completion gate — refusing to half-apply';
  end if;
  v_new := replace(v_def, v_dec_old, v_dec_new);
  v_new := replace(v_new, v_cnt_old, v_cnt_new);
  v_new := replace(v_new, v_ref_old, v_ref_new);
  execute v_new;
  raise notice 'hr_c4_13: the period completion gate now reads APPROVED, and names who is outstanding';
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if v_src !~ 'state not in \(''approved'',''exported'',''locked''\)' then
    raise exception 'hr_c4_13: the completion gate still does not read approved';
  end if;
  if v_src ~ 'and state = ''open'';' then
    raise exception 'hr_c4_13: the old open-only completion count is still present';
  end if;
  if v_src !~ 'outstanding' then
    raise exception 'hr_c4_13: the refusal does not return the outstanding rows';
  end if;
  -- the disagreement rule survives: a dispute FLAG must still not block
  if v_src !~ 'does not block approval' then
    raise exception 'hr_c4_13: the unresolved-disagreement rule was lost';
  end if;
  -- hr_c4_11's honest submit reporting is still in force
  if v_src !~ 'workflowRoutingFailures' then
    raise exception 'hr_c4_13: hr_c4_11''s routing-failure reporting was lost';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_13: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_13_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_13: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
