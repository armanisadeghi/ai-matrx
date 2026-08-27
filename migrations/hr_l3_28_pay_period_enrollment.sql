-- HR domain L3 — migration 28 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 PERIODS EXISTED BUT NOBODY WAS IN THEM, SO TIMECARD AUTHORITY RESOLVED FOR NOBODY.
-- `hr_l3_26` created 8 pay periods and 0 `hr.pay_period_employment` rows. `hr._can_edit_punch`'s
-- manager arm resolves authority against exactly that row, so `hr.punch_correct` refused
-- `no_pay_period_row` for every caller in every organization even with the calendar live. A period
-- with no roster is a calendar, not a payroll.
--
-- Closed from BOTH directions so the gap cannot simply move:
--   * GENERATION enrolls - every eligible employment of the pay group, for periods it creates AND
--     as a backfill for periods that already existed without rows.
--   * ATTACHMENT enrolls - `hr_employment_set_pay_group` enrolls that one employment across the
--     group's existing periods.
-- Both go through ONE writer, `hr._enroll_pay_period_rows`, so the eligibility rule cannot drift
-- between the two doors.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. IDEMPOTENCE RIDES THE EXISTING UNIQUE KEY `(pay_period_id, employment_id)` with
--    `on conflict do nothing`, exactly as generation rides `(pay_group_id, sequence_number)`.
--    A re-run backfills what is missing and creates no duplicates, by construction.
--
-- 2. 🚨 NOTHING ABOUT THE TIMECARD LIFECYCLE IS FABRICATED. The row is inserted at the column's own
--    default `state = 'open'` - the opening state of the live CHECK
--    (open|attested|disputed|approved|exported|locked). `attested_at`, `manager_approved_at`,
--    `disputed_at`, `total_hours` and `total_amount` are left untouched: an enrollment row means
--    "this person belongs to this period", never "this person has attested" or "these are their
--    hours". `engine_key`/`engine_version` are NOT NULL, so they say `enrollment` - which is the
--    truth: no computation has happened on this row.
--
-- 3. 🚨 EFFECTIVE DATING IS RESPECTED, IN BOTH DIRECTIONS.
--    An employment is enrolled in a period only when its employment overlaps that period:
--    `hire_date <= period_end_on` (never a period that ENDED before they started) and
--    `termination_date is null or termination_date >= period_start_on` (never a period that STARTED
--    after they left). Without this, generating a two-year calendar would enrol every new hire into
--    every historical period and put strangers on closed payrolls.
--
-- 4. 🚨 A TERMINAL PERIOD IS NEVER BACKFILLED. Enrollment writes only into
--    `open | submitted | approved | reopened`. A period that is `exported`, `locked` or `closed` has
--    had its money leave the building; adding a person to it afterwards would put someone on a
--    payroll that has already been paid and reported. The gap persists for those periods ON PURPOSE
--    - the door for a post-lock correction is the adjustment lane, not a new roster row.
--
-- 5. DETACHING A PAY GROUP REMOVES NOTHING. `hr_employment_set_pay_group(id, null)` enrols nobody
--    and deletes nothing: an existing `pay_period_employment` row carries attestation, dispute and
--    approval state for a period that really happened. Moving someone's future pay group does not
--    unmake their past timecards.
-- ===================================================================================

create or replace function hr._enroll_pay_period_rows(
  p_pay_period_id uuid default null, p_employment_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare v_n integer := 0;
begin
  perform hr.arm_write();

  with eligible as (
    select pp.id as pay_period_id, em.id as employment_id, pp.organization_id
      from hr.pay_period pp
      join hr.employment em on em.pay_group_id = pp.pay_group_id
     where (p_pay_period_id is null or pp.id = p_pay_period_id)
       and (p_employment_id is null or em.id = p_employment_id)
       and em.deleted_at is null
       -- decision 4: never a period whose money has already left
       and pp.state in ('open','submitted','approved','reopened')
       -- decision 3: the employment must actually overlap the period
       and em.hire_date <= pp.period_end_on
       and (em.termination_date is null or em.termination_date >= pp.period_start_on)
  ), ins as (
    insert into hr.pay_period_employment
      (pay_period_id, employment_id, organization_id, engine_key, engine_version)
    select e.pay_period_id, e.employment_id, e.organization_id,
           -- decision 2: honest provenance - nothing has been computed on this row
           'hr.pay_period_enrollment', 'enrollment'
      from eligible e
    on conflict (pay_period_id, employment_id) do nothing
    returning 1
  )
  select count(*)::integer into v_n from ins;

  return v_n;
end
$$;

comment on function hr._enroll_pay_period_rows(uuid, uuid) is
  'THE enrollment writer for hr.pay_period_employment. Scoped by period, by employment, or both. Idempotent on (pay_period_id, employment_id). Respects effective dating and never writes into a terminal period. Fabricates no timecard lifecycle state - the row opens at state=open.';

-- ---------------------------------------------------------------------------------
-- direction 1: generation enrols (created periods AND a backfill of existing ones)
-- ---------------------------------------------------------------------------------
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.pay_period_generate(uuid,date)'::regprocedure;
  if position('_enroll_pay_period_rows' in v_def) > 0 then
    raise notice 'hr_l3_28: generate already enrols'; return;
  end if;

  v_def := replace(v_def, '  v_guard   integer := 0;',
                          '  v_guard   integer := 0;' || chr(10) ||
                          '  v_enrolled integer := 0;   -- hr_l3_28');

  v_def := replace(v_def,
    '  return jsonb_build_object(' || chr(10) || '    ''ok'', true,' || chr(10) || '    ''pay_group_id'', g.id,',
    '  -- hr_l3_28: a period with no roster is a calendar, not a payroll. Enrol every eligible' || chr(10) ||
    '  -- employment into every non-terminal period of this group - the ones just created AND any' || chr(10) ||
    '  -- that already existed without rows. Idempotent, so a re-run backfills and duplicates nothing.' || chr(10) ||
    '  select hr._enroll_pay_period_rows(pp.id, null) into v_enrolled from hr.pay_period pp' || chr(10) ||
    '   where pp.pay_group_id = g.id limit 1;' || chr(10) ||
    '  select coalesce(sum(hr._enroll_pay_period_rows(pp.id, null)), 0) into v_enrolled' || chr(10) ||
    '    from hr.pay_period pp where pp.pay_group_id = g.id;' || chr(10) || chr(10) ||
    '  return jsonb_build_object(' || chr(10) || '    ''ok'', true,' || chr(10) ||
    '    ''enrolled_rows'', v_enrolled,' || chr(10) ||
    '    ''pay_group_id'', g.id,');

  execute v_def;
end $outer$;

-- ---------------------------------------------------------------------------------
-- direction 2: attachment enrols
-- ---------------------------------------------------------------------------------
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'public.hr_employment_set_pay_group(uuid,uuid)'::regprocedure;
  if position('_enroll_pay_period_rows' in v_def) > 0 then
    raise notice 'hr_l3_28: set_pay_group already enrols'; return;
  end if;

  v_def := replace(v_def,
    'declare' || chr(10) || '  v_org uuid; v_gate jsonb; v_profile uuid; v_pg_profile uuid; v_prior uuid; v_name text;',
    'declare' || chr(10) || '  v_org uuid; v_gate jsonb; v_profile uuid; v_pg_profile uuid; v_prior uuid; v_name text;' || chr(10) ||
    '  v_enrolled integer := 0;   -- hr_l3_28');

  v_def := replace(v_def,
    '  return jsonb_build_object(''ok'', true,' || chr(10) || '    ''employment_id'', p_employment_id,',
    '  -- hr_l3_28: attaching a pay group puts this person on that group''''s calendar. Enrol them' || chr(10) ||
    '  -- into its existing non-terminal periods, effective-dated so they never land in a period' || chr(10) ||
    '  -- that ended before they started. Detaching (null) enrols nobody and deletes nothing:' || chr(10) ||
    '  -- an existing row carries real attestation and approval state.' || chr(10) ||
    '  if p_pay_group_id is not null then' || chr(10) ||
    '    v_enrolled := hr._enroll_pay_period_rows(null, p_employment_id);' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  return jsonb_build_object(''ok'', true,' || chr(10) ||
    '    ''periods_enrolled'', v_enrolled,' || chr(10) ||
    '    ''employment_id'', p_employment_id,');

  execute v_def;
end $outer$;

do $$
declare v_g text; v_s text;
begin
  v_g := pg_get_functiondef('hr.pay_period_generate(uuid,date)'::regprocedure);
  v_s := pg_get_functiondef('public.hr_employment_set_pay_group(uuid,uuid)'::regprocedure);
  if v_g not like '%_enroll_pay_period_rows%' then
    raise exception 'hr_l3_28: pay_period_generate does not enrol';
  end if;
  if v_s not like '%_enroll_pay_period_rows%' then
    raise exception 'hr_l3_28: hr_employment_set_pay_group does not enrol';
  end if;
  if to_regprocedure('hr._enroll_pay_period_rows(uuid,uuid)') is null then
    raise exception 'hr_l3_28: the enrollment writer did not land';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) > 0 then
    raise exception 'hr_l3_28: the conformance gate went RED';
  end if;
end $$;
