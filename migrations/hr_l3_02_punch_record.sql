-- HR domain L3 — migration 2 of 7 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 `hr.punch_record` — THE ONLY SANCTIONED WRITER OF `hr.punch` — plus the exception writer, the
-- orphan auto-closer and the write-time detector set it runs. Also `hr.clock_state`, the single
-- read every clock surface mounts on.
--
-- Authority: SPEC-TIME §1.1, §2.1, §3.1, §3.2, §3.4, §4.2, §4.7, §4.9, §8, §9, §13, §14 D1/D4/D9;
--            SPEC-DATA-MODEL §7.1, §7.7, §7.11; SPEC-ACCESS §4.2, §6.3;
--            R-L3-READINESS L3-01…L3-06, L3-11, L3-12, U-04, U-05, U-15.
-- Applied live as `hr_l3_02_punch_record`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE REPLAY IS A CAUGHT UNIQUE VIOLATION, AND IT IS THE FIRST THING THE FUNCTION WRITES.
--    SPEC-TIME §3.4: an exact duplicate (same `idempotency_key`) is a SUCCESS. A pre-check-then-
--    insert loses the race that makes the double tap real, so the main INSERT sits alone inside a
--    `begin … exception when unique_violation` block and the replay path re-reads the existing row.
--    It is FIRST for a mechanical reason: plpgsql rolls an exception block back to its own start,
--    so anything written before it — an auto-closed break, an exception row — would be silently
--    undone by the very replay that is supposed to be a no-op. Nothing is written before it.
--
-- 2. 🚨 EXACT-DUPLICATE AND NEAR-DUPLICATE ARE OPPOSITE OUTCOMES AND THE CODE SAYS SO OUT LOUD.
--    Same key ⇒ replayed, nothing inserted, same confirmation. DIFFERENT key, same employment,
--    same kind, inside `near_duplicate_punch_window_seconds` (default 120) ⇒ **written**, flagged,
--    and an `hr.attendance_exception` opened so a human decides which one to void. Refusing the
--    near duplicate would lose a fact, and conflating the two is the classic time-clock bug §3.4
--    exists to name.
--
-- 3. AN EMPLOYEE WHO FORGOT TO CLOCK OUT YESTERDAY IS NEVER BLOCKED FROM CLOCKING IN TODAY.
--    A naive reading of §3.1 refuses `clock_in` from `clocked_in`, which would leave a real shift
--    unpaid because of a missed button — the exact over-tightening §4.2's ruling weighs as the
--    worse failure. So a `clock_in` arriving against a chain older than the resolved orphan
--    threshold runs the §4.2 auto-close first (a NEW punch, `source='auto_close'`,
--    `actor_type='automation'`, the original clock_in never edited), raises `orphan_punch`, and
--    then admits the clock_in. When `auto_close_orphan_punch` is false, no punch is written, the
--    exception is raised alone, and the refusal names the open punch and the door — never a bare
--    "illegal transition". `hr.punch_orphan_sweep()` is the same logic as a callable batch (L3-12).
--    🚨 It is CALLABLE ONLY. No `cron.job` row is created here: D23's schedules are Arman-held.
--
-- 4. 🚨 THE MEAL/REST DETECTORS READ `attestation_response`, AND THEY READ **BOTH DECLARED SHAPES**.
--    SPEC-TIME §3.2 declares nested objects (`{"meal":{"provided":false}}`); SPEC-DATA-MODEL §7.1
--    declares flat strings (`{"meal":"waived","rest":"taken"}`). Both are in the frozen set and
--    they disagree. A detector written for one silently misses every punch written in the other,
--    which is precisely the under-computed-premium failure §14 D9 was ruled to prevent — so
--    `hr._punch_attest_axis` normalises both and the detectors call it. **AMENDMENT OWED: one of
--    the two shapes must win.** `attestation_kind` is never read alone (§14 D9).
--
-- 5. GEO/PHOTO: THE KIOSK REFUSES, THE WEB FLAGS. §1.1's refusal row and §2.1's "a dismissed
--    browser dialog flags, it does not refuse" are both true of different surfaces. A kiosk device
--    carrying `require_geo`/`require_photo` is a configured physical station and a punch without
--    the capture is refused there. On the web, `geo_required_web_punch` produces a written punch
--    plus a `geo_missing`-bearing exception, because blocking a legitimate employee over a browser
--    permission dialog is a defect. Poor accuracy is recorded, never rejected.
--
-- 6. `source_ip` COMES FROM THE POSTGREST REQUEST HEADERS, OR IT STAYS NULL.
--    `inet_client_addr()` is the connection pooler, not the browser, so recording it would write a
--    false fact onto an immutable evidence row. The RPC reads `request.headers` →
--    `x-forwarded-for` (first hop) / `cf-connecting-ip`. When neither is present the column stays
--    NULL and `calc.source_ip_basis` says `unavailable`, which is honest. The address is never used
--    to infer a location (§7.1).
--
-- 7. `ip_verification_mode` IS THE LIVE KNOB NAME; SPEC-TIME §13 CALLS IT `web_punch_ip_verification`.
--    Both are read, live-first, so this lane works today and keeps working after the seed lane
--    lands §13's name. An EMPTY allowlist never blocks anything under any posture (§4.7). On
--    `block` the refusal happens BEFORE the insert and writes an `hr.access_audit` row rather than
--    a phantom punch (§7.1), and it names a human to contact.
--
-- 8. PREMIUM LINES ARE NOT WRITTEN HERE. A `meal_not_provided` / `rest_not_provided` exception is
--    raised by this lane; the `MEAL_PREMIUM` / `REST_PREMIUM` `hr.work_interval` rows are the
--    recompute engine's (E-11, another lane). Writing an amount here would be this lane inventing
--    money, and §0 law 4 forbids it. The exception carries the axis so the engine has everything.
--
-- 9. `hr.clock_state` CANNOT RETURN `offline` OR `error`. Those two of §2.1's eight states are
--    transport facts a server that answered by definition cannot report. It returns the other six —
--    the five machine states plus `blocked` with its reason and its door — and the flag
--    (`attestation_required_at_clock_out`) the client needs to enter `attesting`. Stated so nobody
--    reads the missing two as an oversight.
--
-- 10. THE KIOSK ARM ENFORCES THE **PERSON-BOUND** TTL, WHICH THE LIVE SESSION OPENER DOES NOT.
--    R-L3 U-05: `employment_id IS NULL` is a device session (TTL hours, 12); `employment_id` set is
--    a person-bound interaction session (TTL minutes, 2), and the 12-hour value must never gate a
--    person's session. Verified live, `public.hr_kiosk_session_open` sets `employment_id` and
--    `started_at = now()` on the SAME row and leaves `expires_at` at the device's 12 hours. Rather
--    than rebuild a live door (no-legacy), this lane enforces
--    `started_at + kiosk_session_ttl_minutes` on every person-bound use. **DEBT, owner Core C3
--    (`hr_c3_07_actor_lane`): `hr_kiosk_session_open` should shorten `expires_at` when it binds a
--    person.** Until it does, a stale tablet cannot punch as a walked-away employee.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. Attestation axis normaliser (decision 4)
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_attest_axis(p_response jsonb, p_axis text, p_field text)
returns text
language plpgsql
immutable
as $$
declare v jsonb;
begin
  if p_response is null then return null; end if;
  v := p_response -> p_axis;
  if v is null then return null; end if;
  if jsonb_typeof(v) = 'object' then
    return v ->> p_field;                       -- SPEC-TIME §3.2 nested shape
  end if;
  return v #>> '{}';                            -- SPEC-DATA-MODEL §7.1 flat shape
end
$$;

comment on function hr._punch_attest_axis(jsonb, text, text) is
  'L3: reads one axis of hr.punch.attestation_response under EITHER declared shape (SPEC-TIME 3.2 '
  'nested vs SPEC-DATA-MODEL 7.1 flat). Never read attestation_kind alone (14 D9).';

-- -----------------------------------------------------------------------------------
-- 2. The exception writer — every row carries {{JURIS}} + {{CALC}}
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_raise_exception(
  p_organization_id uuid, p_employment_id uuid, p_punch_id uuid,
  p_kind text, p_severity text, p_juris jsonb, p_calc jsonb default '{}'::jsonb,
  p_actual_start timestamptz default null, p_actual_end timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare v_id uuid;
begin
  perform hr.arm_write();
  insert into hr.attendance_exception (
    organization_id, employment_id, punch_id, exception_kind, severity,
    actual_start_at, actual_end_at,
    work_location_id, jurisdiction_id, tz, local_work_date,
    rule_version_ids, engine_key, engine_version, calc, computed_at)
  values (
    p_organization_id, p_employment_id, p_punch_id, p_kind, p_severity,
    p_actual_start, p_actual_end,
    (p_juris ->> 'work_location_id')::uuid,
    (p_juris ->> 'jurisdiction_id')::uuid,
    p_juris ->> 'tz',
    (p_juris ->> 'local_work_date')::date,
    '{}'::uuid[], 'hr.punch_record', 'l3.1',
    coalesce(p_calc, '{}'::jsonb) || jsonb_build_object('detector_lane', 'write_time'),
    now())
  returning id into v_id;
  return v_id;
end
$$;

-- -----------------------------------------------------------------------------------
-- 3. The orphan auto-closer (decision 3) — shared by punch_record and the callable sweep
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_orphan_threshold_hours(p_organization_id uuid, p_juris jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v numeric;
begin
  -- The org's own rule set wins where it exists; the knob is the platform fallback (SPEC-TIME §13).
  -- 🚨 The live column names differ from SPEC-TIME §4.2's table (priority/max_shift_hours/
  -- close_at_strategy/exception_severity/blocks_period_lock vs sequence/trigger_after_hours/
  -- close_point/severity/blocks_approval). Live wins; amendment owed on §4.2.
  select r.max_shift_hours into v
    from hr.auto_close_rule r
   where r.organization_id = p_organization_id
     and r.is_active and r.deleted_at is null
     and r.trigger_kind = 'max_shift_hours'
     and (r.scope_kind = 'organization'
          or (r.scope_kind = 'location' and r.scope_id = (p_juris ->> 'work_location_id')::uuid))
   order by r.priority, r.created_at
   limit 1;
  if v is not null then return v; end if;
  return (hr._punch_knob('max_shift_hours', '16'::jsonb) #>> '{}')::numeric;
end
$$;

create or replace function hr._punch_auto_close_orphan(p_employment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_first record; v_org uuid; v_juris jsonb; v_hours numeric;
  v_close_at timestamptz; v_shift_end timestamptz; v_pid uuid; v_exc uuid;
  v_enabled boolean; v_strategy text := 'max_hours_reached';
begin
  select * into v_first from hr._punch_open_chain(p_employment_id) limit 1;
  if not found then
    return jsonb_build_object('orphan', false);
  end if;

  select em.organization_id into v_org from hr.employment em where em.id = p_employment_id;
  v_juris := hr._punch_resolve_juris(p_employment_id, v_first.occurred_at);
  if not (v_juris ->> 'ok')::boolean then
    return jsonb_build_object('orphan', false, 'reason', v_juris ->> 'reason');
  end if;

  v_hours := hr._punch_orphan_threshold_hours(v_org, v_juris);
  if now() < v_first.occurred_at + make_interval(hours => floor(v_hours)::int,
                                                 mins  => round((v_hours - floor(v_hours)) * 60)::int) then
    return jsonb_build_object('orphan', false);
  end if;

  -- close point: the scheduled shift end where a shift exists, otherwise clock_in + threshold
  select s.ends_at into v_shift_end
    from hr.shift s
   where s.employment_id = p_employment_id
     and s.deleted_at is null
     and s.local_work_date = v_first.local_work_date
   order by s.starts_at limit 1;

  if v_shift_end is not null then
    v_close_at := v_shift_end; v_strategy := 'scheduled_end';
  else
    v_close_at := v_first.occurred_at + make_interval(hours => floor(v_hours)::int,
                                                      mins  => round((v_hours - floor(v_hours)) * 60)::int);
  end if;

  v_enabled := (hr._punch_knob('auto_close_orphan_punch', 'true'::jsonb) #>> '{}')::boolean;

  if v_enabled then
    perform hr.arm_write();
    insert into hr.punch (
      organization_id, employment_id, position_assignment_id, punch_kind, occurred_at,
      device_reported_at, clock_skew_applied_seconds, source, idempotency_key,
      work_location_id, jurisdiction_id, tz, local_work_date,
      actor_type, actor_note, metadata)
    values (
      v_org, p_employment_id, (v_juris ->> 'position_assignment_id')::uuid, 'clock_out', v_close_at,
      null, 0, 'auto_close', 'autoclose:' || v_first.id::text,
      (v_juris ->> 'work_location_id')::uuid, (v_juris ->> 'jurisdiction_id')::uuid,
      v_juris ->> 'tz', (v_juris ->> 'local_work_date')::date,
      'automation',
      'Auto-closed by the orphan rule: no clock_out within ' || v_hours::text || ' hours.',
      jsonb_build_object('auto_close_estimate', true, 'close_at_strategy', v_strategy,
                         'orphan_of_punch_id', v_first.id))
    on conflict (organization_id, idempotency_key) do nothing
    returning id into v_pid;
  end if;

  v_exc := hr._punch_raise_exception(
    v_org, p_employment_id, coalesce(v_pid, v_first.id), 'orphan_punch', 'warn', v_juris,
    jsonb_build_object('auto_close_estimate', true,          -- an estimate never becomes a measurement
                       'auto_close_written', v_enabled,
                       'close_at_strategy', v_strategy,
                       'threshold_hours', v_hours,
                       'orphan_of_punch_id', v_first.id),
    v_first.occurred_at, null);

  return jsonb_build_object('orphan', true, 'auto_close_punch_id', v_pid,
                            'exception_id', v_exc, 'close_at', v_close_at,
                            'auto_close_written', v_enabled, 'threshold_hours', v_hours);
end
$$;

-- L3-12's callable sweep. CALLABLE ONLY — no schedule row is created (D23 schedules are Arman's).
create or replace function hr.punch_orphan_sweep(p_organization_id uuid, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare r record; v_out jsonb := '[]'::jsonb; v_res jsonb; v_n int := 0;
begin
  for r in
    select distinct p.employment_id
      from hr.punch p
     where p.organization_id = p_organization_id
       and p.voided_at is null
       and p.punch_kind = 'clock_in'
       and p.occurred_at > now() - interval '30 days'
  loop
    if hr._punch_state_of(r.employment_id) = 'clocked_out' then continue; end if;
    if p_dry_run then
      v_res := jsonb_build_object('employment_id', r.employment_id, 'would_close', true);
    else
      v_res := hr._punch_auto_close_orphan(r.employment_id) || jsonb_build_object('employment_id', r.employment_id);
      if not coalesce((v_res ->> 'orphan')::boolean, false) then continue; end if;
    end if;
    v_out := v_out || v_res; v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'count', v_n, 'results', v_out);
end
$$;

comment on function hr.punch_orphan_sweep(uuid, boolean) is
  'L3-12 orphan sweep, CALLABLE ONLY. No cron.job row is created by this lane - D23 schedules are Arman-held.';

-- -----------------------------------------------------------------------------------
-- 4. THE ONLY SANCTIONED WRITER
-- -----------------------------------------------------------------------------------

create or replace function hr.punch_record(
  p_employment_id   uuid,
  p_kind            text,
  p_occurred_at     timestamptz,
  p_source          text,
  p_idempotency_key text,
  p_kiosk_session_id uuid    default null,
  p_geo             jsonb    default null,
  p_photo_file_id   uuid     default null,
  p_attestation     jsonb    default null)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid          uuid := auth.uid();
  v_em           hr.employment%rowtype;
  v_juris        jsonb;
  v_state        text;
  v_allowed      text[];
  v_org          uuid;
  v_date         date;
  v_tz           text;
  v_occurred     timestamptz := p_occurred_at;
  v_device_rep   timestamptz;
  v_skew         integer := 0;
  v_sess         hr.kiosk_session%rowtype;
  v_dev          hr.kiosk_device%rowtype;
  v_actor_type   text;
  v_actor_emp    uuid;
  v_actor_user   uuid;
  v_actor_dev    uuid;
  v_classes      jsonb;
  v_punch_id     uuid;
  v_replayed     boolean := false;
  v_exceptions   jsonb := '[]'::jsonb;
  v_calc         jsonb := '{}'::jsonb;
  v_ip           inet;
  v_ip_basis     text := 'unavailable';
  v_ip_mode      text;
  v_allowlist    jsonb;
  v_headers      jsonb;
  v_break_paid   boolean;
  v_geo_lat      numeric; v_geo_lng numeric; v_geo_acc integer;
  v_orphan       jsonb;
  v_dup          record;
  v_window       integer;
  v_exc          uuid;
  v_ac_id        uuid;
  v_ttl_min      integer;
  v_prev_id      uuid;
  v_prev_at      timestamptz;
  v_meal_min     numeric;
  v_meal_axis    text;
  v_meal_intr    text;
  v_rest_axis    text;
begin
  ---------------------------------------------------------------- 0. argument shape
  if p_employment_id is null or p_kind is null or p_occurred_at is null
     or p_source is null or coalesce(btrim(p_idempotency_key), '') = '' then
    return hr._punch_refusal('hr_punch_arguments_incomplete',
      'A punch needs an employment, a kind, an instant, a source and an idempotency key.',
      jsonb_build_object('missing',
        (select jsonb_agg(k) from (values ('p_employment_id', p_employment_id is null),
                                          ('p_kind', p_kind is null),
                                          ('p_occurred_at', p_occurred_at is null),
                                          ('p_source', p_source is null),
                                          ('p_idempotency_key', coalesce(btrim(p_idempotency_key),'') = ''))
                 x(k, miss) where miss)));
  end if;

  if p_kind not in ('clock_in','clock_out','break_start','break_end','meal_start','meal_end','transfer') then
    return hr._punch_refusal('hr_punch_kind_unknown',
      p_kind || ' is not a punch kind this system records.',
      jsonb_build_object('allowed', jsonb_build_array('clock_in','clock_out','break_start','break_end','meal_start','meal_end','transfer')));
  end if;

  if p_source not in ('web','kiosk','mobile','manager_entry','auto_close') then
    if p_source = 'import' then
      return hr._punch_refusal('hr_punch_import_lane_not_built',
        'Imported punches are not accepted through this door yet. The import lane is not built, and '
        || 'admitting one here without its actor and provenance would create a punch nobody can trace.',
        jsonb_build_object('source', p_source));
    end if;
    return hr._punch_refusal('hr_punch_source_unknown', p_source || ' is not a punch source.',
      jsonb_build_object('allowed', jsonb_build_array('web','kiosk','mobile','manager_entry','auto_close')));
  end if;

  ---------------------------------------------------------------- 1. the subject
  select * into v_em from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then
    return hr._punch_refusal('hr_employment_not_found',
      'That employment record does not exist, so there is nobody to record a punch for.');
  end if;
  v_org := v_em.organization_id;

  -- 🚨 REPLAY DOOR 1 (hr_l3_02c): resolved BEFORE every gate, because the second tap of a double
  -- tap arrives against the clock state the FIRST tap created, and the state gate would refuse it.
  -- The caught unique_violation at step 10 remains the authority for the concurrent race; this
  -- door exists so a replay is never evaluated against a state the original punch itself made.
  select p.id into v_punch_id from hr.punch p
   where p.organization_id = v_org and p.idempotency_key = p_idempotency_key;
  if v_punch_id is not null then
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'punch', (select to_jsonb(pp) from hr.punch pp where pp.id = v_punch_id),
      'clock_state', hr.clock_state(p_employment_id),
      'exceptions', '[]'::jsonb);
  end if;

  ---------------------------------------------------------------- 2. {{JURIS}} (never now(), never an IP)
  v_juris := hr._punch_resolve_juris(p_employment_id, p_occurred_at);
  if not (v_juris ->> 'ok')::boolean then
    return hr._punch_refusal('hr_punch_no_jurisdiction',
      case v_juris ->> 'reason'
        when 'no_position_assignment' then
          'This employee has no position assignment covering that work date, so the governing '
          || 'jurisdiction and timezone cannot be determined. HR must set the assignment first.'
        else
          'The position assignment for that work date names a work location that does not exist.'
      end, v_juris);
  end if;
  v_tz   := v_juris ->> 'tz';
  v_date := (v_juris ->> 'local_work_date')::date;

  ---------------------------------------------------------------- 3. employment active on the WORK DATE
  if v_em.status = 'terminated'
     or v_em.hire_date > v_date
     or (v_em.termination_date is not null and v_em.termination_date < v_date) then
    return hr._punch_refusal('hr_employment_not_active',
      'This employment was not active on ' || v_date::text || ', so a punch cannot be recorded against it.',
      jsonb_build_object('status', v_em.status, 'hire_date', v_em.hire_date,
                         'termination_date', v_em.termination_date, 'local_work_date', v_date));
  end if;

  ---------------------------------------------------------------- 4. worker-class gate (§8)
  v_classes := hr._punch_knob('punch_enabled_worker_classes', '["employee","intern","seasonal"]'::jsonb);
  if (v_juris ->> 'worker_class') = 'contractor' then
    return hr._punch_refusal('hr_worker_class_never_punches',
      'A contractor does not clock a company time clock. Their time is invoiced through their '
      || 'engagement, not punched.', jsonb_build_object('worker_class', 'contractor'));
  end if;
  if not (v_classes @> to_jsonb(v_juris ->> 'worker_class')) then
    return hr._punch_refusal('hr_worker_class_not_enabled',
      'Time tracking is not enabled for the worker class "' || (v_juris ->> 'worker_class')
      || '" in this organization.',
      jsonb_build_object('worker_class', v_juris ->> 'worker_class', 'enabled', v_classes,
                         'door', 'hr.time_and_attendance.punch_enabled_worker_classes'));
  end if;

  ---------------------------------------------------------------- 5. the actor block + the door
  if p_kiosk_session_id is not null or p_source = 'kiosk' then
    if p_kiosk_session_id is null then
      return hr._punch_refusal('hr_kiosk_session_required',
        'A kiosk punch must present its session. A device secret never travels on a punch request.');
    end if;
    select * into v_sess from hr.kiosk_session where id = p_kiosk_session_id and deleted_at is null;
    if not found or v_sess.ended_at is not null or v_sess.expires_at <= now() then
      return hr._punch_refusal('hr_kiosk_session_invalid',
        'This kiosk session is no longer valid. Enter your employee number and PIN again.');
    end if;
    if v_sess.employment_id is null then
      return hr._punch_refusal('hr_kiosk_not_authenticated',
        'No one is signed in on this tablet. Enter your employee number and PIN first.');
    end if;
    -- decision 10: the PERSON-BOUND ttl, in minutes, never the device's 12 hours
    v_ttl_min := (hr._punch_knob('kiosk_session_ttl_minutes', '2'::jsonb) #>> '{}')::integer;
    if v_sess.started_at + make_interval(mins => v_ttl_min) <= now() then
      return hr._punch_refusal('hr_kiosk_session_expired',
        'Your kiosk session timed out. Enter your employee number and PIN again.');
    end if;
    if v_sess.employment_id <> p_employment_id then
      return hr._punch_refusal('hr_kiosk_session_subject_mismatch',
        'This kiosk session belongs to a different person.');
    end if;

    select * into v_dev from hr.kiosk_device where id = v_sess.kiosk_device_id and deleted_at is null;
    if not found or v_dev.trust_state <> 'trusted' then
      return hr._punch_refusal('hr_kiosk_device_not_trusted',
        'This tablet is not approved for punching. Ask an administrator to trust it.',
        jsonb_build_object('trust_state', coalesce(v_dev.trust_state, 'unknown')));
    end if;

    -- skew: the raw claim is kept, the correction is recorded, occurred_at is the corrected truth
    v_device_rep := p_occurred_at;
    v_skew := round(extract(epoch from (now() - p_occurred_at)))::integer;
    if abs(v_skew) > greatest(v_dev.max_clock_skew_seconds,
                              (hr._punch_knob('kiosk_max_clock_skew_seconds', '300'::jsonb) #>> '{}')::integer) then
      perform hr.arm_write();
      update hr.kiosk_device
         set clock_skew_seconds = v_skew,
             metadata = metadata || jsonb_build_object('skew_flagged_at', now(), 'skew_observed_seconds', v_skew)
       where id = v_dev.id;
      return hr._punch_refusal('hr_kiosk_clock_skew_exceeded',
        'This tablet''s clock is wrong, so the punch was not recorded. It has been flagged to HR. '
        || 'Tell your manager.',
        jsonb_build_object('observed_skew_seconds', v_skew,
                           'max_skew_seconds', v_dev.max_clock_skew_seconds));
    end if;
    if (hr._punch_knob('kiosk_time_authority', '"server"'::jsonb) #>> '{}') = 'server' then
      v_occurred := p_occurred_at + make_interval(secs => v_skew);
    else
      v_occurred := p_occurred_at;
    end if;
    v_actor_type := 'kiosk_device'; v_actor_dev := v_dev.id;

  elsif p_source = 'auto_close' then
    v_actor_type := 'automation';

  elsif p_source = 'manager_entry' then
    if v_uid is null then
      return hr._punch_refusal('hr_no_authenticated_caller',
        'A manager entry needs a signed-in operator.');
    end if;
    if p_employment_id = any(hr.employments_of(v_uid, v_date)) then
      return hr._punch_refusal('hr_manager_entry_is_self',
        'Punch for yourself through your own clock, not through the manager entry lane.');
    end if;
    if not hr.capability(v_uid, 'working_record.read', p_employment_id, v_date) then
      return hr._punch_refusal('hr_no_punch_authority',
        'You do not have reach over this employee''s working record on ' || v_date::text || '.',
        jsonb_build_object('needed', 'working_record.read', 'subject_employment_id', p_employment_id));
    end if;
    v_actor_type := 'manager'; v_actor_user := v_uid;
    select em2.id into v_actor_emp from hr.employment em2
     where em2.id = any(hr.employments_of(v_uid, v_date)) and em2.organization_id = v_org limit 1;

  else -- web / mobile
    if v_uid is null then
      return hr._punch_refusal('hr_no_authenticated_caller',
        'A web punch needs a signed-in employee.');
    end if;
    if not (p_employment_id = any(hr.employments_of(v_uid, v_date))) then
      return hr._punch_refusal('hr_not_your_employment',
        'You can only punch for yourself here. A punch for someone else goes through the manager entry lane.');
    end if;
    if not (hr._clock_knob('web_punch_enabled', 'true'::jsonb) #>> '{}')::boolean then
      return hr._punch_refusal('hr_web_punch_disabled',
        'The web clock is switched off for this organization. Use your kiosk, or ask HR.',
        jsonb_build_object('door', 'hr.clock.web_punch_enabled'));
    end if;
    v_actor_type := 'employee'; v_actor_user := v_uid; v_actor_emp := p_employment_id;
  end if;

  ---------------------------------------------------------------- 6. source_ip + IP verification (§4.7)
  if p_source in ('web','mobile') then
    begin
      v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then v_headers := null;
    end;
    if v_headers is not null then
      if coalesce(v_headers ->> 'cf-connecting-ip', '') <> '' then
        begin v_ip := (v_headers ->> 'cf-connecting-ip')::inet; v_ip_basis := 'cf-connecting-ip';
        exception when others then v_ip := null; end;
      elsif coalesce(v_headers ->> 'x-forwarded-for', '') <> '' then
        begin v_ip := btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1))::inet;
              v_ip_basis := 'x-forwarded-for';
        exception when others then v_ip := null; end;
      end if;
    end if;

    -- live knob name first, then SPEC-TIME §13's name (decision 7)
    v_ip_mode := coalesce(
      hr._punch_knob('ip_verification_mode', 'null'::jsonb) #>> '{}',
      hr._punch_knob('web_punch_ip_verification', '"off"'::jsonb) #>> '{}',
      'off');
    v_allowlist := hr._punch_knob('web_punch_ip_allowlist', '[]'::jsonb);

    -- 🚨 an EMPTY allowlist never blocks anything: unconfigured is not "deny all"
    -- `<<=` is "contained within OR equals", which covers a CIDR block and a bare host address in
    -- one operator. `<<` alone is STRICT containment and would never match a single-host entry.
    -- (Corrected by hr_l3_02b after execution caught `host(text) does not exist`; see that file.)
    if v_ip_mode in ('warn','block') and jsonb_array_length(v_allowlist) > 0 and v_ip is not null
       and not exists (select 1 from jsonb_array_elements_text(v_allowlist) c
                        where v_ip <<= c::inet) then
      if v_ip_mode = 'block' then
        -- refuse BEFORE inserting, and record the attempt as access, not as a phantom punch (§7.1)
        perform hr.arm_write();
        insert into hr.access_audit (organization_id, action, target_token, target_ids,
          subject_employment_id, sensitivity_tier, purpose, basis, granted, denial_reason,
          actor_type, actor_user_id, request_context)
        values (v_org, 'denied', 'hr_punch', '{}'::uuid[], p_employment_id, 'internal',
          'time_and_attendance', 'ip_verification', false, 'ip_outside_allowlist',
          coalesce(v_actor_type,'employee'), v_uid,
          jsonb_build_object('source_ip', host(v_ip), 'basis', v_ip_basis, 'mode', 'block'));
        return hr._punch_refusal('hr_punch_ip_blocked',
          'Your punch was not recorded because this network is not on your organization''s approved '
          || 'list. Contact your manager or HR right away so your time is not lost.',
          jsonb_build_object('source_ip', host(v_ip)));
      end if;
      v_calc := v_calc || jsonb_build_object('ip_mismatch', true);
    end if;
    v_calc := v_calc || jsonb_build_object('source_ip_basis', v_ip_basis, 'ip_verification_mode', v_ip_mode);
  end if;

  ---------------------------------------------------------------- 7. clock-state legality (§3.1)
  v_state := hr._punch_state_of(p_employment_id);

  if p_kind = 'clock_in' and v_state <> 'clocked_out' then
    v_orphan := hr._punch_auto_close_orphan(p_employment_id);          -- decision 3
    if coalesce((v_orphan ->> 'orphan')::boolean, false) then
      if coalesce((v_orphan ->> 'auto_close_written')::boolean, false) then
        v_exceptions := v_exceptions || jsonb_build_array(v_orphan);
        v_state := hr._punch_state_of(p_employment_id);
      else
        v_exceptions := v_exceptions || jsonb_build_array(v_orphan);
        return hr._punch_refusal('hr_open_punch_must_be_closed',
          'You are still clocked in from an earlier shift and this organization does not auto-close '
          || 'open punches. A manager has to close it before you can clock in again.',
          jsonb_build_object('open_since', v_orphan ->> 'close_at',
                             'exception_id', v_orphan ->> 'exception_id',
                             'door', 'hr.punch_correct'));
      end if;
    end if;
  end if;

  v_allowed := hr._punch_allowed_kinds(v_state);
  if not (p_kind = any(v_allowed)) then
    return hr._punch_refusal('hr_punch_kind_illegal_for_state',
      'You are ' || replace(v_state, '_', ' ') || ', so "' || replace(p_kind, '_', ' ')
      || '" is not something you can do right now.',
      jsonb_build_object('state', v_state, 'attempted', p_kind, 'allowed', to_jsonb(v_allowed)));
  end if;

  ---------------------------------------------------------------- 8. geo / photo posture (decision 5)
  if p_geo is not null then
    v_geo_lat := (p_geo ->> 'lat')::numeric;
    v_geo_lng := (p_geo ->> 'lng')::numeric;
    v_geo_acc := (p_geo ->> 'accuracy_m')::integer;
    if v_geo_acc is not null
       and v_geo_acc > (hr._punch_knob('max_geo_accuracy_m', '200'::jsonb) #>> '{}')::integer then
      v_calc := v_calc || jsonb_build_object('geo_unreliable', true, 'geo_accuracy_m', v_geo_acc);
    end if;
  end if;

  if v_actor_type = 'kiosk_device' then
    if v_dev.require_geo and v_geo_lat is null then
      return hr._punch_refusal('hr_kiosk_geo_required',
        'This tablet is set to record your location with each punch, and no location was captured. '
        || 'Your punch was not recorded. Tell your manager.');
    end if;
    if v_dev.require_photo and p_photo_file_id is null then
      return hr._punch_refusal('hr_kiosk_photo_required',
        'This tablet is set to take a photo with each punch, and no photo was captured. '
        || 'Your punch was not recorded. Tell your manager.');
    end if;
  end if;

  ---------------------------------------------------------------- 9. break_paid + attestation
  -- 🚨 The open break is captured BEFORE the clock_out lands. `hr._punch_open_chain` opens after
  -- the most recent clock_out, so once the clock_out is written the chain is EMPTY by definition —
  -- reading the break afterwards would silently find nothing and never raise worked_through_break.
  if p_kind = 'clock_out' and v_state in ('on_paid_break','on_unpaid_break','on_meal') then
    select c.id, c.occurred_at into v_prev_id, v_prev_at
      from hr._punch_open_chain(p_employment_id) c
     where c.punch_kind in ('break_start','meal_start') order by c.occurred_at desc limit 1;
  end if;

  if p_kind in ('break_start','break_end') then
    v_break_paid := coalesce((p_attestation ->> 'break_paid')::boolean, true);   -- rest breaks are paid
  elsif p_kind in ('meal_start','meal_end') then
    v_break_paid := coalesce((p_attestation ->> 'break_paid')::boolean, false);  -- meals are unpaid
  end if;

  ---------------------------------------------------------------- 10. THE INSERT — replay is caught, not pre-checked
  begin
    perform hr.arm_write();
    insert into hr.punch (
      organization_id, employment_id, position_assignment_id, punch_kind, break_paid,
      occurred_at, device_reported_at, clock_skew_applied_seconds, source, idempotency_key,
      geo_lat, geo_lng, geo_accuracy_m, source_ip, photo_file_id,
      attestation_kind, attestation_response,
      work_location_id, jurisdiction_id, tz, local_work_date,
      actor_type, actor_employment_id, actor_user_id, actor_device_id,
      metadata)
    values (
      v_org, p_employment_id, (v_juris ->> 'position_assignment_id')::uuid, p_kind, v_break_paid,
      v_occurred, v_device_rep, coalesce(v_skew, 0), p_source, p_idempotency_key,
      v_geo_lat, v_geo_lng, v_geo_acc, v_ip, p_photo_file_id,
      case when p_attestation is not null and p_attestation <> '{}'::jsonb
           then 'hours_confirmed' end,            -- §14 D9: one kind, the answers live in the jsonb
      coalesce(p_attestation, '{}'::jsonb),
      (v_juris ->> 'work_location_id')::uuid, (v_juris ->> 'jurisdiction_id')::uuid,
      v_tz, v_date,
      v_actor_type, v_actor_emp, v_actor_user, v_actor_dev,
      jsonb_build_object('calc', v_calc))
    returning id into v_punch_id;
  exception when unique_violation then
    -- 🚨 A REPLAY IS A SUCCESS PATH (decision 1)
    select p.id into v_punch_id from hr.punch p
     where p.organization_id = v_org and p.idempotency_key = p_idempotency_key;
    v_replayed := true;
  end;

  if v_replayed then
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'punch', (select to_jsonb(p) from hr.punch p where p.id = v_punch_id),
      'clock_state', hr.clock_state(p_employment_id),
      'exceptions', '[]'::jsonb);
  end if;

  ---------------------------------------------------------------- 11. kiosk session bookkeeping (§7.1)
  if v_actor_type = 'kiosk_device' then
    perform hr.arm_write();
    update hr.kiosk_session set punch_count = punch_count + 1 where id = v_sess.id;
    update hr.kiosk_device set last_seen_at = now(), clock_skew_seconds = coalesce(v_skew, 0)
     where id = v_dev.id;

    -- cross-location: allow_with_flag — a multi-site worker is NEVER blocked (§3.3)
    -- The punch is already a fact; a multi-site worker is NEVER blocked, and blocking after the
    -- write would be a lie. The posture is recorded on the exception instead.
    if v_dev.location_id is distinct from (v_juris ->> 'work_location_id')::uuid then
      v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
        'unscheduled_work', 'info', v_juris,
        jsonb_build_object('detector', 'location_mismatch',
                           'device_location_id', v_dev.location_id,
                           'assignment_location_id', v_juris ->> 'work_location_id',
                           'posture', hr._punch_knob('kiosk_cross_location_punch', '"allow_with_flag"'::jsonb)));
      v_exceptions := v_exceptions || jsonb_build_array(
        jsonb_build_object('id', v_exc, 'kind', 'unscheduled_work', 'detector', 'location_mismatch'));
    end if;
  end if;

  ---------------------------------------------------------------- 12. auto-close an open break at clock-out
  if p_kind = 'clock_out' and v_state in ('on_paid_break','on_unpaid_break','on_meal') then
    perform hr.arm_write();
    insert into hr.punch (
      organization_id, employment_id, position_assignment_id, punch_kind, break_paid,
      occurred_at, source, idempotency_key, clock_skew_applied_seconds,
      work_location_id, jurisdiction_id, tz, local_work_date,
      actor_type, actor_note, metadata)
    values (
      v_org, p_employment_id, (v_juris ->> 'position_assignment_id')::uuid,
      case when v_state = 'on_meal' then 'meal_end' else 'break_end' end,
      case when v_state = 'on_meal' then false else v_state = 'on_paid_break' end,
      v_occurred, 'auto_close', 'autobreak:' || v_punch_id::text, 0,
      (v_juris ->> 'work_location_id')::uuid, (v_juris ->> 'jurisdiction_id')::uuid, v_tz, v_date,
      'automation', 'Break closed automatically at clock-out.',
      jsonb_build_object('auto_close_estimate', true, 'closed_by_punch_id', v_punch_id))
    on conflict (organization_id, idempotency_key) do nothing
    returning id into v_ac_id;

    -- worked_through_break where the break never reached its jurisdictional minimum
    -- (v_prev was captured at step 9, before the clock_out closed the chain)
    if v_prev_id is not null then
      v_meal_min := null;
      begin
        select ((hr.resolve_rules('employment', p_employment_id, v_date,
                  case when v_state = 'on_meal' then array['meal-break'] else array['rest-break'] end,
                  '{}'::jsonb, v_org, v_juris ->> 'jurisdiction_key')
                 #> array['resolved', case when v_state = 'on_meal' then 'meal-break' else 'rest-break' end,
                          'rules', '0', 'parameters'] ->> 'minimum_minutes'))::numeric
          into v_meal_min;
      exception when others then v_meal_min := null;
      end;
      if v_meal_min is not null
         and hr.elapsed_hours((v_prev_at at time zone v_tz), (v_occurred at time zone v_tz), v_tz) * 60
             < v_meal_min then
        v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
          'worked_through_break', 'violation', v_juris,
          jsonb_build_object('detector', 'worked_through_break',
                             'minimum_minutes', v_meal_min,
                             'auto_closed_break_punch_id', v_ac_id,
                             'break_started_at', v_prev_at),
          v_prev_at, v_occurred);
        v_exceptions := v_exceptions || jsonb_build_array(
          jsonb_build_object('id', v_exc, 'kind', 'worked_through_break'));
      end if;
    end if;
  end if;

  ---------------------------------------------------------------- 13. write-time detectors (U-15)
  -- (a) NEAR DUPLICATE — written, flagged, never refused (decision 2)
  v_window := (hr._punch_knob('near_duplicate_punch_window_seconds', '120'::jsonb) #>> '{}')::integer;
  select p.id, p.occurred_at, p.idempotency_key into v_dup
    from hr.punch p
   where p.employment_id = p_employment_id
     and p.id <> v_punch_id
     and p.voided_at is null
     and p.punch_kind = p_kind
     and p.idempotency_key <> p_idempotency_key
     and abs(extract(epoch from (p.occurred_at - v_occurred))) <= v_window
   order by abs(extract(epoch from (p.occurred_at - v_occurred)))
   limit 1;
  if found then
    v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
      'missed_punch', 'warn', v_juris,
      jsonb_build_object('detector', 'near_duplicate',
                         'duplicate_suspected_of_punch_id', v_dup.id,
                         'window_seconds', v_window,
                         'seconds_apart', abs(extract(epoch from (v_dup.occurred_at - v_occurred)))));
    v_exceptions := v_exceptions || jsonb_build_array(
      jsonb_build_object('id', v_exc, 'kind', 'missed_punch', 'detector', 'near_duplicate',
                         'duplicate_suspected_of_punch_id', v_dup.id));
  end if;

  -- (b) GEO MISSING under a web posture that asked for it — flagged, never refused (decision 5)
  if p_source in ('web','mobile')
     and (hr._punch_knob('geo_required_web_punch', 'false'::jsonb) #>> '{}')::boolean
     and v_geo_lat is null then
    v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
      'unscheduled_work', 'info', v_juris,
      jsonb_build_object('detector', 'geo_missing', 'geo_required_web_punch', true));
    v_exceptions := v_exceptions || jsonb_build_array(
      jsonb_build_object('id', v_exc, 'kind', 'unscheduled_work', 'detector', 'geo_missing'));
  end if;

  -- (c) IP MISMATCH under `warn`
  if coalesce((v_calc ->> 'ip_mismatch')::boolean, false) then
    v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
      'ip_verification_failed', 'warn', v_juris,
      jsonb_build_object('detector', 'ip_verification', 'source_ip', host(v_ip), 'mode', 'warn'));
    v_exceptions := v_exceptions || jsonb_build_array(
      jsonb_build_object('id', v_exc, 'kind', 'ip_verification_failed'));
  end if;

  -- (d) MEAL / REST from the ATTESTATION JSONB, both shapes, never attestation_kind alone (decision 4)
  if p_kind = 'clock_out' and p_attestation is not null and p_attestation <> '{}'::jsonb then
    -- nested shape: ('meal','provided') → 'true'/'false', ('meal','interrupted') → 'true'/'false'
    -- flat shape:   both calls return the same word ('taken'|'waived'|'not_provided'|'interrupted')
    -- A WAIVER IS NOT A VIOLATION and must not raise; only not-provided and interrupted do.
    v_meal_axis := hr._punch_attest_axis(p_attestation, 'meal', 'provided');
    v_meal_intr := hr._punch_attest_axis(p_attestation, 'meal', 'interrupted');
    v_rest_axis := hr._punch_attest_axis(p_attestation, 'rest', 'missed');

    if v_meal_axis in ('false','not_provided','interrupted') or v_meal_intr = 'true' then
      v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
        'meal_not_provided', 'violation', v_juris,
        jsonb_build_object('detector', 'attestation_meal',
                           'axis', p_attestation -> 'meal',
                           'premium_owed_determination', 'engine',   -- decision 8: no money here
                           'prompt_version', p_attestation ->> 'prompt_version'));
      v_exceptions := v_exceptions || jsonb_build_array(
        jsonb_build_object('id', v_exc, 'kind', 'meal_not_provided'));
    end if;

    if v_rest_axis in ('true','missed') then
      v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
        'rest_not_provided', 'violation', v_juris,
        jsonb_build_object('detector', 'attestation_rest',
                           'axis', p_attestation -> 'rest',
                           'premium_owed_determination', 'engine',
                           'prompt_version', p_attestation ->> 'prompt_version'));
      v_exceptions := v_exceptions || jsonb_build_array(
        jsonb_build_object('id', v_exc, 'kind', 'rest_not_provided'));
    end if;

    if hr._punch_attest_axis(p_attestation, 'hours', 'confirmed') = 'false' then
      v_exc := hr._punch_raise_exception(v_org, p_employment_id, v_punch_id,
        'missed_punch', 'warn', v_juris,
        jsonb_build_object('detector', 'attestation_hours_disputed',
                           'disagreement_note', hr._punch_attest_axis(p_attestation, 'hours', 'disagreement_note')));
      v_exceptions := v_exceptions || jsonb_build_array(
        jsonb_build_object('id', v_exc, 'kind', 'missed_punch', 'detector', 'attestation_hours_disputed'));
    end if;
  end if;

  ---------------------------------------------------------------- 14. the answer
  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'punch', (select to_jsonb(p) from hr.punch p where p.id = v_punch_id),
    'auto_closed_break_punch_id', v_ac_id,
    'clock_state', hr.clock_state(p_employment_id),
    'exceptions', v_exceptions);
end
$$;

comment on function hr.punch_record(uuid, text, timestamptz, text, text, uuid, jsonb, uuid, jsonb) is
  'THE ONLY SANCTIONED WRITER OF hr.punch (SPEC-DATA-MODEL 7.1). Session id, never a device secret '
  '(SPEC-TIME 14 D1 / R-L3 U-04). A replay is a success path.';

-- -----------------------------------------------------------------------------------
-- 5. `hr.clock_state` — the single read every clock surface mounts on
-- -----------------------------------------------------------------------------------

create or replace function hr.clock_state(p_employment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_em     hr.employment%rowtype;
  v_juris  jsonb;
  v_state  text;
  v_elapsed jsonb;
  v_chain  jsonb;
  v_excs   jsonb;
  v_rules  jsonb;
  v_sess   uuid;
  v_is_self boolean := false;
  v_classes jsonb;
  v_attest  boolean;
begin
  select * into v_em from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then
    return hr._punch_refusal('hr_employment_not_found',
      'That employment record does not exist.');
  end if;

  ------------------------------------------------ authorization: self, manager reach, or a kiosk session
  if v_uid is not null then
    v_is_self := p_employment_id = any(hr.employments_of(v_uid, current_date));
  end if;

  if not v_is_self then
    begin
      v_sess := nullif(current_setting('hr.kiosk_session_id', true), '')::uuid;
    exception when others then v_sess := null;
    end;
    if v_sess is not null then
      if not exists (select 1 from hr.kiosk_session s
                      where s.id = v_sess and s.employment_id = p_employment_id
                        and s.ended_at is null and s.expires_at > now()) then
        v_sess := null;
      end if;
    end if;
    if v_sess is null
       and not (v_uid is not null and hr.capability(v_uid, 'working_record.read', p_employment_id, current_date)) then
      return hr._punch_refusal('hr_no_clock_read_authority',
        'You can see your own clock, or the clock of someone whose working record you have reach over. '
        || 'Neither applies here.',
        jsonb_build_object('needed', 'working_record.read', 'subject_employment_id', p_employment_id));
    end if;
  end if;

  ------------------------------------------------ the blocked lane (§2.1) — a sentence and a door
  v_juris := hr._punch_resolve_juris(p_employment_id, now());
  if not (v_juris ->> 'ok')::boolean then
    return jsonb_build_object('ok', true, 'state', 'blocked',
      'employment_id', p_employment_id,
      'blocked', jsonb_build_object(
        'reason_code', 'no_position_assignment',
        'message', 'Your work location is not set up yet, so the clock cannot tell which rules apply '
                || 'to your day. HR has to set your position assignment.',
        'door', '/hr/me/profile'));
  end if;

  if v_em.status = 'terminated' or v_em.hire_date > (v_juris ->> 'local_work_date')::date then
    return jsonb_build_object('ok', true, 'state', 'blocked',
      'employment_id', p_employment_id, 'tz', v_juris ->> 'tz',
      'local_work_date', (v_juris ->> 'local_work_date')::date,
      'blocked', jsonb_build_object('reason_code', 'employment_not_active',
        'message', 'This employment is not active today, so there is nothing to clock.',
        'door', '/hr/me/employment'));
  end if;

  v_classes := hr._punch_knob('punch_enabled_worker_classes', '["employee","intern","seasonal"]'::jsonb);
  if (v_juris ->> 'worker_class') = 'contractor' or not (v_classes @> to_jsonb(v_juris ->> 'worker_class')) then
    return jsonb_build_object('ok', true, 'state', 'blocked',
      'employment_id', p_employment_id, 'tz', v_juris ->> 'tz',
      'local_work_date', (v_juris ->> 'local_work_date')::date,
      'blocked', jsonb_build_object('reason_code', 'worker_class_not_enabled',
        'message', case when (v_juris ->> 'worker_class') = 'contractor'
                        then 'Contractors do not clock in. Your time is invoiced through your engagement.'
                        else 'Time tracking is not switched on for your worker class.' end,
        'worker_class', v_juris ->> 'worker_class',
        'door', '/hr/me/engagement'));
  end if;

  if v_is_self and not (hr._clock_knob('web_punch_enabled', 'true'::jsonb) #>> '{}')::boolean then
    return jsonb_build_object('ok', true, 'state', 'blocked',
      'employment_id', p_employment_id, 'tz', v_juris ->> 'tz',
      'local_work_date', (v_juris ->> 'local_work_date')::date,
      'blocked', jsonb_build_object('reason_code', 'web_punch_disabled',
        'message', 'The web clock is switched off for your organization. Use your kiosk.',
        'door', '/hr/settings/time-rules'));
  end if;

  ------------------------------------------------ the state
  v_state   := hr._punch_state_of(p_employment_id);
  v_elapsed := hr._punch_elapsed(p_employment_id);

  select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at), '[]'::jsonb) into v_chain
    from hr._punch_open_chain(p_employment_id) c;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'exception_kind', e.exception_kind, 'severity', e.severity,
           'resolution_state', e.resolution_state, 'detected_at', e.detected_at,
           'local_work_date', e.local_work_date, 'calc', e.calc)), '[]'::jsonb)
    into v_excs
    from hr.attendance_exception e
   where e.employment_id = p_employment_id
     and e.local_work_date = (v_juris ->> 'local_work_date')::date
     and e.resolution_state = 'open';

  -- the jurisdictional minimums to DISPLAY. Read from the resolver, never invented, and passed
  -- through with its own advisory / incomplete / no_rule flags intact (§0 law 4).
  begin
    v_rules := hr.resolve_rules('employment', p_employment_id,
                 (v_juris ->> 'local_work_date')::date,
                 array['meal-break','rest-break'], '{}'::jsonb,
                 v_em.organization_id, v_juris ->> 'jurisdiction_key');
  exception when others then
    v_rules := jsonb_build_object('incomplete', jsonb_build_array('rule_resolution_unavailable'));
  end;

  v_attest := (hr._punch_knob('require_break_attestation', 'true'::jsonb) #>> '{}')::boolean
              and coalesce(jsonb_typeof(v_rules #> '{resolved,meal-break}') = 'object'
                        or jsonb_typeof(v_rules #> '{resolved,rest-break}') = 'object', false);

  return jsonb_build_object(
    'ok', true,
    'state', v_state,
    'employment_id', p_employment_id,
    'organization_id', v_em.organization_id,
    'tz', v_juris ->> 'tz',
    'local_work_date', (v_juris ->> 'local_work_date')::date,
    'work_location_id', v_juris ->> 'work_location_id',
    'jurisdiction_key', v_juris ->> 'jurisdiction_key',
    'position_assignment_id', v_juris ->> 'position_assignment_id',
    'allowed_kinds', to_jsonb(hr._punch_allowed_kinds(v_state)),
    'open_chain', v_chain,
    'elapsed_worked_minutes', v_elapsed -> 'elapsed_worked_minutes',
    'elapsed_break_minutes', v_elapsed -> 'elapsed_break_minutes',
    'current_segment_started_at', v_elapsed -> 'current_segment_started_at',
    'attestation_required_at_clock_out', v_attest,
    'open_exceptions', v_excs,
    'jurisdiction_minimums', jsonb_build_object(
      'as_of', (v_juris ->> 'local_work_date')::date,
      'resolved', coalesce(v_rules -> 'resolved', '{}'::jsonb),
      'advisory', coalesce(v_rules -> 'advisory', '[]'::jsonb),
      'incomplete', coalesce(v_rules -> 'incomplete', '[]'::jsonb),
      'no_rule', coalesce(v_rules -> 'no_rule', '[]'::jsonb)),
    -- decision 9, stated on the wire so nobody reads the omission as an oversight
    'states_this_endpoint_cannot_return', jsonb_build_array('offline', 'error'));
end
$$;

comment on function hr.clock_state(uuid) is
  'L3-03: the single read every clock surface mounts on. The client derives no state of its own. '
  'offline and error are transport states a server that answered cannot report (see the payload).';

do $$
declare missing text;
begin
  select string_agg(f, ', ') into missing from unnest(array[
    'hr._punch_attest_axis','hr._punch_raise_exception','hr._punch_orphan_threshold_hours',
    'hr._punch_auto_close_orphan','hr.punch_orphan_sweep','hr.punch_record','hr.clock_state']) f
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if missing is not null then
    raise exception 'hr_l3_02: these objects did not land: %', missing;
  end if;
end $$;
