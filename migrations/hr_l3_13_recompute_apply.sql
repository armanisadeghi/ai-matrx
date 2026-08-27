-- HR domain L3 — migration 13 (register item HRB-015, lane L3 punch + kiosk).
-- Full header and RECORDED TECHNICAL DECISIONS live in
-- matrx-frontend/migrations/hr_l3_13_recompute_apply.sql.
--
-- THE SANCTIONED PERSIST DOOR FOR E-11. The aidream time engine computes correctly but cannot
-- persist: `hr._guard_hr_write` refuses Python-side writes to `hr.*` (correctly - SPEC-ACCESS law 2
-- says every hr write goes through a definer RPC that arms the guard), and no such RPC existed for
-- the computed lane. This is it.
-- Applied live as `hr_l3_13_recompute_apply`. Idempotent.

create or replace function hr.recompute_apply(
  p_employment_id   uuid,
  p_workweek        jsonb,
  p_intervals       jsonb,
  p_engine          jsonb default '{}'::jsonb,
  p_idempotency_key text  default null)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_em        hr.employment%rowtype;
  v_org       uuid;
  v_ww        hr.workweek%rowtype;
  v_ww_id     uuid;
  v_lock      jsonb;
  v_wk_start  timestamptz;
  v_wk_end    timestamptz;
  v_period    uuid;
  v_engine_k  text := coalesce(p_engine ->> 'engine_key', 'hr.time_engine');
  v_engine_v  text := coalesce(p_engine ->> 'engine_version', 'unversioned');
  v_batch     uuid := gen_random_uuid();
  v_iv        jsonb;
  v_new_ids   uuid[] := '{}';
  v_sup       uuid[] := '{}';
  v_id        uuid;
  v_amount    numeric;
  v_advisory  boolean;
  v_withheld  int := 0;
  v_prem      jsonb := '[]'::jsonb;
  v_ec        uuid;
  r           record;
  v_day       date;
begin
  ---------------------------------------------------------------- 0. arguments
  if p_employment_id is null or p_workweek is null or p_intervals is null then
    return hr._punch_refusal('hr_recompute_arguments_incomplete',
      'A recompute needs an employment, a workweek envelope and an interval set.');
  end if;
  if jsonb_typeof(p_intervals) <> 'array' then
    return hr._punch_refusal('hr_recompute_intervals_not_an_array',
      'The interval set must be a JSON array, even when it is empty.');
  end if;

  select * into v_em from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then
    return hr._punch_refusal('hr_employment_not_found',
      'That employment record does not exist, so there is nothing to recompute.');
  end if;
  v_org := v_em.organization_id;

  v_wk_start := (p_workweek ->> 'week_start_at')::timestamptz;
  v_wk_end   := (p_workweek ->> 'week_end_at')::timestamptz;
  if v_wk_start is null or v_wk_end is null then
    return hr._punch_refusal('hr_recompute_workweek_unbounded',
      'The workweek envelope must carry week_start_at and week_end_at.');
  end if;

  ---------------------------------------------------------------- 1. authority (decision 2)
  if not (current_user in ('service_role','postgres')
          or coalesce((hr._can_edit_punch(v_uid, p_employment_id,
                        (p_workweek ->> 'week_start_local_date')::date) ->> 'ok')::boolean, false)
          or hr._punch_capability(v_uid, 'working_record.write', p_employment_id,
                                  (p_workweek ->> 'week_start_local_date')::date)) then
    return hr._punch_refusal('hr_no_recompute_authority',
      'Recomputing someone''s hours needs the engine service role, or working_record.write over '
      || 'that employee. Neither applies here.',
      jsonb_build_object('needed', jsonb_build_array('service_role', 'working_record.write'),
                         'subject_employment_id', p_employment_id));
  end if;

  ---------------------------------------------------------------- 2. the period state machine
  v_lock := hr._punch_period_lock(p_employment_id, (v_wk_end at time zone
              coalesce(p_workweek ->> 'tz', 'UTC'))::date);
  if coalesce((v_lock ->> 'locked')::boolean, false) then
    return hr._punch_refusal('hr_period_locked',
      'The pay period covering this workweek is ' || (v_lock ->> 'state')
      || ', so its computed hours can no longer be replaced. A correction after lock rides the '
      || 'next export as a time adjustment, tagged to the original period.',
      v_lock || jsonb_build_object('door', 'hr.time_adjustment_create', 'http_semantics', 423));
  end if;
  v_period := nullif(v_lock ->> 'pay_period_id', '')::uuid;

  ---------------------------------------------------------------- 3. replay (decision 3)
  select * into v_ww from hr.workweek
   where employment_id = p_employment_id and week_start_at = v_wk_start;
  if found and p_idempotency_key is not null
     and (v_ww.calc ->> 'recompute_idempotency_key') = p_idempotency_key then
    return jsonb_build_object('ok', true, 'replayed', true,
      'workweek_id', v_ww.id,
      'intervals_written', 0, 'intervals_superseded', 0,
      'current_intervals', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', w.id, 'local_work_date', w.local_work_date, 'hours', w.hours,
            'earning_code_id', w.earning_code_id, 'is_overtime', w.is_overtime)), '[]'::jsonb)
          from hr.work_interval w where w.workweek_id = v_ww.id and w.is_current));
  end if;

  ---------------------------------------------------------------- 4. the workweek row
  perform hr.arm_write();
  insert into hr.workweek (
    organization_id, employment_id, pay_group_id, week_start_at, week_end_at,
    week_start_dow, week_start_time, week_start_local_date, tz, jurisdiction_id,
    hours_worked, hours_regular, hours_overtime, hours_doubletime, hours_paid_leave,
    hours_unpaid_leave, hours_holiday, hours_on_call, hours_of_service,
    weighted_average_regular_rate, is_final,
    rule_version_ids, engine_key, engine_version, calc, computed_at)
  values (
    v_org, p_employment_id,
    coalesce((p_workweek ->> 'pay_group_id')::uuid, v_em.pay_group_id),
    v_wk_start, v_wk_end,
    coalesce((p_workweek ->> 'week_start_dow')::smallint, 0),
    coalesce((p_workweek ->> 'week_start_time')::time, '00:00'),
    coalesce((p_workweek ->> 'week_start_local_date')::date,
             (v_wk_start at time zone coalesce(p_workweek ->> 'tz','UTC'))::date),
    coalesce(p_workweek ->> 'tz', 'UTC'),
    (p_workweek ->> 'jurisdiction_id')::uuid,
    coalesce((p_workweek ->> 'hours_worked')::numeric, 0),
    coalesce((p_workweek ->> 'hours_regular')::numeric, 0),
    coalesce((p_workweek ->> 'hours_overtime')::numeric, 0),
    coalesce((p_workweek ->> 'hours_doubletime')::numeric, 0),
    coalesce((p_workweek ->> 'hours_paid_leave')::numeric, 0),
    coalesce((p_workweek ->> 'hours_unpaid_leave')::numeric, 0),
    coalesce((p_workweek ->> 'hours_holiday')::numeric, 0),
    coalesce((p_workweek ->> 'hours_on_call')::numeric, 0),
    coalesce((p_workweek ->> 'hours_of_service')::numeric, 0),
    (p_workweek ->> 'weighted_average_regular_rate')::numeric,
    coalesce((p_workweek ->> 'is_final')::boolean, false),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                coalesce(p_workweek -> 'rule_version_ids', '[]'::jsonb)) x), '{}'::uuid[]),
    v_engine_k, v_engine_v,
    coalesce(p_workweek -> 'calc', '{}'::jsonb)
      || jsonb_build_object('recompute_batch_id', v_batch,
                            'recompute_idempotency_key', p_idempotency_key),
    now())
  on conflict (employment_id, week_start_at) do update
    set pay_group_id = excluded.pay_group_id,
        week_end_at = excluded.week_end_at,
        week_start_dow = excluded.week_start_dow,
        week_start_time = excluded.week_start_time,
        week_start_local_date = excluded.week_start_local_date,
        tz = excluded.tz, jurisdiction_id = excluded.jurisdiction_id,
        hours_worked = excluded.hours_worked, hours_regular = excluded.hours_regular,
        hours_overtime = excluded.hours_overtime, hours_doubletime = excluded.hours_doubletime,
        hours_paid_leave = excluded.hours_paid_leave, hours_unpaid_leave = excluded.hours_unpaid_leave,
        hours_holiday = excluded.hours_holiday, hours_on_call = excluded.hours_on_call,
        hours_of_service = excluded.hours_of_service,
        weighted_average_regular_rate = excluded.weighted_average_regular_rate,
        is_final = excluded.is_final,
        rule_version_ids = excluded.rule_version_ids,
        engine_key = excluded.engine_key, engine_version = excluded.engine_version,
        calc = excluded.calc, computed_at = excluded.computed_at
  returning id into v_ww_id;

  ---------------------------------------------------------------- 5. write the new intervals
  for v_iv in select * from jsonb_array_elements(p_intervals) loop
    -- 🚨 decision 4: MONEY NEVER COMES FROM AN ADVISORY RULE. Omit the amount and flag it -
    -- never a zero, never a dash, never a guess.
    v_advisory := coalesce((v_iv #>> '{calc,advisory}')::boolean, false)
               or jsonb_array_length(coalesce(v_iv #> '{calc,advisory}', '[]'::jsonb)) > 0
               or coalesce((v_iv ->> 'advisory')::boolean, false);
    v_amount := (v_iv ->> 'amount')::numeric;
    if v_advisory and v_amount is not null then
      v_amount := null; v_withheld := v_withheld + 1;
    end if;

    v_ec := coalesce((v_iv ->> 'earning_code_id')::uuid,
                     (select ec.id from hr.earning_code ec
                       where ec.organization_id = v_org and ec.code = (v_iv ->> 'earning_code')
                         and ec.deleted_at is null limit 1));
    if v_ec is null then
      return hr._punch_refusal('hr_recompute_unknown_earning_code',
        'An interval names an earning code this organization does not have. Every computed interval '
        || 'carries an earning code; the badge reads its name, never an enum token.',
        jsonb_build_object('earning_code', v_iv ->> 'earning_code',
                           'local_work_date', v_iv ->> 'local_work_date'));
    end if;

    perform hr.arm_write();
    insert into hr.work_interval (
      organization_id, employment_id, position_assignment_id, workweek_id, pay_period_id,
      shift_id, leave_request_id, holiday_id,
      interval_kind, hours_category, earning_code_id,
      started_at, ended_at, hours, rate, amount, is_overtime,
      source_punch_ids, rounding_applied_minutes, is_current,
      work_location_id, jurisdiction_id, tz, local_work_date,
      rule_version_ids, engine_key, engine_version, calc, computed_at)
    values (
      v_org, p_employment_id, (v_iv ->> 'position_assignment_id')::uuid, v_ww_id,
      coalesce((v_iv ->> 'pay_period_id')::uuid, v_period),
      (v_iv ->> 'shift_id')::uuid, (v_iv ->> 'leave_request_id')::uuid, (v_iv ->> 'holiday_id')::uuid,
      coalesce(v_iv ->> 'interval_kind', 'worked'),
      coalesce(v_iv ->> 'hours_category', 'worked'),
      v_ec,
      (v_iv ->> 'started_at')::timestamptz, (v_iv ->> 'ended_at')::timestamptz,
      coalesce((v_iv ->> 'hours')::numeric, 0),
      (v_iv ->> 'rate')::numeric, v_amount,
      coalesce((v_iv ->> 'is_overtime')::boolean, false),
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                  coalesce(v_iv -> 'source_punch_ids', '[]'::jsonb)) x), '{}'::uuid[]),
      coalesce((v_iv ->> 'rounding_applied_minutes')::numeric, 0),
      true,
      (v_iv ->> 'work_location_id')::uuid, (v_iv ->> 'jurisdiction_id')::uuid,
      coalesce(v_iv ->> 'tz', coalesce(p_workweek ->> 'tz','UTC')),
      (v_iv ->> 'local_work_date')::date,
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                  coalesce(v_iv -> 'rule_version_ids', '[]'::jsonb)) x), '{}'::uuid[]),
      v_engine_k, v_engine_v,
      coalesce(v_iv -> 'calc', '{}'::jsonb)
        || jsonb_build_object('recompute_batch_id', v_batch)
        || case when v_advisory then jsonb_build_object('amount_withheld_advisory', true) else '{}'::jsonb end,
      now())
    returning id into v_id;
    v_new_ids := v_new_ids || v_id;
  end loop;

  ---------------------------------------------------------------- 6. statutory premiums (decision 5)
  for r in
    select e.id, e.exception_kind, e.local_work_date, e.work_location_id, e.jurisdiction_id, e.tz
      from hr.attendance_exception e
     where e.employment_id = p_employment_id
       and e.exception_kind in ('meal_not_provided','rest_not_provided')
       and e.resolution_state in ('open','acknowledged')
       and e.local_work_date >= (v_wk_start at time zone coalesce(p_workweek ->> 'tz','UTC'))::date
       and e.local_work_date <= (v_wk_end   at time zone coalesce(p_workweek ->> 'tz','UTC'))::date
  loop
    select ec.id into v_ec from hr.earning_code ec
     where ec.organization_id = v_org and ec.deleted_at is null and ec.is_active
       and ec.code = case when r.exception_kind = 'meal_not_provided'
                          then 'MEAL_PREMIUM' else 'REST_PREMIUM' end
     limit 1;
    if v_ec is null then
      continue;   -- the code is not seeded for this org; the exception stays open and visible
    end if;

    -- 🚨 capped at ONE per day per axis (SPEC-TIME 3.2): a second rest premium on one day is a bug
    if exists (select 1 from hr.work_interval w
                where w.employment_id = p_employment_id and w.is_current
                  and w.local_work_date = r.local_work_date
                  and w.earning_code_id = v_ec) then
      continue;
    end if;

    perform hr.arm_write();
    insert into hr.work_interval (
      organization_id, employment_id, workweek_id, pay_period_id,
      interval_kind, hours_category, earning_code_id,
      hours, is_overtime, source_punch_ids, rounding_applied_minutes, is_current,
      work_location_id, jurisdiction_id, tz, local_work_date,
      rule_version_ids, engine_key, engine_version, calc, computed_at)
    values (
      v_org, p_employment_id, v_ww_id, v_period,
      'premium_only', 'premium', v_ec,
      -- 1.0 hours BY STATUTE, not a measured interval, and rounding never applies to it (10)
      1.0, false, '{}'::uuid[], 0, true,
      r.work_location_id, r.jurisdiction_id, r.tz, r.local_work_date,
      '{}'::uuid[], v_engine_k, v_engine_v,
      jsonb_build_object('premium_for_exception_id', r.id,
                         'exception_kind', r.exception_kind,
                         'statutory_hours', 1.0,
                         'rounding_not_applicable', true,
                         'recompute_batch_id', v_batch),
      now())
    returning id into v_id;
    v_new_ids := v_new_ids || v_id;

    perform hr.arm_write();
    update hr.attendance_exception
       set premium_earning_code_id = v_ec, work_interval_id = v_id
     where id = r.id;

    v_prem := v_prem || jsonb_build_array(jsonb_build_object(
      'exception_id', r.id, 'exception_kind', r.exception_kind,
      'work_interval_id', v_id, 'local_work_date', r.local_work_date));
  end loop;

  ---------------------------------------------------------------- 7. supersede, NEVER delete
  perform hr.arm_write();
  with stale as (
    update hr.work_interval w
       set is_current = false,
           superseded_by_id = coalesce(
             (select n.id from hr.work_interval n
               where n.id = any(v_new_ids)
                 and n.local_work_date = w.local_work_date
                 and n.earning_code_id = w.earning_code_id
               limit 1),
             w.superseded_by_id),
           calc = w.calc || jsonb_build_object('superseded_by_recompute_batch_id', v_batch)
     where w.employment_id = p_employment_id
       and w.workweek_id = v_ww_id
       and w.is_current
       and not (w.id = any(v_new_ids))
    returning w.id)
  select coalesce(array_agg(id), '{}'::uuid[]) into v_sup from stale;

  ---------------------------------------------------------------- 8. the answer
  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'workweek_id', v_ww_id,
    'pay_period_id', v_period,
    'recompute_batch_id', v_batch,
    'intervals_written', cardinality(v_new_ids),
    'intervals_superseded', cardinality(v_sup),
    'superseded_interval_ids', to_jsonb(v_sup),
    'premium_intervals', v_prem,
    'amounts_withheld_advisory', v_withheld,
    'money_note', case when v_withheld > 0
      then 'One or more intervals had an amount withheld because a contributing rule is advisory. '
        || 'The hours stand; the amount is absent by design and must render as a flag with a door '
        || 'to the rule, never as a zero.' end,
    'current_intervals', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', w.id, 'local_work_date', w.local_work_date, 'hours', w.hours,
          'hours_category', w.hours_category, 'earning_code_id', w.earning_code_id,
          'is_overtime', w.is_overtime, 'amount', w.amount)), '[]'::jsonb)
        from hr.work_interval w where w.workweek_id = v_ww_id and w.is_current));
end
$$;

comment on function hr.recompute_apply(uuid, jsonb, jsonb, jsonb, text) is
  'E-11 persist door: the sanctioned writer of hr.work_interval / hr.workweek. Supersedes, never deletes. Refuses into a locked period by name. Withholds amount on any advisory-contributed interval.';

revoke all on function hr.recompute_apply(uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function hr.recompute_apply(uuid, jsonb, jsonb, jsonb, text) to service_role;

create or replace function public.hr_recompute_apply(
  p_employment_id uuid, p_workweek jsonb, p_intervals jsonb,
  p_engine jsonb default '{}'::jsonb, p_idempotency_key text default null)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$
  select hr.recompute_apply(p_employment_id, p_workweek, p_intervals, p_engine, p_idempotency_key);
$$;

comment on function public.hr_recompute_apply(uuid, jsonb, jsonb, jsonb, text) is
  'TD-1 wrapper: delegates to hr.recompute_apply. No logic.';

revoke all on function public.hr_recompute_apply(uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.hr_recompute_apply(uuid, jsonb, jsonb, jsonb, text) to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='hr' and p.proname='recompute_apply') then
    raise exception 'hr_l3_13: hr.recompute_apply did not land';
  end if;
  if has_function_privilege('anon','hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)','EXECUTE') then
    raise exception 'hr_l3_13: anon can execute the recompute persist door';
  end if;
end $$;

