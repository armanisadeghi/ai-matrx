-- HR domain, corrective migration (register item HRB-006, core tranche 2; folds in two
-- coordinator rulings carried over from P3 / HRB-003).
--
-- Two jobs, both retrofits onto tables that tranche 2 already landed in files 05 and 06:
--
--   1. FLAG DUTY. Set platform.entity_types.suppress_platform_admin_lane on the tranche-2
--      tokens that meet P3's class test -- pay values, medical/investigation content, or
--      secrets -- and regenerate their RLS so the flag actually bites.
--   2. EEO RELOCATION. Remove the four employee self-ID columns from hr.employee_private.
--
-- Authority: SPEC-ACCESS 3.5; SPEC-DATA-MODEL 1.5.1a (D19); coordinator rulings 2026-08-26.
-- The matching SPEC-DATA-MODEL amendment is being routed separately -- this lane does not edit
-- the spec.
--
-- Idempotent. Applied live as migration `hr_p3b_privacy_wall_flags_and_eeo_relocation`.
--
-- ===================================================================================
-- 1. FLAG DUTY -- what is flagged, and the one class that CANNOT be
--
-- FLAGGED HERE (all three are `entity`->`restricted`, all three bear a credential, which is
-- db-rules 6f's secret class and D19's "secrets" promise):
--   hr_kiosk_device     -- device_secret_hash, pairing_code_hash
--   hr_employment_pin   -- pin_hash (a kiosk-only employee's ONLY credential)
--   hr_kiosk_session    -- session_token_hash
-- Already flagged by P3 and left alone: hr_compensation. Flagged in file 08: hr_leave_case.
--
-- DELIBERATELY NOT FLAGGED, and each for a stated reason:
--   hr_employee_private -- platform staff hold ADM on it per SPEC-ACCESS 3.2, which is the
--                          PREMISE of job 2 below: because that lane stays open, EEO self-ID
--                          cannot live here. Flagging it would silently contradict the ruling
--                          this same migration implements.
--   hr_separation, hr_emergency_contact -- Restricted, but neither carries a pay value, medical
--                          content nor a secret. D19 names neither. P3's criteria are a CLASS
--                          TEST, not "every restricted table", and over-tightening is a defect
--                          db-rules 6 weighs equally with a leak.
--
-- 🚨 BLOCKED, NOT SKIPPED -- hr_payroll_export_line (file 06) and hr_leave_ledger (file 08).
-- Both are named by D19 for their pay values and both are `component` variants, and THE FLAG
-- CANNOT CERTIFY ON A COMPONENT TODAY. Proven in a rolled-back probe: flag an existing HR
-- component, re-run iam.apply_rls, and iam.verify_canonical returns
--     privacy_wall = FAIL :: "suppress_platform_admin_lane=true but std_select still carries a
--     platform-staff arm — re-run iam.apply_rls"
-- even though apply_rls has just run. iam._apply_rls_unchecked empties v_admin, v_su_sel,
-- v_su_ins and v_sysorg_ins under the flag, but the component lane's std_select still carries an
-- is_super_admin() system-org arm that none of those four strings covers. Since
-- iam.canonical_certify_ok is FALSE on a single FAIL, flagging either table would make it
-- permanently uncertifiable.
-- What IS in force for both meanwhile: their money columns are in client_excluded_columns
-- (hr_leave_ledger: amount, rate) or frozen-at-generation text, so no generated client selects
-- them. The missing half is the platform-staff RLS arm.
-- OWED TO THE PLATFORM (the flag is P3/HRB-003's to change, not this lane's): teach
-- iam._apply_rls_unchecked to strip the component lane's system-org/super-admin arm under the
-- flag, then set it on both tokens.
--
-- ===================================================================================
-- 2. EEO RELOCATION -- why four columns are dropped rather than migrated
--
-- The ruling: ALL EEO self-ID belongs behind the privacy wall at Restricted tier, in ONE walled
-- home carrying `subject_kind` ('candidate' | 'employee') so both contexts share it. Platform
-- staff hold ADM on hr.employee_private (SPEC-ACCESS 3.2), so self-ID columns sitting on that
-- table contradict the wall -- which is the divergence this migration closes.
--
-- Dropped from hr.employee_private:
--   gender_self_id_category_id, ethnicity_self_id_category_id,
--   veteran_status_category_id, disability_self_id_category_id
--
-- 🚨 PRECONDITION, VERIFIED LIVE BEFORE WRITING THIS FILE AND ASSERTED AGAIN BELOW:
-- hr.employee_private holds ZERO rows (so does hr.employee). No data is migrated because no
-- data exists; a straight column drop is the sanctioned path the coordinator ruled for exactly
-- this case. The assertion refuses the drop if a single row has appeared in the meantime.
--
-- THE CONSTRUCTIVE HALF IS NOT IN THIS FILE, and cannot be. hr.eeo_response is section 11.6 --
-- migration file 10 -- and it holds NOT NULL FKs to hr.application and hr.posting, neither of
-- which exists yet. Creating it here would jump the section 18.1 plan. Destructive half now
-- (the contradiction is live today), constructive half in file 10.
--
-- 🚨 OWED TO FILE 10 / HRB-006's later tranche, recorded on the register: hr.eeo_response must
-- be created with `subject_kind text NOT NULL CHECK (subject_kind IN ('candidate','employee'))`
-- and its application_id/posting_id FKs made NULLABLE so an employee-context row is expressible,
-- and it must carry suppress_platform_admin_lane = true. Until it lands there is NO home for
-- employee self-ID -- which is correct and harmless right now (0 employees, no repo surface
-- collects it) but is a real gap the moment either exists.
--
-- LOOSE END, deliberately left and reported rather than exceeded: hr.employee_private
-- .self_id_collected_at survives. It is the collection timestamp for the four dropped columns
-- and is meaningless without them, but the ruling named four columns and the spec amendment is
-- being routed separately -- dropping a fifth on this lane's own authority would be scope creep.
-- Flagged on the HRB-006 register row for that amendment to resolve.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 1. FLAG DUTY
-- Setting the flag is only half of it: platform.entity_types.suppress_platform_admin_lane's own
-- column comment says "Changing it requires re-running iam.apply_rls for the token." The flag is
-- read by the GENERATOR, so until apply_rls re-runs, the live policies still carry the
-- is_platform_admin() arm the flag exists to remove -- and iam.verify_canonical's `privacy_wall`
-- check FAILs on precisely that mismatch. Both steps, together, per token.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('kiosk_device',   'hr_kiosk_device'),
      ('employment_pin', 'hr_employment_pin'),
      ('kiosk_session',  'hr_kiosk_session')
    ) as v(tbl, token)
  loop
    -- Guard: these must already be `restricted`, or the flag is being set on the wrong shape.
    if (select rls_variant from platform.entity_types where token = t.token) <> 'restricted' then
      raise exception 'hr_p3b: % is not restricted; refusing to flag it', t.token;
    end if;
    update platform.entity_types set suppress_platform_admin_lane = true where token = t.token;
    perform iam.apply_rls('hr', t.tbl, t.token, 'restricted');
  end loop;
end $$;

-- ============================================================ 2. EEO RELOCATION
do $$
declare
  v_rows bigint;
  c text;
begin
  -- The precondition, re-checked at apply time rather than trusted from the plan.
  select count(*) into v_rows from hr.employee_private;
  if v_rows > 0 then
    raise exception
      'hr_p3b: hr.employee_private holds % row(s); the EEO self-ID columns cannot be dropped without a data migration. Stop and re-plan.',
      v_rows;
  end if;

  foreach c in array ARRAY['gender_self_id_category_id','ethnicity_self_id_category_id',
                           'veteran_status_category_id','disability_self_id_category_id'] loop
    if exists (select 1 from information_schema.columns
                where table_schema='hr' and table_name='employee_private' and column_name = c) then
      execute format('alter table hr.employee_private drop column %I', c);
    end if;
  end loop;
end $$;

comment on table hr.employee_private is
  'Confidential person facts (SPEC-DATA-MODEL 4.2). EEO SELF-ID DOES NOT LIVE HERE: platform staff hold ADM on this table per SPEC-ACCESS 3.2, so all self-ID belongs in hr.eeo_response behind the privacy wall, keyed by subject_kind (coordinator ruling 2026-08-26, from P3/HRB-003). Do not re-add gender/ethnicity/veteran/disability columns to this table.';

-- ============================================================ DDL guard acknowledgement
-- Log-driven and scoped to the one rule section 1.3 sanctions; an unacked row under any other
-- rule still fails, below. Both jobs above ALTER live tables, so fresh WARNs are expected.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null
              and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_p3b',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  -- the three newly walled tokens still certify, and the wall is actually up
  for r in select unnest(ARRAY['kiosk_device','employment_pin','kiosk_session']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_p3b: hr.% has % FAIL/WARN conformance rows after flagging', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_p3b: hr.% does not certify after flagging', r.t;
    end if;
    if not (select suppress_platform_admin_lane from platform.entity_types where token = 'hr_' || r.t) then
      raise exception 'hr_p3b: hr_% did not keep suppress_platform_admin_lane', r.t;
    end if;
    -- the generated policy really lost the admin lane
    if exists (select 1 from pg_policies
                where schemaname='hr' and tablename=r.t and policyname='platform_admin_all') then
      raise exception 'hr_p3b: hr.% still has platform_admin_all -- the wall is not up', r.t;
    end if;
  end loop;

  -- the four EEO columns are gone and hr.employee_private still certifies
  select count(*) into v_bad from information_schema.columns
   where table_schema='hr' and table_name='employee_private'
     and column_name in ('gender_self_id_category_id','ethnicity_self_id_category_id',
                         'veteran_status_category_id','disability_self_id_category_id');
  if v_bad > 0 then
    raise exception 'hr_p3b: % EEO self-ID column(s) remain on hr.employee_private', v_bad;
  end if;
  if not iam.canonical_certify_ok('hr','employee_private','hr_employee_private') then
    raise exception 'hr_p3b: hr.employee_private no longer certifies after the column drop';
  end if;

  -- no HR table anywhere may re-acquire an employee self-ID column outside the walled home
  select count(*) into v_bad from information_schema.columns
   where table_schema='hr' and table_name <> 'eeo_response'
     and column_name in ('gender_self_id_category_id','ethnicity_self_id_category_id',
                         'veteran_status_category_id','disability_self_id_category_id');
  if v_bad > 0 then
    raise exception 'hr_p3b: % EEO self-ID column(s) live outside hr.eeo_response', v_bad;
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_p3b: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_p3b: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
