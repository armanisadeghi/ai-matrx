-- HRB-003 follow-up — raise the D19 wall on the two pay-bearing COMPONENT tokens
-- unblocked by hr_p3_privacy_wall_entity_read_expr.sql.
--
-- SPEC-DATA-MODEL §9.4 note 2 recorded both as OWED, not done: the flag could not
-- certify on a component because `iam.entity_read_expr` — which builds std_select
-- for the entity, system AND component lanes — emitted a system-org arm gated on
-- `public.is_super_admin()`. That arm is now omitted under the flag, so both carry
-- the real wall instead of only `client_excluded_columns` + the audited RPC.
--
-- Both are pay-bearing by the spec's own adjudication: hr.leave_ledger carries a
-- dollar `amount` and an hourly `rate` on payout/reinstatement entries (§9.4,
-- coordinator adjudication 2026-08-25), and hr.payroll_export_line is named by
-- table in SPEC-ACCESS §3.5.
--
-- Idempotent. Applied live 2026-08-26 as migration
-- `hr_p3_privacy_wall_component_lane_flags`.

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('hr_leave_ledger', 'hr_payroll_export_line');

select iam.apply_rls('hr', 'leave_ledger',        'hr_leave_ledger',        'component');
select iam.apply_rls('hr', 'payroll_export_line', 'hr_payroll_export_line', 'component');

DO $wall$
DECLARE
  r record;
  v_bad integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('leave_ledger','hr_leave_ledger'),
                                 ('payroll_export_line','hr_payroll_export_line')) v(tbl, tok)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname='hr' AND tablename=r.tbl AND policyname='platform_admin_all') THEN
      RAISE EXCEPTION 'HRB-003: platform_admin_all still present on hr.%', r.tbl;
    END IF;

    SELECT count(*) INTO v_bad FROM pg_policies
     WHERE schemaname='hr' AND tablename=r.tbl
       AND (coalesce(qual,'')       ILIKE '%is_platform_admin%'
         OR coalesce(qual,'')       ILIKE '%is_super_admin%'
         OR coalesce(with_check,'') ILIKE '%is_platform_admin%'
         OR coalesce(with_check,'') ILIKE '%is_super_admin%');
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'HRB-003: hr.% still has % policies carrying a platform-staff arm', r.tbl, v_bad;
    END IF;

    SELECT count(*) INTO v_bad
      FROM iam.verify_canonical('hr', r.tbl, r.tok, NULL) WHERE status IN ('FAIL','WARN');
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'HRB-003: hr.% does not certify (% FAIL/WARN)', r.tbl, v_bad;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM iam.verify_canonical('hr', r.tbl, r.tok, NULL)
                    WHERE check_name='privacy_wall' AND status='PASS') THEN
      RAISE EXCEPTION 'HRB-003: hr.% has no passing privacy_wall check', r.tbl;
    END IF;
  END LOOP;
END
$wall$;
