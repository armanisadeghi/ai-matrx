-- HR domain L3 — migration 10 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE PREMIUM DOUBLE-WRITE INVARIANT, PINNED FROM BOTH SIDES.
--
-- Two functions may now legitimately write a statutory-premium `hr.work_interval` for the same
-- `hr.attendance_exception`: `hr.recompute_apply` (the recompute lane) and
-- `hr.attendance_exception_resolve` (this lane, allowlisted under the
-- `only_sanctioned_interval_writers` ruling). The recompute side already refuses to double-write.
-- This closes the reverse direction and makes the two refusals mutually visible.
--
-- Authority: SPEC-TIME §4.3 (rest premium capped at ONE per day; meal and rest on one day are two
-- lines, never merged), §5.2. Applied live as `hr_l3_29_premium_double_write_guard`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE TWO WRITERS USED **DIFFERENT CALC KEYS FOR THE SAME FACT**, WHICH IS HOW A DOUBLE-WRITE
--    WOULD EVENTUALLY HAPPEN. `hr.recompute_apply` stamps `calc.premium_for_exception_id`;
--    `hr.attendance_exception_resolve` stamped `calc.premium_from_exception_id`. Neither could see
--    the other's link. Today the collision is caught anyway because BOTH dedupe on the same
--    coarser key — `(employment_id, local_work_date, earning_code_id, is_current)` — so the code
--    that closes the gap is not the code that is currently holding it, and that is exactly the kind
--    of accident that survives until somebody changes one of the two predicates.
--    Fixed at the source: this lane now writes **both** keys, and its guard reads **both**, so each
--    writer can see the other's row by the link and not only by the coincidence of the code.
--
-- 2. THE GUARD IS THREE PREDICATES OR-ED, AND A SUPERSEDED ROW IS NEVER ONE OF THEM. A live premium
--    for this day counts when: the same earning code already has a current `premium_only` line that
--    day, OR a current `premium_only` line that day carries EITHER exception-link key naming this
--    exception, OR the exception's own `work_interval_id` points at a current `premium_only` row.
--    `is_current = false` rows are excluded throughout — a superseded premium is history, and
--    treating it as live would suppress a premium that is genuinely owed. Recomputation never
--    deletes, so history is always there to be mis-read if the predicate is sloppy.
--
-- 3. 🚨 THE CAP IS PER (DAY, EARNING CODE) AND THEREFORE STILL LETS A MEAL AND A REST PREMIUM
--    CO-EXIST ON ONE DAY, WHICH IS THE POINT. §4.3: "Rest premium capped at ONE per day; a meal
--    premium and a rest premium on the same day are TWO lines, never merged." Widening the guard to
--    "any premium_only line that day" would have merged two separate statutory obligations into one
--    and made one violation invisible in the export. The assertion at the foot of this file pins
--    both halves: no second line for the same code, and two lines for two different codes.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

create or replace function hr.attendance_exception_resolve(p_exception_id uuid,
                                                           p_resolution_state text,
                                                           p_note text default null,
                                                           p_premium_earning_code_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid      uuid := auth.uid();
  v_ae       hr.attendance_exception%rowtype;
  v_allowed  text[];
  v_actor    uuid;
  v_lock     jsonb;
  v_wants    boolean;
  v_code     hr.earning_code%rowtype;
  v_want     text;
  v_ww       uuid;
  v_existing uuid;
  v_why      text;
  v_new      uuid;
  v_written  jsonb := '[]'::jsonb;
  v_capped   boolean := false;
  v_note     text;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'Resolving an exception is always an act by somebody. Sign in and try again.');
  end if;
  if p_exception_id is null or coalesce(btrim(p_resolution_state), '') = '' then
    return hr._time_refusal('hr_arguments_incomplete',
      'Both the exception and the resolution are required.');
  end if;

  select * into v_ae from hr.attendance_exception where id = p_exception_id;
  if not found then
    return hr._time_refusal('hr_exception_not_found',
      'No attendance exception with that id is readable.',
      jsonb_build_object('exception_id', p_exception_id));
  end if;

  v_allowed := hr._time_exception_allowed_resolutions(v_ae.severity);

  if not hr.capability(v_uid, 'time.read', v_ae.employment_id, v_ae.local_work_date) then
    return hr._time_refusal('hr_no_exception_authority',
      'Resolving an attendance exception is a manager or HR act. An employee can read their own exceptions and comment on them, but not resolve them. You hold no reach over this employment as of this work date.',
      jsonb_build_object('capability_required', 'time.read',
                         'subject_employment_id', v_ae.employment_id,
                         'as_of', v_ae.local_work_date,
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;
  v_actor := hr._time_actor_employment(v_uid, v_ae.organization_id);
  if v_actor is null then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in this organization, so this resolution cannot be attributed to anybody.');
  end if;

  -- 🚨 a statutory violation cannot be excused, and no knob changes it
  if p_resolution_state = 'excused' and v_ae.severity = 'violation' then
    return hr._time_refusal('hr_statutory_premium_not_excusable',
      'This is a statutory violation, and a statutory violation cannot be excused. The premium is owed whether or not anybody agrees it should have happened. Resolve it as corrected — which writes the premium line — or acknowledge it. There is no configuration that changes this.',
      jsonb_build_object('exception_id', v_ae.id, 'exception_kind', v_ae.exception_kind,
                         'severity', v_ae.severity,
                         'allowedResolutions', to_jsonb(v_allowed),
                         'is_a_knob', false));
  end if;
  if not (p_resolution_state = any (v_allowed)) then
    return hr._time_refusal('hr_exception_resolution_unknown',
      format('%s is not a resolution this exception accepts.', p_resolution_state),
      jsonb_build_object('exception_id', v_ae.id, 'severity', v_ae.severity,
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;
  if p_resolution_state = 'excused' and coalesce(btrim(p_note), '') = '' then
    return hr._time_refusal('hr_exception_note_required',
      'Excusing an exception requires a written reason. Acknowledging one does not — that is the difference between the two.',
      jsonb_build_object('allowedResolutions', to_jsonb(v_allowed)));
  end if;

  v_lock := hr._punch_period_lock(v_ae.employment_id, v_ae.local_work_date);
  if coalesce((v_lock ->> 'locked')::boolean, false) then
    return hr._time_refusal('hr_period_locked',
      format('The pay period covering %s is %s. Nothing in it is editable in place, and that includes writing a premium line. File a correction instead — it rides the next export, tagged to this period.',
             v_ae.local_work_date, v_lock ->> 'state'),
      jsonb_build_object('pay_period_id', v_lock -> 'pay_period_id', 'state', v_lock -> 'state',
                         'door', 'hr_time_adjustment_create',
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;

  v_wants := v_ae.exception_kind in ('meal_not_provided','rest_not_provided')
             and p_resolution_state in ('acknowledged','corrected','closed');

  if v_wants then
    v_want := case v_ae.exception_kind when 'meal_not_provided' then 'MEAL_PREMIUM'
                                       else 'REST_PREMIUM' end;
    if p_premium_earning_code_id is not null then
      select * into v_code from hr.earning_code
       where id = p_premium_earning_code_id and deleted_at is null;
    else
      select * into v_code from hr.earning_code
       where organization_id = v_ae.organization_id and code = v_want and deleted_at is null;
    end if;

    if v_code.id is null then
      return hr._time_refusal('hr_premium_earning_code_missing',
        format('This organization has no %s earning code, so the premium this violation owes cannot be written. Seed the earning-code registry for this organization first.', v_want),
        jsonb_build_object('expected_code', v_want, 'organization_id', v_ae.organization_id,
                           'door', 'hr.earning_code_seed_org',
                           'allowedResolutions', to_jsonb(v_allowed)));
    end if;
    if v_code.code <> v_want or not v_code.is_statutory_premium or not v_code.is_active then
      return hr._time_refusal('hr_premium_earning_code_mismatch',
        format('A %s exception is paid on %s. The code supplied was %s (active=%s, statutory=%s).',
               v_ae.exception_kind, v_want, v_code.code, v_code.is_active, v_code.is_statutory_premium),
        jsonb_build_object('expected_code', v_want, 'supplied_code', v_code.code,
                           'allowedResolutions', to_jsonb(v_allowed)));
    end if;

    -- ================================================================ RD 1 / RD 2 / RD 3
    -- 🚨 THE DOUBLE-WRITE GUARD, READING BOTH WRITERS' LINK KEYS. `hr.recompute_apply` may already
    -- have written this premium; a superseded row never counts; and the key stays per EARNING CODE
    -- so a meal premium and a rest premium on one day remain TWO lines.
    select wi.id,
           case when wi.earning_code_id = v_code.id then 'same_earning_code_same_day'
                when wi.calc ->> 'premium_for_exception_id' = v_ae.id::text
                     then 'already_written_by_the_recompute_lane_for_this_exception'
                else 'already_written_for_this_exception' end
      into v_existing, v_why
      from hr.work_interval wi
     where wi.employment_id = v_ae.employment_id
       and wi.is_current
       and wi.interval_kind = 'premium_only'
       and wi.local_work_date = v_ae.local_work_date
       and (wi.earning_code_id = v_code.id
            or wi.calc ->> 'premium_for_exception_id'  = v_ae.id::text
            or wi.calc ->> 'premium_from_exception_id' = v_ae.id::text
            or wi.id = v_ae.work_interval_id)
     order by case when wi.earning_code_id = v_code.id then 0 else 1 end
     limit 1;

    if v_existing is not null then
      v_capped := true;
    else
      select wi.workweek_id into v_ww
        from hr.work_interval wi
       where wi.employment_id = v_ae.employment_id
         and wi.local_work_date = v_ae.local_work_date and wi.is_current
       limit 1;
      if v_ww is null then
        select ww.id into v_ww from hr.workweek ww
         where ww.employment_id = v_ae.employment_id
           and v_ae.local_work_date between ww.week_start_local_date
                                        and (ww.week_start_local_date + 6)
         order by ww.week_start_local_date desc limit 1;
      end if;
      if v_ww is null then
        return hr._time_refusal('hr_no_workweek_for_premium',
          format('There is no computed workweek covering %s for this employment, so a premium line has nowhere to attach. The premium is still owed — run the recompute for this period first, then resolve this exception again.', v_ae.local_work_date),
          jsonb_build_object('employment_id', v_ae.employment_id,
                             'local_work_date', v_ae.local_work_date,
                             'door', 'E-11 POST /hr/time/recompute',
                             'premium_still_owed', true,
                             'allowedResolutions', to_jsonb(v_allowed)));
      end if;

      perform hr.arm_write();
      insert into hr.work_interval
        (organization_id, employment_id, workweek_id, pay_period_id,
         interval_kind, hours_category, earning_code_id,
         started_at, ended_at, hours, rate, amount, is_overtime,
         source_punch_ids, rounding_applied_minutes, is_current,
         work_location_id, jurisdiction_id, tz, local_work_date,
         rule_version_ids, engine_key, engine_version, calc)
      values (v_ae.organization_id, v_ae.employment_id, v_ww,
              nullif(v_lock ->> 'pay_period_id','')::uuid,
              'premium_only', 'premium', v_code.id,
              null, null, 1.0, null,
              -- money is never fabricated: one hour AT THE REGULAR RATE is the engine's figure
              null, false,
              case when v_ae.punch_id is not null then ARRAY[v_ae.punch_id] else '{}'::uuid[] end,
              0, true,
              v_ae.work_location_id, v_ae.jurisdiction_id, v_ae.tz, v_ae.local_work_date,
              v_ae.rule_version_ids, v_ae.engine_key, v_ae.engine_version,
              jsonb_build_object(
                -- 🚨 RD 1: BOTH link keys, so the recompute lane's guard can see this row too
                'premium_from_exception_id', v_ae.id,
                'premium_for_exception_id', v_ae.id,
                'written_by', 'hr.attendance_exception_resolve',
                'exception_kind', v_ae.exception_kind,
                'severity', v_ae.severity,
                'hours', 1.0,
                'statutory_hours', 1.0,
                'rounding_not_applicable', true,
                'amount_absent', jsonb_build_object(
                  'absent', true, 'advisory', false, 'money_withheld', false,
                  'incomplete', to_jsonb(ARRAY['regular_rate_of_pay_for_the_workweek']),
                  'note', 'No amount is shown because one hour of statutory premium is one hour AT THE REGULAR RATE, and that rate is computed by the recompute engine. This is not zero, and the premium is owed.'),
                'rest_premium_daily_cap', v_ae.exception_kind = 'rest_not_provided',
                'never_merged_with', 'A meal premium and a rest premium on the same day are two separate lines.'))
      returning id into v_new;
      v_written := v_written || hr._time_interval_json(v_new);
    end if;
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  perform hr.arm_write();
  update hr.attendance_exception
     set resolution_state = p_resolution_state,
         resolution_note = coalesce(v_note, resolution_note),
         resolved_at = case when p_resolution_state in ('open') then null else now() end,
         resolved_by_employment_id = case when p_resolution_state in ('open') then null else v_actor end,
         premium_earning_code_id = coalesce(v_code.id, premium_earning_code_id),
         work_interval_id = coalesce(v_new, v_existing, work_interval_id)
   where id = p_exception_id;

  return hr._time_ok(jsonb_build_object(
    'exception', hr._time_exception_json(p_exception_id),
    'intervalsWritten', v_written,
    'premiumAlreadyPresent', v_capped,
    'premiumAlreadyPresentReason', v_why,
    'existingPremiumIntervalId', v_existing,
    'notice', case
      when v_capped and v_why like 'already_written_by_the_recompute_lane%'
        then 'The recompute lane had already written this premium for this exception, so no second line was added. The premium is paid once.'
      when v_capped and v_ae.exception_kind = 'rest_not_provided'
        then 'A rest premium was already written for this day. The rest premium is capped at one per day, so no second line was added — the existing one stands.'
      when v_capped
        then 'A meal premium for this day already exists, so no duplicate was written.'
      when v_new is not null and v_ae.exception_kind = 'meal_not_provided'
        then 'A meal premium line was written for this day. If a rest premium is also owed today it is a SEPARATE line — the two are never merged.'
      when v_new is not null
        then 'A rest premium line was written for this day. It is capped at one per day, and it is never merged with a meal premium.'
      when p_resolution_state = 'escalated'
        then 'This exception is marked escalated and surfaces to HR. There is no workflow step behind an attendance exception today, so nothing was routed through the approval engine.'
      else null end,
    'allowedResolutions', to_jsonb(v_allowed)));
end $fn$;

comment on function hr.attendance_exception_resolve is
  'SPEC-TIME §2.6 / §4.3 / L3-14 — the manager''s one act on an attendance exception. `excused` is REFUSED on severity=violation and that is not configurable; `excused` without a note is refused; a locked period is refused with the adjustment lane named. Where a premium is owed it writes interval_kind=premium_only, hours=1.0, MEAL_PREMIUM/REST_PREMIUM, the attestation punch id in source_punch_ids and NO amount. The double-write guard reads BOTH writers'' exception-link keys as well as the (day, earning code) key, so hr.recompute_apply and this function can never both pay one premium; superseded rows are excluded. The cap is per earning code, so a meal premium and a rest premium on one day remain two lines and are never merged. Every response returns allowedResolutions.';

do $$
declare f text;
begin
  foreach f in array ARRAY['hr.attendance_exception_resolve(uuid,text,text,uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'attendance_exception_resolve';

  -- RD 1: the guard reads BOTH writers' link keys
  if v_src not like '%premium_for_exception_id%' or v_src not like '%premium_from_exception_id%' then
    raise exception 'hr_l3_29: the guard must read both exception-link keys (hr.recompute_apply writes premium_for_exception_id)';
  end if;
  -- RD 2: a superseded premium never suppresses one that is owed
  if v_src not like '%wi.is_current%' then
    raise exception 'hr_l3_29: the guard must exclude superseded rows';
  end if;
  -- RD 3: the cap stays per EARNING CODE so meal and rest remain two lines
  if v_src not like '%wi.earning_code_id = v_code.id%' then
    raise exception 'hr_l3_29: the guard must key on the earning code, or a meal and a rest premium on one day would merge';
  end if;
  -- the row this lane writes must be visible to the recompute lane's own guard
  if v_src not like '%''premium_for_exception_id'', v_ae.id%' then
    raise exception 'hr_l3_29: this lane must stamp premium_for_exception_id so hr.recompute_apply can see its row';
  end if;
end $$;
