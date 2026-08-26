-- HR domain, corrective migration (register item HRB-006, core tranche 3).
--
-- Two loose ends from core tranche 2's EEO relocation, both now closed:
--
--   1. hr_employee_private GETS suppress_platform_admin_lane. Tranche 2 deliberately did NOT
--      flag it, and said so on the register: the whole premise of moving employee self-ID out to
--      hr.eeo_response was that "platform staff hold ADM on hr_employee_private (SPEC-ACCESS
--      3.2)". 🚨 THE SPEC HAS SINCE RULED THE OTHER WAY. Section 18.1a's flag table now lists
--      `hr_employee_private` under **Pay (D19)**, and section 18.5 query I -- the standing
--      conformance check -- fails while it is unflagged. Verified live immediately before this
--      migration: query I returned exactly one row, `hr_employee_private`.
--      Both facts can be true at once and the relocation still stands: the table holds SSN
--      ciphertext, date of birth and home address, which is Restricted-tier content on its own
--      terms; and self-ID belongs in ONE walled home keyed by subject_kind rather than in two
--      places with two access postures. This migration makes the spec and the database agree.
--
--   2. hr.employee_private.self_id_collected_at IS DROPPED. It is the collection timestamp for
--      the four self-ID columns tranche 2 removed, and has been meaningless since. Tranche 2
--      left it deliberately and reported it rather than exceeding a ruling that named four
--      columns -- the coordinator has now named the fifth.
--
-- 🚨 PRECONDITION, VERIFIED LIVE AND RE-ASSERTED BELOW: hr.employee_private holds ZERO rows, so
-- nothing is migrated because nothing exists. The migration refuses the drop if a single row has
-- appeared in the meantime.
--
-- Authority: SPEC-DATA-MODEL 18.1a + 18.5 query I; SPEC-ACCESS 3.5; D19; coordinator ruling
-- 2026-08-26.
--
-- Idempotent. Applied live as migration `hr_p3c_employee_private_wall_and_orphan_column`.

set local lock_timeout = '20s';

-- ============================================================ 1. the orphan column
do $$
declare v_rows bigint;
begin
  select count(*) into v_rows from hr.employee_private;
  if v_rows > 0 then
    raise exception
      'hr_p3c: hr.employee_private holds % row(s); self_id_collected_at cannot be dropped without a data migration. Stop and re-plan.',
      v_rows;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='hr' and table_name='employee_private'
                and column_name='self_id_collected_at') then
    alter table hr.employee_private drop column self_id_collected_at;
  end if;
end $$;

-- ============================================================ 2. the privacy wall
-- The flag feeds the GENERATOR, so it is set and the RLS regenerated in one step
-- (platform.entity_types.suppress_platform_admin_lane's own comment: "Changing it requires
-- re-running iam.apply_rls for the token"). Idempotent.
update platform.entity_types set suppress_platform_admin_lane = true
where token = 'hr_employee_private';

do $$ begin
  perform iam.apply_rls('hr','employee_private','hr_employee_private','restricted');
end $$;

comment on table hr.employee_private is
  'Confidential person facts (SPEC-DATA-MODEL 4.2). EEO SELF-ID DOES NOT LIVE HERE -- all self-ID is in hr.eeo_response behind the privacy wall, keyed by subject_kind (ruling 2026-08-26). Do not re-add gender/ethnicity/veteran/disability columns, nor a self_id_collected_at timestamp, to this table. The token carries suppress_platform_admin_lane per section 18.1a.';

-- ============================================================ DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_p3c',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_bad integer; v_rules text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema='hr' and table_name='employee_private'
                and column_name='self_id_collected_at') then
    raise exception 'hr_p3c: self_id_collected_at is still on hr.employee_private';
  end if;

  if not (select suppress_platform_admin_lane from platform.entity_types where token = 'hr_employee_private') then
    raise exception 'hr_p3c: hr_employee_private did not keep the privacy-wall flag';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='hr' and tablename='employee_private' and policyname='platform_admin_all') then
    raise exception 'hr_p3c: hr.employee_private still has platform_admin_all -- the wall is not up';
  end if;
  select count(*) into v_bad from iam.verify_canonical('hr','employee_private','hr_employee_private')
   where status in ('FAIL','WARN');
  if v_bad > 0 then
    raise exception 'hr_p3c: hr.employee_private has % FAIL/WARN rows after the wall went up', v_bad;
  end if;
  if not iam.canonical_certify_ok('hr','employee_private','hr_employee_private') then
    raise exception 'hr_p3c: hr.employee_private does not certify';
  end if;

  -- 🚨 section 18.5 QUERY I, for every token on the flag list that exists today.
  select string_agg(token, ', ' order by token) into v_rules from platform.entity_types
   where schema_name = 'hr'
     and token in ('hr_restricted_note','hr_incident','hr_incident_party','hr_leave_case',
                   'hr_accommodation_request','hr_eeo_response','hr_kiosk_device','hr_kiosk_session',
                   'hr_employment_pin','hr_access_audit','hr_compensation','hr_offer',
                   'hr_tax_withholding','hr_payroll_export_line','hr_employee_private')
     and coalesce(suppress_platform_admin_lane, false) = false;
  if v_rules is not null then
    raise exception 'hr_p3c: section 18.5 query I is red -- unflagged token(s): %', v_rules;
  end if;

  -- no self-ID column may live outside the one walled home
  select count(*) into v_bad from information_schema.columns
   where table_schema='hr' and table_name <> 'eeo_response'
     and column_name in ('gender_self_id_category_id','ethnicity_self_id_category_id',
                         'veteran_status_category_id','disability_self_id_category_id');
  if v_bad > 0 then
    raise exception 'hr_p3c: % EEO self-ID column(s) live outside hr.eeo_response', v_bad;
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_p3c: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_p3c: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
