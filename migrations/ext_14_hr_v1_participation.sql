-- ext_14_hr_v1_participation.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 9 M2 + 7.1: the HR v1 participation rows.
--
-- 🚨 LIVE FINDING THAT CHANGED THIS FILE'S SCOPE. ext_00's header recorded that no HR row
-- could be seeded because 4.3 step 1 (the `custom jsonb` column + the jsonb_path_ops GIN
-- index) had not run. Verified live 2026-08-26: the HR schema lane (HRB-005/006) ALREADY
-- SHIPPED BOTH HALVES on 25 hr.* tables, with exactly the index shape 2.5 prescribes. So
-- step 1 is done, and M2's seed is unblocked and lands here rather than waiting on
-- HRB-026 / L14.
--
-- 7.1's five, mapped onto the tokens that actually exist live:
--   hr.employee            -> hr_employee            (unchanged)
--   hr.position_assignment -> hr_position_assignment (unchanged; a COMPONENT live, which
--                              changes nothing here: participation is by token and the
--                              column is on the table)
--   hr.candidate           -> hr_candidate           (unchanged)
--   hr.job_requisition     -> hr_requisition         🚨 no hr.job_requisition exists
--   hr.training_record     -> hr_training_assignment 🚨 no hr.training_record exists
-- 7.1 owes both name corrections.
--
-- The 20 other hr.* tables that carry the column get NO row, and that is the point: 7.1's
-- OUT list (hr.shift, hr.leave_request, hr.schedule, every computed/ledger table) is
-- enforced HERE, by the allowlist, not by whether a column happens to exist. 2.4.1's
-- conflict-domain ruling -- a jsonb column is ONE field for concurrency, forever -- is why
-- machine-written-at-volume tables stay out.

DO $mig$
DECLARE r record; v jsonb;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('hr_employee', 'advisory', 'confidential', 'aggregate_only',
       'SPEC-EXTENSIBILITY 7.1: the flagship case, named explicitly in the LOCKED feature tree ("Profile - tabbed: ... custom fields"). Ceiling is confidential/aggregate_only: the employee row carries identity-adjacent data, so a custom field on it must never become a side door for SSN-class values.'),
      ('hr_position_assignment', 'advisory', 'confidential', 'aggregate_only',
       'SPEC-EXTENSIBILITY 7.1: job-shaped attributes vary most by org (cost centre, badge zone, union local, seat) and the table is low-write, which is what 2.4.1 requires of anything carrying `custom`.'),
      ('hr_candidate', 'advisory', 'standard', 'allowed',
       'SPEC-EXTENSIBILITY 7.1: every ATS customer wants their own sourcing/referral/portfolio attributes.'),
      ('hr_requisition', 'advisory', 'standard', 'allowed',
       'SPEC-EXTENSIBILITY 7.1 (listed there as hr.job_requisition, which does not exist live): budget codes, approval references, internal routing - per-org by nature.'),
      ('hr_training_assignment', 'advisory', 'standard', 'allowed',
       'SPEC-EXTENSIBILITY 7.1 (listed there as hr.training_record, which does not exist live): external credential ids, cost, provider references.')
    ) AS t(token, mode, sens, ai, note)
  LOOP
    IF EXISTS (SELECT 1 FROM platform.custom_field_target WHERE target_token = r.token AND deleted_at IS NULL) THEN
      CONTINUE;
    END IF;
    v := platform.adopt_custom_fields(
           p_target_token        => r.token,
           p_validation_mode     => r.mode,
           p_sensitivity_ceiling => r.sens,
           p_ai_exposure_ceiling => r.ai,
           p_notes               => r.note);
    IF NOT (v ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'ext_14: adopting % failed: %', r.token, v;
    END IF;
    IF (v ->> 'column_added')::boolean THEN
      RAISE WARNING 'ext_14: % needed its custom column added after all', r.token;
    END IF;
  END LOOP;
END $mig$;

DO $assert$
DECLARE n integer; bad text;
BEGIN
  SELECT count(*) INTO n FROM platform.custom_field_target WHERE deleted_at IS NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'ext_14: expected exactly 5 participation rows, found %', n; END IF;

  SELECT string_agg(t.target_token, ', ') INTO bad
    FROM platform.custom_field_target t
    JOIN platform.entity_types et ON et.token = t.target_token
   WHERE t.deleted_at IS NULL
     AND (t.organization_id <> (SELECT organization_id FROM iam.system_orgs WHERE global_readable LIMIT 1)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema = et.schema_name AND c.table_name = et.table_name
                         AND c.column_name = 'custom' AND c.data_type = 'jsonb'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ext_14: malformed participation rows: %', bad; END IF;

  SELECT string_agg(target_token, ', ') INTO bad FROM platform.custom_field_target
   WHERE deleted_at IS NULL
     AND target_token IN ('hr_shift','hr_leave_request','hr_schedule','hr_punch','hr_timesheet_interval');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ext_14: 7.1 OUT-of-v1 tokens were adopted: %', bad; END IF;
END $assert$;
