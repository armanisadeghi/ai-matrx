-- HR domain L3 — migration 1 of 7 (register item HRB-015, lane L3 punch + kiosk).
--
-- THE FOUNDATIONS the punch lane stands on: a knob reader that tolerates an unseeded row, the
-- jurisdiction stamper, the clock-state projection over the open punch chain, and the punch-edit
-- authority predicate. Nothing here writes `hr.punch`; files 02–05 do, and they are the only
-- things that ever will.
--
-- Authority: SPEC-TIME §1.1, §3.1, §8, §9, §13, §14 D1/D9/D11; SPEC-DATA-MODEL §7.1;
--            SPEC-ACCESS §1.4, §4.2; R-L3-READINESS L3-01…L3-05, U-04.
-- Applied live as `hr_l3_01_punch_foundations`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 `hr._knob` RAISES ON AN UNSEEDED KNOB, SO THE PUNCH LANE CANNOT CALL IT DIRECTLY FOR THE
--    KNOBS IT DOES NOT OWN. Verified live: `hr._knob` ends in `raise exception 'hr._knob: knob %.%
--    is not seeded'` — deliberate, per D13, so nobody silently hard-codes a value. But sixteen of
--    the SPEC-TIME §13 rows this lane READS are not seeded yet and belong to the seed lane, and a
--    clock that 500s because `near_duplicate_punch_window_seconds` has no row is a worse failure
--    than a documented default. `hr._punch_knob(key, default)` reads the same table, on the same
--    `hr.time_and_attendance` feature (R-CORE B1 snake_case — R-L3 U-01's hyphenated form is
--    superseded), and falls back to the SPEC-TIME §13 registered default. **It never invents a
--    value that is not in §13**, and `hr.punch_knobs_missing()` enumerates exactly which rows the
--    seed lane still owes so the fallback can never quietly become permanent.
--
-- 2. THE JURISDICTION STAMP IS A TWO-PASS RESOLUTION, BECAUSE THE INPUTS ARE CIRCULAR.
--    `{{JURIS}}` comes from the position assignment's location **as of `local_work_date`**
--    (SPEC-TIME §14 "Not a discrepancy"), but `local_work_date` is `occurred_at` rendered in that
--    location's `tz`. Pass 1 resolves the assignment as of the UTC date to obtain a tz; pass 2
--    recomputes `local_work_date` in that tz and re-resolves. When the two passes disagree (an
--    assignment that changed on exactly that boundary) pass 2 wins, because pass 2's date is the
--    one that gets stamped on the row. Never `now()`, never an IP lookup.
--
-- 3. THE STATE IS PROJECTED FROM THE OPEN CHAIN, NOT FROM THE CALENDAR DAY. The chain opens after
--    the employment's most recent non-voided `clock_out` and runs to the present, so a
--    cross-midnight shift is one chain and not two half-days (SPEC-TIME §9.4). `transfer` is legal
--    only from `clocked_in` and does not change the state (§3.1).
--
-- 4. ELAPSED MINUTES GO THROUGH `hr.elapsed_hours`, NEVER THROUGH `ended_at - started_at`.
--    SPEC-TIME §9.2 names naive subtraction a defect wherever it appears — including here. The
--    canonical helper takes local timestamps plus the tz and is DST-correct (`OT-DST-01/02`).
--
-- 5. 🚨 `time.edit_punch` DOES NOT EXIST IN ANY LIVE VOCABULARY, SO THE GATE IS COMPOSED FROM THE
--    PRIMITIVES THAT DO. SPEC-TIME §1.1 refuses a correction when the caller "lacks
--    `time.edit_punch` authority over the subject". Live, `hr.access_role.capabilities` holds no
--    `time.*` value on any of the nine roles, and `platform.categories` dimension
--    `hr_approval_action` holds `timecard_approve` / `timecard_attest` /
--    `timecard_correction_approve` and no punch-edit token. Minting a capability is Core C3's lane,
--    not this one. `hr._can_edit_punch` therefore composes three live facts and re-derives none of
--    their rules: (a) never yourself — the same RULE 1 `hr.can_approve` enforces, checked first so
--    no later arm can turn it back on; (b) `hr.capability(user,'working_record.write',subject)`,
--    which is what HR admin/owner reach actually is and is population-scoped; (c) otherwise defer
--    **entirely** to `hr.can_approve(user,'timecard_approve','hr.pay_period_employment', …)` for
--    the manager lane, because that predicate is the authority on who may act on a person's
--    timecard and a second implementation of it would drift on the first spec change.
--    **AMENDMENT OWED: SPEC-TIME §1.1 and §4.1 name a capability that has to be minted before it
--    can be cited.** Recorded, not silently substituted.
--
-- 6. `hr.can_approve`'s target must be an approvable table, and `hr.employment` is not one.
--    Verified live: `hr._approval_subject` allowlists `hr.pay_period_employment` and raises
--    `22023` on anything outside its map — `hr.employment` included. So arm (c) resolves the
--    subject's `hr.pay_period_employment` row for the work date first. When no such row exists yet
--    (the seed lane owns period creation) arm (c) is unavailable and the refusal says so by name
--    rather than reading as "you have no authority", which is the over-tightening failure
--    SPEC-ACCESS §4.2 weighs as heavily as a leak.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. The knob reader (decision 1)
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_knob(p_key text, p_default jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v jsonb;
begin
  select coalesce(k.value, k.default_value) into v
    from platform.feature_knob k
   where k.feature = 'hr.time_and_attendance' and k.key = p_key;
  return coalesce(v, p_default);
end
$$;

comment on function hr._punch_knob(text, jsonb) is
  'L3: reads an hr.time_and_attendance knob, falling back to its SPEC-TIME §13 registered default '
  'when the row is not seeded. hr._knob raises instead; see hr.punch_knobs_missing().';

-- The honest ledger of what the fallback is standing in for. Not a workaround — a debt list.
create or replace function hr.punch_knobs_missing()
returns table (feature text, key text, spec_default jsonb, owner text)
language sql
stable
as $$
  with owed(key, spec_default, owner) as (
    values
      ('near_duplicate_punch_window_seconds', '120'::jsonb,                        'seed lane (SPEC-TIME §13)'),
      ('punch_enabled_worker_classes',        '["employee","intern","seasonal"]',  'seed lane (SPEC-TIME §13, §8)'),
      ('geo_required_web_punch',              'false',                             'seed lane (SPEC-TIME §13, §4.9)'),
      ('max_geo_accuracy_m',                  '200',                               'seed lane (SPEC-TIME §13)'),
      ('web_punch_ip_verification',           '"off"',                             'seed lane (SPEC-TIME §13, §4.7)'),
      ('web_punch_ip_allowlist',              '[]',                                'seed lane (SPEC-TIME §13, §4.7)'),
      ('remote_worker_validation',            '"attest"',                          'seed lane (SPEC-TIME §13, §4.7)'),
      ('kiosk_cross_location_punch',          '"allow_with_flag"',                 'seed lane (SPEC-TIME §13, §3.3)'),
      ('kiosk_time_authority',                '"server"',                          'seed lane (SPEC-TIME §13, §3.3)'),
      ('kiosk_heartbeat_seconds',             '60',                                'seed lane (SPEC-TIME §13)'),
      ('kiosk_confirm_dismiss_seconds',       '5',                                 'seed lane (SPEC-TIME §13)'),
      ('workday_start_local',                 '"00:00"',                           'seed lane (SPEC-TIME §13, §9.5)'),
      ('workweek_start_day',                  '"sunday"',                          'seed lane (SPEC-TIME §13)'),
      ('variance_warn_minutes',               '15',                                'seed lane (SPEC-TIME §13)'),
      ('pairing_code_ttl_minutes',            '15',                                'seed lane (SPEC-TIME §13)')
  )
  select 'hr.time_and_attendance'::text, o.key, o.spec_default, o.owner
    from owed o
   where not exists (select 1 from platform.feature_knob k
                      where k.feature = 'hr.time_and_attendance' and k.key = o.key)
  union all
  select 'hr.clock'::text, x.key, x.spec_default, 'SPEC-UI-IA §10 owner (this lane reads, never registers — U-01)'::text
    from (values ('web_punch_enabled','true'::jsonb), ('kiosk_enabled','false'::jsonb)) x(key, spec_default)
   where not exists (select 1 from platform.feature_knob k
                      where k.feature = 'hr.clock' and k.key = x.key)
  order by 1, 2;
$$;

comment on function hr.punch_knobs_missing() is
  'L3 debt ledger: every SPEC-TIME §13 / SPEC-UI-IA §10 knob the punch lane READS that is not '
  'seeded. Non-empty means hr._punch_knob is standing on a documented default. Owned by the seed lane.';

-- The two availability switches live in another feature namespace (U-01: read, never register).
create or replace function hr._clock_knob(p_key text, p_default jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v jsonb;
begin
  select coalesce(k.value, k.default_value) into v
    from platform.feature_knob k
   where k.feature = 'hr.clock' and k.key = p_key;
  return coalesce(v, p_default);
end
$$;

-- -----------------------------------------------------------------------------------
-- 2. The refusal envelope — every denial names what was missing (SPEC-ACCESS §4.2)
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_refusal(p_code text, p_message text, p_details jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object(
      'code', p_code,
      'message', p_message,
      'details', coalesce(p_details, '{}'::jsonb)));
$$;

-- -----------------------------------------------------------------------------------
-- 3. The jurisdiction stamp (decision 2)
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_resolve_juris(p_employment_id uuid, p_occurred_at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_pa      hr.position_assignment%rowtype;
  v_loc     hr.location%rowtype;
  v_date    date;
  v_pass    integer;
begin
  -- pass 1 uses the UTC calendar date only to find *a* tz; pass 2 is the one whose date is stamped
  v_date := (p_occurred_at at time zone 'UTC')::date;

  for v_pass in 1 .. 2 loop
    select pa.* into v_pa
      from hr.position_assignment pa
     where pa.employment_id = p_employment_id
       and pa.deleted_at is null
       and pa.effective_from <= v_date
       and (pa.effective_to is null or pa.effective_to >= v_date)
     order by pa.is_primary desc, pa.effective_from desc, pa.recorded_at desc
     limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'no_position_assignment',
                                'as_of', v_date);
    end if;

    select l.* into v_loc from hr.location l where l.id = v_pa.location_id and l.deleted_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'no_work_location',
                                'position_assignment_id', v_pa.id);
    end if;

    v_date := (p_occurred_at at time zone v_loc.tz)::date;   -- pass 2 re-resolves against this
  end loop;

  return jsonb_build_object(
    'ok', true,
    'position_assignment_id', v_pa.id,
    'worker_class',           v_pa.worker_class,
    'is_remote_assignment',   v_loc.is_remote,
    'work_location_id',       v_loc.id,
    'jurisdiction_id',        v_loc.jurisdiction_id,
    'jurisdiction_key',       (select j.key from hr.jurisdiction j where j.id = v_loc.jurisdiction_id),
    'tz',                     v_loc.tz,
    'local_work_date',        v_date);
end
$$;

comment on function hr._punch_resolve_juris(uuid, timestamptz) is
  'L3: {{JURIS}} for a punch, from the position assignment''s location as of local_work_date. '
  'Two-pass (the inputs are circular). Never now(), never an IP lookup.';

-- -----------------------------------------------------------------------------------
-- 4. The open chain and the clock-state projection (decisions 3 and 4)
-- -----------------------------------------------------------------------------------

-- Ordering rank: at an identical instant a break/meal close precedes the clock_out that caused it.
create or replace function hr._punch_kind_rank(p_kind text)
returns integer
language sql
immutable
as $$ select case p_kind when 'clock_out' then 3 when 'clock_in' then 1 else 2 end; $$;

create or replace function hr._punch_open_chain(p_employment_id uuid)
returns table (
  id uuid, punch_kind text, occurred_at timestamptz, break_paid boolean,
  source text, tz text, local_work_date date, position_assignment_id uuid,
  attestation_response jsonb)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  with last_out as (
    select max(p.occurred_at) as at
      from hr.punch p
     where p.employment_id = p_employment_id
       and p.voided_at is null
       and p.punch_kind = 'clock_out')
  select p.id, p.punch_kind, p.occurred_at, p.break_paid, p.source, p.tz,
         p.local_work_date, p.position_assignment_id, p.attestation_response
    from hr.punch p, last_out lo
   where p.employment_id = p_employment_id
     and p.voided_at is null
     and (lo.at is null or p.occurred_at > lo.at)
   order by p.occurred_at, hr._punch_kind_rank(p.punch_kind), p.server_received_at;
$$;

-- Projects the open chain into exactly one of the five machine states (SPEC-TIME §3.1).
create or replace function hr._punch_state_of(p_employment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare r record; v_state text := 'clocked_out';
begin
  for r in select * from hr._punch_open_chain(p_employment_id) loop
    v_state := case r.punch_kind
      when 'clock_in'    then 'clocked_in'
      when 'transfer'    then 'clocked_in'                       -- §3.1: does not change the state
      when 'break_end'   then 'clocked_in'
      when 'meal_end'    then 'clocked_in'
      when 'break_start' then case when coalesce(r.break_paid, true)
                                   then 'on_paid_break' else 'on_unpaid_break' end
      when 'meal_start'  then 'on_meal'
      else v_state end;
  end loop;
  return v_state;
end
$$;

-- The legality table. The button's absence is courtesy; this is the contract (SPEC-TIME §2.1).
create or replace function hr._punch_allowed_kinds(p_state text)
returns text[]
language sql
immutable
as $$
  select case p_state
    when 'clocked_out'     then array['clock_in']
    when 'clocked_in'      then array['clock_out','break_start','meal_start','transfer']
    when 'on_paid_break'   then array['break_end','clock_out']
    when 'on_unpaid_break' then array['break_end','clock_out']
    when 'on_meal'         then array['meal_end','clock_out']
    else array[]::text[] end;
$$;

-- Elapsed worked / break minutes over the open chain, DST-correct (decision 4).
create or replace function hr._punch_elapsed(p_employment_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare
  r record;
  v_prev_at timestamptz; v_prev_kind text; v_prev_paid boolean; v_tz text;
  v_worked numeric := 0; v_break numeric := 0; v_seg numeric;
  v_open_since timestamptz;
begin
  for r in select * from hr._punch_open_chain(p_employment_id) loop
    v_tz := r.tz;
    if v_prev_at is not null then
      v_seg := hr.elapsed_hours((v_prev_at at time zone v_tz), (r.occurred_at at time zone v_tz), v_tz) * 60;
      if v_prev_kind in ('break_start','meal_start') and not coalesce(v_prev_paid, true) then
        v_break := v_break + v_seg;
      elsif v_prev_kind in ('break_start','meal_start') then
        v_break := v_break + v_seg;
        v_worked := v_worked + v_seg;                            -- a PAID break is time worked
      else
        v_worked := v_worked + v_seg;
      end if;
    end if;
    v_prev_at := r.occurred_at; v_prev_kind := r.punch_kind; v_prev_paid := r.break_paid;
  end loop;

  if v_prev_at is not null then
    v_open_since := v_prev_at;
    v_seg := hr.elapsed_hours((v_prev_at at time zone v_tz), (p_now at time zone v_tz), v_tz) * 60;
    if v_prev_kind in ('break_start','meal_start') then
      v_break := v_break + v_seg;
      if coalesce(v_prev_paid, true) then v_worked := v_worked + v_seg; end if;
    else
      v_worked := v_worked + v_seg;
    end if;
  end if;

  return jsonb_build_object(
    'elapsed_worked_minutes', round(coalesce(v_worked, 0), 2),
    'elapsed_break_minutes',  round(coalesce(v_break, 0), 2),
    'current_segment_started_at', v_open_since);
end
$$;

-- -----------------------------------------------------------------------------------
-- 5. The punch-edit authority predicate (decisions 5 and 6)
-- -----------------------------------------------------------------------------------

create or replace function hr._can_edit_punch(p_user uuid, p_employment_id uuid, p_at date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v_mine uuid[]; v_ppe uuid;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller',
      'message', 'This action needs a signed-in HR user. The kiosk and the automation lane cannot edit a punch.');
  end if;

  v_mine := hr.employments_of(p_user, p_at);

  -- (a) NEVER YOURSELF. Checked first so no later arm can turn it back on (hr.can_approve RULE 1).
  if p_employment_id = any(v_mine) then
    return jsonb_build_object('ok', false, 'reason', 'self_edit_forbidden',
      'message', 'You cannot correct your own punch. Ask your manager or HR to make the correction.');
  end if;

  -- (b) HR reach: the capability that actually exists, population-scoped.
  if hr.capability(p_user, 'working_record.write', p_employment_id, p_at) then
    return jsonb_build_object('ok', true, 'basis', 'capability:working_record.write');
  end if;

  -- (c) The manager lane, deferred WHOLLY to the approval predicate (decision 5c).
  select ppe.id into v_ppe
    from hr.pay_period_employment ppe
    join hr.pay_period pp on pp.id = ppe.pay_period_id
   where ppe.employment_id = p_employment_id
     and pp.period_start_on <= p_at and pp.period_end_on >= p_at
   order by pp.sequence_number desc
   limit 1;

  if v_ppe is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pay_period_row',
      'message', 'This day has no timecard row yet, so timecard authority cannot be resolved for it. '
              || 'Open the pay period first, or ask HR to make the correction.',
      'details', jsonb_build_object('work_date', p_at, 'employment_id', p_employment_id));
  end if;

  if hr.can_approve(p_user, 'timecard_approve', 'hr.pay_period_employment', v_ppe, p_at) then
    return jsonb_build_object('ok', true, 'basis', 'approval_authority:timecard_approve');
  end if;

  return jsonb_build_object('ok', false, 'reason', 'no_punch_edit_authority',
    'message', 'You do not hold timecard authority over this employee on ' || p_at::text || '. '
            || 'Editing a punch needs working_record.write, or a timecard_approve authority row covering them.',
    'details', jsonb_build_object('needed', jsonb_build_array('working_record.write', 'timecard_approve'),
                                  'subject_employment_id', p_employment_id, 'as_of', p_at));
end
$$;

comment on function hr._can_edit_punch(uuid, uuid, date) is
  'L3: punch-edit authority over a subject. SPEC-TIME names time.edit_punch, which exists in no '
  'live vocabulary (amendment owed); this composes working_record.write and the timecard_approve '
  'approval predicate and re-derives neither.';

-- -----------------------------------------------------------------------------------
-- 6. Self-proof — the file refuses to be "applied" while its own objects are absent
-- -----------------------------------------------------------------------------------

do $$
declare missing text;
begin
  select string_agg(f, ', ') into missing from unnest(array[
    'hr._punch_knob','hr.punch_knobs_missing','hr._clock_knob','hr._punch_refusal',
    'hr._punch_resolve_juris','hr._punch_kind_rank','hr._punch_open_chain',
    'hr._punch_state_of','hr._punch_allowed_kinds','hr._punch_elapsed','hr._can_edit_punch']) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if missing is not null then
    raise exception 'hr_l3_01: these objects did not land: %', missing;
  end if;
end $$;
