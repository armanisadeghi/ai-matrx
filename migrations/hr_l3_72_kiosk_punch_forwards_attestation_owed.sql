-- hr_l3_72_kiosk_punch_forwards_attestation_owed.sql
--
-- 🚨 THE KIOSK COULD NOT SAY AN ATTESTATION WAS OWED, BECAUSE NOTHING TOLD IT.
--
-- SPEC-TIME §3.2 requires the clock-out attestation, and the amended clause requires the KIOSK to
-- state that one is owed and point at the timesheet — the tablet cannot COLLECT it (an attestation
-- must show the total it is asking about and the meal rule it asks under, and §1.2 deliberately
-- keeps the clock_state block off a wall tablet).
--
-- `hr.punch_record` already returns `clock_state.attestation_required_at_clock_out`, and
-- `hr_kiosk_punch` was simply not forwarding it. The client previously declared an
-- `attestationRequired` field that DID NOT EXIST on the wire; it was removed rather than faked, and
-- this is the other half of that correction — the flag now genuinely exists.
--
-- One boolean, and nothing else: no rule detail, no totals, no roster.
--
-- ⚠️ KNOWN UPSTREAM: the flag is currently ALWAYS false for everybody, and not because of this
-- function. `hr.clock_state` calls `hr.resolve_rules('employment', …)` while the registered entity
-- token is `hr_employment`, so the call raises `unknown_subject_type` and clock_state's
-- `exception when others` swallows it into `incomplete:['rule_resolution_unavailable']`. Correcting
-- the token alone does not fix it either: `hr.employment` carries neither `jurisdiction_key` nor
-- `jurisdiction_id`, so `_subject_jurisdiction_key` raises `subject_carries_no_jurisdiction`.
-- Reported to the jurisdiction lane rather than guessed at here — which subject a clock-state rule
-- resolution should run against changes which law applies to somebody's meal break.
--
-- Applied live 2026-08-28.

create or replace function public.hr_kiosk_punch(
  p_session_token text, p_employee_pin text, p_kind text,
  p_device_reported_at timestamptz, p_idempotency_key text,
  p_photo_file_id uuid default null, p_geo jsonb default null, p_attestation jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, hr, extensions
as $fn$
declare s hr.kiosk_session%rowtype; v_res jsonb; v_name text; v_ver jsonb;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found or s.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason','session_not_valid');
  end if;
  if s.employment_id is null then
    return jsonb_build_object('ok', false, 'reason','not_authenticated');
  end if;

  -- The PIN is re-checked on every punch: a bound session is not a standing authorization.
  v_ver := hr.verify_employment_pin(s.employment_id, p_employee_pin);
  if not (v_ver ->> 'ok')::boolean then
    perform hr.arm_write();
    update hr.kiosk_session set failed_attempt_count = failed_attempt_count + 1 where id = s.id;
    return jsonb_build_object('ok', false, 'reason',
      case when (v_ver ->> 'reason') = 'locked' then 'locked' else 'not_authenticated' end);
  end if;

  -- lets hr.clock_state admit this kiosk for this employment, transaction-local
  perform set_config('hr.kiosk_session_id', s.id::text, true);

  v_res := hr.punch_record(
    p_employment_id    => s.employment_id,
    p_kind             => p_kind,
    p_occurred_at      => p_device_reported_at,
    p_source           => 'kiosk',
    p_idempotency_key  => p_idempotency_key,
    p_kiosk_session_id => s.id,
    p_geo              => p_geo,
    p_photo_file_id    => p_photo_file_id,
    p_attestation      => p_attestation);

  select coalesce(e.preferred_first_name || ' ' || coalesce(e.preferred_last_name, e.legal_last_name),
                  e.display_name,
                  e.legal_first_name || ' ' || e.legal_last_name)
    into v_name
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = s.employment_id;

  -- 🚨 THE DISPLAY NAME AND THE PUNCH RESULT ONLY. Never a roster, never another HR field, and
  -- never the clock_state block hr.punch_record returns (it carries jurisdiction rule detail and
  -- the day's open exceptions, which are not a wall tablet's business).
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'employee_display_name', v_name,
      'reason', v_res #>> '{error,code}',
      'message', v_res #>> '{error,message}');
  end if;

  return jsonb_build_object(
    'ok', true,
    'employee_display_name', v_name,
    'replayed', coalesce((v_res ->> 'replayed')::boolean, false),
    'punch', jsonb_build_object(
      'id',              v_res #> '{punch,id}',
      'punch_kind',      v_res #> '{punch,punch_kind}',
      'occurred_at',     v_res #> '{punch,occurred_at}',
      'local_work_date', v_res #> '{punch,local_work_date}',
      'tz',              v_res #> '{punch,tz}'),
    'resulting_state', v_res #> '{clock_state,state}',
    -- 🚨 ONE BOOLEAN. The tablet cannot COLLECT the attestation (it has neither the total it must
    -- show nor the rule it asks under), so it states that one is owed and points at the timesheet.
    'attestation_owed',
      coalesce((v_res #>> '{clock_state,attestation_required_at_clock_out}')::boolean, false),
    'duplicate_suspected', exists (
      select 1 from jsonb_array_elements(coalesce(v_res -> 'exceptions', '[]'::jsonb)) x
       where x ->> 'detector' = 'near_duplicate'),
    'confirm_dismiss_seconds',
      (hr._punch_knob('kiosk_confirm_dismiss_seconds', '5'::jsonb, s.organization_id) #>> '{}')::integer);
end
$fn$;
