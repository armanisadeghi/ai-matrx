-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Round-12 P2: the DST sentence sat under a row whose figures it did not describe.
--
-- 🚨 THE DERIVATION WAS NOT WRONG. THE GRAIN WAS. Reported as an off-by-one in the wall-clock
-- length, with the suspicion that wall was being computed as elapsed-minus-shift. Measured against
-- the live rows before changing anything, and it is not:
--
--   interval 2c6d6eb2  local 00:30 -> 07:30   raw SQL wall 7   hr._interval_time_facts wall 7
--   interval 7f387bac  local 00:30 -> 08:30   raw SQL wall 8   hr._interval_time_facts wall 8
--
-- The shipped function already computes the local span between the stamped local endpoints, which
-- is exactly what the ruling asks for, and the raw SQL agrees with it on both DST directions.
--
-- WHAT IS ACTUALLY WRONG: the 9.00 row is a DAY, and the sentence was an INTERVAL's.
-- 2026-11-01 holds TWO intervals -- 00:30-07:30 (8 hours) and 07:30-08:30 (1 hour) -- summing to
-- the 9.00 the surface prints. The sentence beneath it belonged to the first interval alone
-- ("wall-clock-7 ... measured 8"), true of that interval and describing neither the row it sat
-- under nor the day the reader is looking at. At the DAY grain the figures are the ruled ones:
--
--   2026-11-01 (fall)    local 00:30 -> 08:30   wall 8   measured 9   day row 9.00
--   2027-03-14 (spring)  local 00:30 -> 08:30   wall 8   measured 7   day row 7.00
--
-- So the ruled sentences fall out of the day grain for BOTH directions, and the spring case stays
-- right because nothing about the derivation changes -- which is the check the ruling asked for.
--
-- Authority: coordinator ruling (round-12 P2); SPEC-TIME §9 rules 3 and 7.
--
-- Applied live as `hr_l3_57_dst_sentence_matches_its_row`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE DAY GRAIN IS ADDED; THE INTERVAL GRAIN IS KEPT AND UNCHANGED. Both are true, and a
--    renderer that shows interval rows should have an interval sentence. What was missing was a
--    sentence for the row the surface actually prints. Changing the interval derivation to make the
--    day read correctly would have made the interval read wrongly -- and would have been the sign
--    flip the ruling warned against.
-- 2. 🚨 DAY WALL-CLOCK IS THE SUM OF EACH INTERVAL'S OWN LOCAL SPAN, NOT THE OUTER ENVELOPE. On
--    these fixtures the two agree (8 either way, the intervals are contiguous). They part company
--    the moment a day has an unpaid gap: the envelope would swallow the meal break and report a
--    wall-clock length an hour longer than anyone worked, and the sentence would blame daylight
--    saving for a lunch. Summing each interval's local span excludes gaps by construction while
--    still deriving every figure from local endpoints -- never from elapsed minus the shift.
-- 3. `measured` QUOTES THE ROW'S OWN NUMBER. That is the entire point of the finding: the sentence
--    has to describe the figure printed beside it. At day grain it is the day total; at interval
--    grain it is that interval's `hours`. `hr._interval_time_facts` therefore takes the stored
--    hours and quotes them, falling back to the instant difference only when none is supplied.
--    Where rounding has moved an interval's hours away from its raw elapsed time, quoting elapsed
--    would reintroduce exactly this defect in a new place. `elapsed_hours` stays in the payload as
--    the untouched instant truth.
-- 4. ADDING A PARAMETER MEANS DROP-AND-CREATE, NOT REPLACE. `CREATE OR REPLACE` with a different
--    argument count makes an OVERLOAD; leaving both live would make the existing four-argument call
--    ambiguous. Same trap as hr_l3_49: the five-argument form is created, the caller is repointed,
--    and the four-argument form is dropped in the same transaction.
-- 5. THE WEEK SENTENCES WERE ALREADY SERVED, AND THIS MIGRATION ASSERTS WHERE. hr_l3_56 put them on
--    each element of `weeks[]` as `weeks[].dst.sentence`, which is the per-workweek level of the
--    timesheet response. Verified again below rather than asserted from memory.
-- 6. THE ASSERTION THAT WOULD HAVE CAUGHT THIS SHIPS WITH THE FIX. At every grain that emits a
--    sentence, the number the sentence quotes must equal the number that grain's row prints. It is
--    asserted here for both DST directions, and it is the check that turns "the sentence is true of
--    something" into "the sentence is true of THIS row".

-- ── 1. the interval sentence quotes its row's hours (decisions 3 and 4) ──────────────────────
create or replace function hr._interval_time_facts(
  p_started timestamptz, p_ended timestamptz, p_tz text, p_local_work_date date, p_hours numeric)
returns jsonb
language plpgsql stable
as $fn$
declare v_ls timestamp; v_le timestamp; v_elapsed numeric; v_wall numeric;
        v_measured numeric; v_dst jsonb; v_out jsonb;
begin
  if p_started is null or p_tz is null then
    return jsonb_build_object('crosses_midnight', false, 'continues_into_date', null, 'dst', null);
  end if;

  v_ls := p_started at time zone p_tz;
  v_le := case when p_ended is not null then p_ended at time zone p_tz end;

  v_out := jsonb_build_object(
    'crosses_midnight',    coalesce(v_le::date > p_local_work_date, false),
    'continues_into_date', case when v_le::date > p_local_work_date then v_le::date end);

  if p_ended is null then
    return v_out || jsonb_build_object('dst', null);
  end if;

  -- the local span between the stamped endpoints, and nothing else
  v_wall    := round(extract(epoch from (v_le - v_ls))         / 3600.0, 4);
  v_elapsed := round(extract(epoch from (p_ended - p_started)) / 3600.0, 4);
  -- decision 3: the sentence quotes the number printed beside it
  v_measured := coalesce(p_hours, v_elapsed);

  v_out := v_out || jsonb_build_object(
    'wall_clock_hours', v_wall, 'elapsed_hours', v_elapsed, 'measured_hours', v_measured);

  v_dst := hr._dst_transition(p_tz, p_started, p_ended);
  if v_dst is null then
    return v_out || jsonb_build_object('dst', null);
  end if;

  return v_out || jsonb_build_object('dst', v_dst || jsonb_build_object(
    'sentence', 'Clocks moved ' || (v_dst ->> 'direction') || ' at ' || (v_dst ->> 'at_local')
      || '; this wall-clock-' || hr._hours_text(v_wall)
      || ' shift measured '   || hr._hours_text(v_measured) || ' hours.'));
end
$fn$;

-- ── 2. the day grain, which is the row the surface prints (decisions 1–3) ────────────────────
create or replace function hr._day_time_facts(
  p_employment_id uuid, p_local_work_date date, p_pay_period_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare v_tz text; v_min timestamptz; v_max timestamptz;
        v_wall numeric; v_measured numeric; v_n int; v_dst jsonb;
begin
  select max(wi.tz), min(wi.started_at), max(wi.ended_at),
         -- decision 2: each interval's OWN local span, summed. Gaps excluded by construction.
         sum(extract(epoch from ((wi.ended_at at time zone wi.tz)
                               - (wi.started_at at time zone wi.tz))) / 3600.0),
         sum(wi.hours), count(*)
    into v_tz, v_min, v_max, v_wall, v_measured, v_n
    from hr.work_interval wi
   where wi.employment_id = p_employment_id
     and wi.is_current
     and wi.local_work_date = p_local_work_date
     and (wi.pay_period_id = p_pay_period_id or wi.pay_period_id is null)
     and wi.started_at is not null and wi.ended_at is not null;

  if v_tz is null or v_min is null then return null; end if;

  v_wall     := round(v_wall, 4);
  v_measured := round(v_measured, 4);
  v_dst      := hr._dst_transition(v_tz, v_min, v_max);

  if v_dst is null then
    return jsonb_build_object('wall_clock_hours', v_wall, 'measured_hours', v_measured,
                              'interval_count', v_n, 'dst', null);
  end if;

  return jsonb_build_object('wall_clock_hours', v_wall, 'measured_hours', v_measured,
                            'interval_count', v_n,
    'dst', v_dst || jsonb_build_object(
      'sentence', 'Clocks moved ' || (v_dst ->> 'direction') || ' at ' || (v_dst ->> 'at_local')
        || '; this wall-clock-' || hr._hours_text(v_wall)
        || ' shift measured '   || hr._hours_text(v_measured) || ' hours.'));
end
$fn$;

revoke execute on function hr._interval_time_facts(timestamptz,timestamptz,text,date,numeric) from public, anon;
revoke execute on function hr._day_time_facts(uuid,date,uuid) from public, anon;

-- ── 3. repoint hr.timesheet_get, then retire the old arity (decision 4) ──────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.timesheet_get(uuid,uuid)'::regprocedure);

  if position('_day_time_facts' in v_def) > 0 then
    raise notice 'hr_l3_57: timesheet_get already serves the day grain';
    return;
  end if;

  -- the interval call gains the row's hours
  if position('hr._interval_time_facts(wi.started_at, wi.ended_at, wi.tz, wi.local_work_date)' in v_def) = 0 then
    raise exception 'hr_l3_57: the interval time_facts call has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    'hr._interval_time_facts(wi.started_at, wi.ended_at, wi.tz, wi.local_work_date)',
    'hr._interval_time_facts(wi.started_at, wi.ended_at, wi.tz, wi.local_work_date, wi.hours)');

  -- the day gains its own block, beside the total it describes
  if position('''day_total_hours'', coalesce(iv.total_hours, 0),' in v_def) = 0 then
    raise exception 'hr_l3_57: the day projection has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '''day_total_hours'', coalesce(iv.total_hours, 0),',
    '''day_total_hours'', coalesce(iv.total_hours, 0),' || E'\n' ||
    '      -- hr_l3_57: the DAY''''s own DST sentence. A day can hold several intervals, and the' || E'\n' ||
    '      -- sentence has to describe the row the surface prints, not one interval inside it.' || E'\n' ||
    '      ''time_facts'', hr._day_time_facts(p_employment_id, dd.d, p_pay_period_id),');

  execute v_def;
end
$mig$;

drop function if exists hr._interval_time_facts(timestamptz, timestamptz, text, date);

-- ── 4. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare
  v_src text; v_fall jsonb; v_spring jsonb; v_iv jsonb;
  v_fall_total numeric; v_spring_total numeric;
begin
  -- decision 4: exactly one arity survives
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_interval_time_facts') <> 1 then
    raise exception 'hr_l3_57: more than one _interval_time_facts arity is live';
  end if;

  select prosrc into v_src from pg_proc where oid = 'hr.timesheet_get(uuid,uuid)'::regprocedure;
  if position('_day_time_facts(p_employment_id, dd.d, p_pay_period_id)' in v_src) = 0 then
    raise exception 'hr_l3_57: the day grain is not served';
  end if;
  if position('wi.local_work_date, wi.hours)' in v_src) = 0 then
    raise exception 'hr_l3_57: the interval sentence does not quote its row''s hours';
  end if;
  -- decision 5: the week sentence stays where the client reads it
  if position('''dst'', hr._workweek_dst(ww.tz, ww.week_start_at, ww.week_end_at),' in v_src) = 0 then
    raise exception 'hr_l3_57: the per-workweek dst block was lost';
  end if;

  ---------------------------------------------------------------- decision 6: row-figure agreement
  -- FALL BACK: the day the finding was raised against
  v_fall := hr._day_time_facts('b51fc599-85e0-4966-931e-2dfecf4e9609', date '2026-11-01',
                               '9ccac609-a719-4e16-92ea-31d1add563c3');
  select sum(hours) into v_fall_total from hr.work_interval
   where employment_id = 'b51fc599-85e0-4966-931e-2dfecf4e9609'
     and is_current and local_work_date = date '2026-11-01';
  if (v_fall ->> 'measured_hours')::numeric <> v_fall_total then
    raise exception 'hr_l3_57: fall sentence quotes % but the day row prints %',
      v_fall ->> 'measured_hours', v_fall_total;
  end if;
  if (v_fall ->> 'wall_clock_hours')::numeric <> 8 or (v_fall ->> 'measured_hours')::numeric <> 9 then
    raise exception 'hr_l3_57: fall day is not wall-clock-8 / measured-9: %', v_fall::text;
  end if;
  if (v_fall #>> '{dst,sentence}') <>
     'Clocks moved back at 2:00 AM; this wall-clock-8 shift measured 9 hours.' then
    raise exception 'hr_l3_57: fall sentence is %', v_fall #>> '{dst,sentence}';
  end if;

  -- SPRING FORWARD: the side that was already right and must stay right
  v_spring := hr._day_time_facts('b51fc599-85e0-4966-931e-2dfecf4e9609', date '2027-03-14',
                                 '7191c32e-f7e2-4bdf-aa84-5f2835cc08f6');
  select sum(hours) into v_spring_total from hr.work_interval
   where employment_id = 'b51fc599-85e0-4966-931e-2dfecf4e9609'
     and is_current and local_work_date = date '2027-03-14';
  if (v_spring ->> 'measured_hours')::numeric <> v_spring_total then
    raise exception 'hr_l3_57: spring sentence quotes % but the day row prints %',
      v_spring ->> 'measured_hours', v_spring_total;
  end if;
  if (v_spring #>> '{dst,sentence}') <>
     'Clocks moved forward at 2:00 AM; this wall-clock-8 shift measured 7 hours.' then
    raise exception 'hr_l3_57: spring sentence regressed to %', v_spring #>> '{dst,sentence}';
  end if;

  -- and the interval grain still quotes ITS row, on both sides
  for v_iv in
    select hr._interval_time_facts(wi.started_at, wi.ended_at, wi.tz, wi.local_work_date, wi.hours)
           || jsonb_build_object('_row_hours', wi.hours)
      from hr.work_interval wi
     where wi.is_current and wi.started_at is not null
       and wi.local_work_date in (date '2026-11-01', date '2027-03-14')
       and wi.employment_id = 'b51fc599-85e0-4966-931e-2dfecf4e9609'
  loop
    if (v_iv ->> 'measured_hours')::numeric <> (v_iv ->> '_row_hours')::numeric then
      raise exception 'hr_l3_57: an interval sentence quotes % over a row of %',
        v_iv ->> 'measured_hours', v_iv ->> '_row_hours';
    end if;
  end loop;
end
$chk$;
