-- HRB-003 D15 follow-up — raise the D19 privacy wall on every computed-pay
-- table that a per-person pay VALUE lives on, closing the gap an independent
-- D15 verifier reproduced (a non-member platform+super admin read real customer
-- pay values live: sum(hr.work_interval.amount)=5940.50 across three such
-- identities).
--
-- THE RULING (SPEC-ACCESS §3.5, coordinator 2026-08-28, "THE PAY-VALUE CRITERION
-- IS ORTHOGONAL TO THE §3.1 TIER"): a per-person pay value walls its table from
-- the STAFF lane regardless of the table's CUSTOMER tier. `hr_compensation` and
-- the two component lanes (`hr_leave_ledger`, `hr_payroll_export_line`) were
-- walled by HRB-003; the computed-pay Working-record-tier COMPONENTS and the
-- same-shape entity tables were left on the ordinary platform-admin lane. This
-- migration walls the remaining nine.
--
-- MECHANISM: identical to HRB-003 — flip suppress_platform_admin_lane and
-- regenerate RLS. The flag is honoured by iam._apply_rls_unchecked (empties the
-- v_admin is_platform_admin() prefix, omits the platform_admin_all policy, and
-- omits the is_super_admin() arms) and by iam.entity_read_expr (omits the
-- system-org super-admin arm from the entity/component std_select). The flag
-- suppresses ONLY the staff arm; every customer-side arm — a component's reach
-- through its parent via iam.accessible_entity_ids, the owner/org-admin/
-- org-member/permissions arms on the entity tables — is untouched.
--
-- Nine tokens, verified live to carry a pay-bearing column before flagging
-- (not flagged on name):
--   hr_work_interval          (component)  rate, amount
--   hr_workweek               (component)  weighted_average_regular_rate (FLSA)
--   hr_pay_period_employment  (component)  total_amount
--   hr_payroll_export         (component)  total_amount
--   hr_time_adjustment        (component)  amount_delta, rate
--   hr_schedule_change        (component)  premium_amount
--   hr_requisition            (entity)     pay_range_min/max, budget_amount
--   hr_job_title              (entity)     pay_range_min/max
--   hr_schedule               (entity)     labor_budget_amount, projected_labor_amount
--
-- FALSIFIED per table in a rolled-back transaction (real request.jwt.claims,
-- set local role authenticated):
--   * staff (non-member platform+super admin 4cf62e4e) read → 0 rows / 0 pay
--     (was 421/$5940.50 on work_interval, 200/$5657.44 on pay_period_employment,
--      11/$184.25 on workweek, 6 on payroll_export, 5 on job_title);
--   * customer viewers (hr_owner 87a6e699, hr_admin/manager/subject 20149d3f)
--     read the IDENTICAL rows and pay sums before and after — parent-reach on
--     the components did NOT break;
--   * the four empty tables (time_adjustment, schedule_change, requisition,
--     schedule) proven structurally: staff arm removed, customer arms retained
--     in std_select, privacy_wall PASS.
--
-- Idempotent (flag set true, RLS regenerated deterministically).

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('hr_work_interval','hr_workweek','hr_pay_period_employment',
                 'hr_payroll_export','hr_time_adjustment','hr_schedule_change',
                 'hr_requisition','hr_job_title','hr_schedule');

do $regen$
declare r record;
begin
  for r in
    select token, schema_name, table_name, rls_variant
      from platform.entity_types
     where token in ('hr_work_interval','hr_workweek','hr_pay_period_employment',
                     'hr_payroll_export','hr_time_adjustment','hr_schedule_change',
                     'hr_requisition','hr_job_title','hr_schedule')
  loop
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
  end loop;
end
$regen$;

do $wall$
declare
  r record;
  v_bad integer;
begin
  for r in
    select token, schema_name, table_name from platform.entity_types
     where token in ('hr_work_interval','hr_workweek','hr_pay_period_employment',
                     'hr_payroll_export','hr_time_adjustment','hr_schedule_change',
                     'hr_requisition','hr_job_title','hr_schedule')
  loop
    if exists (select 1 from pg_policies
                where schemaname=r.schema_name and tablename=r.table_name
                  and policyname='platform_admin_all') then
      raise exception 'HRB-003 D15: platform_admin_all still present on %.%', r.schema_name, r.table_name;
    end if;

    select count(*) into v_bad from pg_policies
     where schemaname=r.schema_name and tablename=r.table_name
       and (coalesce(qual,'')       ilike '%is_platform_admin%'
         or coalesce(qual,'')       ilike '%is_super_admin%'
         or coalesce(with_check,'') ilike '%is_platform_admin%'
         or coalesce(with_check,'') ilike '%is_super_admin%');
    if v_bad > 0 then
      raise exception 'HRB-003 D15: %.% still has % policies carrying a platform-staff arm',
        r.schema_name, r.table_name, v_bad;
    end if;

    select count(*) into v_bad
      from iam.verify_canonical(r.schema_name, r.table_name, r.token, null)
     where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'HRB-003 D15: %.% does not certify (% FAIL/WARN)', r.schema_name, r.table_name, v_bad;
    end if;

    if not exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, null)
                    where check_name='privacy_wall' and status='PASS') then
      raise exception 'HRB-003 D15: %.% has no passing privacy_wall check', r.schema_name, r.table_name;
    end if;
  end loop;
end
$wall$;
