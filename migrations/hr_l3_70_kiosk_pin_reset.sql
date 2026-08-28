-- hr_l3_70_kiosk_pin_reset.sql
--
-- RULED: THE KIOSK CONSUMES `must_reset`.
--
-- `hr.employment_pin.must_reset` existed and defaulted to true, and BEFORE THIS MIGRATION NOTHING
-- READ IT AND NOTHING SET IT DELIBERATELY. Two consequences, both live:
--
--   1. A PIN an HR writer set for somebody else was flagged — correctly — and no surface ever acted
--      on the flag, so a temporary PIN was permanent.
--   2. A PIN the SUBJECT set for themselves was flagged too, purely from the column default. Their
--      own chosen PIN demanded a reset that nothing would ever ask for. (Corrected below, scoped to
--      self-set rows.)
--
-- The population this matters to has no other surface: staff whose only way in is the wall tablet.
-- So the tablet is where the reset happens, and the door needs an arm that works there —
-- `auth.uid()` is NULL at a kiosk. The session token is the proof of identity, exactly as the
-- device secret is for the device (R1's possession principle): a person-bound kiosk session only
-- exists because `hr_kiosk_session_open` already accepted this person's PIN moments earlier.
--
-- Applied live 2026-08-28. NOTE: applied to Supabase migration history under the name
-- `hr_l3_32_kiosk_pin_reset` before the repo's numbering collision was spotted; the ledger row and
-- this file are `hr_l3_70`, which is the key `pnpm check:migrations` compares against.

create or replace function public.hr_set_employment_pin(p_employment_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, hr, extensions
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_len int; v_id uuid; v_prev uuid; v_audit uuid; v_actor uuid;
  v_self boolean;
begin
  if v_uid is null then
    raise exception 'hr_set_employment_pin: no authenticated caller' using errcode = '42501';
  end if;
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null then
    raise exception 'hr_set_employment_pin: no hr.employment with id %', p_employment_id using errcode = 'P0002';
  end if;

  v_self := p_employment_id = any(hr.employments_of(v_uid));

  if not (hr.capability(v_uid,'working_record.write', p_employment_id) or v_self) then
    return hr._governance_refusal(v_org, 'hr_employment_pin', 'no_capability',
      'only an HR writer or the employee themselves may set a kiosk PIN', p_employment_id);
  end if;

  v_len := (hr._knob('hr.time_and_attendance','kiosk_pin_length') #>> '{}')::integer;
  if p_pin is null or p_pin !~ '^[0-9]+$' or length(p_pin) <> v_len then
    return hr._governance_refusal(v_org, 'hr_employment_pin', 'pin_shape',
      format('the PIN must be exactly %s digits (hr.time_and_attendance.kiosk_pin_length)', v_len),
      p_employment_id);
  end if;

  perform hr.arm_write();
  select id into v_prev from hr.employment_pin
   where employment_id = p_employment_id and revoked_at is null and deleted_at is null;
  if v_prev is not null then
    update hr.employment_pin set revoked_at = now(), revoked_reason = 'rotated' where id = v_prev;
  end if;
  select em.id into v_actor from hr.employment em where em.id = any(hr.employments_of(v_uid))
    and em.organization_id = v_org limit 1;

  insert into hr.employment_pin
    (organization_id, employment_id, pin_hash, pin_algo, pin_length, set_at, set_by_employment_id,
     rotated_from_id, must_reset)
  values (v_org, p_employment_id,
          extensions.crypt(p_pin, extensions.gen_salt('bf')), 'bcrypt', v_len, now(), v_actor, v_prev,
          -- A PIN somebody else chose is TEMPORARY. A PIN you chose yourself is not: flagging it
          -- would demand a reset of a secret only the subject has ever known.
          not v_self)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_employment_pin',
    p_purpose => 'operational', p_basis => case when v_self then 'self' else 'role' end,
    p_granted => true, p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'restricted',
    p_subject_employment_id => p_employment_id,
    p_is_self_access => v_self);

  return jsonb_build_object('granted', true, 'employment_pin_id', v_id, 'audit_id', v_audit,
                            'must_reset', not v_self);
end
$fn$;

create or replace function public.hr_kiosk_session_open(
  p_session_token text, p_employee_number text, p_employment_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, hr, extensions
as $fn$
declare s hr.kiosk_session%rowtype; v_empl uuid; v_ver jsonb; v_must boolean;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found or s.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason','session_not_valid');
  end if;

  select em.id into v_empl
    from hr.employee e join hr.employment em on em.employee_id = e.id and em.deleted_at is null
   where e.organization_id = s.organization_id and e.employee_number = p_employee_number
     and e.deleted_at is null and em.status <> 'terminated'
   order by em.hire_date desc limit 1;
  if v_empl is null then
    return jsonb_build_object('ok', false, 'reason','not_authenticated');
  end if;

  v_ver := hr.verify_employment_pin(v_empl, p_employment_pin);
  if not (v_ver ->> 'ok')::boolean then
    perform hr.arm_write();
    update hr.kiosk_session set failed_attempt_count = failed_attempt_count + 1 where id = s.id;
    return jsonb_build_object('ok', false, 'reason',
      case when (v_ver ->> 'reason') = 'locked' then 'locked' else 'not_authenticated' end,
      'locked_until', v_ver -> 'locked_until');
  end if;

  select ep.must_reset into v_must from hr.employment_pin ep
   where ep.employment_id = v_empl and ep.revoked_at is null and ep.deleted_at is null
   limit 1;

  perform hr.arm_write();
  update hr.kiosk_session set employment_id = v_empl, auth_method = 'pin', started_at = now()
   where id = s.id;

  return jsonb_build_object('ok', true, 'kiosk_session_id', s.id, 'employment_id', v_empl,
                            'expires_at', s.expires_at,
                            -- The tablet is the only surface this person has, so the tablet is
                            -- where a temporary PIN gets replaced.
                            'must_reset', coalesce(v_must, false));
end
$fn$;

create or replace function public.hr_kiosk_pin_reset(p_session_token text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, hr, extensions
as $fn$
declare
  s hr.kiosk_session%rowtype; v_org uuid; v_len int; v_prev uuid; v_id uuid; v_audit uuid;
  v_same boolean;
begin
  -- THE SESSION IS THE PROOF OF IDENTITY, AND THE EMPLOYMENT IS READ FROM IT — never from an
  -- argument. A person-bound session exists only because `hr_kiosk_session_open` already accepted
  -- THIS person's PIN moments ago, so possession of the token is possession of that proof. Taking
  -- an employment id from the caller would let any tablet reset any employee's PIN.
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found or s.expires_at <= now() or s.employment_id is null then
    return jsonb_build_object('ok', false, 'reason','session_not_valid');
  end if;

  v_org := s.organization_id;
  v_len := (hr._knob('hr.time_and_attendance','kiosk_pin_length') #>> '{}')::integer;
  if p_new_pin is null or p_new_pin !~ '^[0-9]+$' or length(p_new_pin) <> v_len then
    return jsonb_build_object('ok', false, 'reason','pin_shape',
      'message', format('Your PIN must be %s digits.', v_len));
  end if;

  select ep.id, ep.pin_hash = extensions.crypt(p_new_pin, ep.pin_hash)
    into v_prev, v_same
    from hr.employment_pin ep
   where ep.employment_id = s.employment_id and ep.revoked_at is null and ep.deleted_at is null
   limit 1;

  -- Re-setting the temporary PIN to itself would clear the flag while leaving the secret the
  -- administrator chose in place — the exact thing this reset exists to end.
  if coalesce(v_same, false) then
    return jsonb_build_object('ok', false, 'reason','pin_unchanged',
      'message', 'Choose a PIN different from the one you were given.');
  end if;

  perform hr.arm_write();
  if v_prev is not null then
    update hr.employment_pin
       set revoked_at = now(), revoked_reason = 'reset_at_kiosk'
     where id = v_prev;
  end if;

  insert into hr.employment_pin
    (organization_id, employment_id, pin_hash, pin_algo, pin_length, set_at,
     set_by_employment_id, rotated_from_id, must_reset)
  values (v_org, s.employment_id,
          extensions.crypt(p_new_pin, extensions.gen_salt('bf')), 'bcrypt', v_len, now(),
          -- The subject set it. `set_by` is them, not the administrator who issued the temporary.
          s.employment_id, v_prev, false)
  returning id into v_id;

  -- basis 'self': the person at the tablet IS the subject, proven by the PIN this session accepted.
  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_employment_pin',
    p_purpose => 'operational', p_basis => 'self', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'restricted',
    p_subject_employment_id => s.employment_id, p_is_self_access => true);

  return jsonb_build_object('ok', true, 'employment_pin_id', v_id, 'audit_id', v_audit,
                            'must_reset', false);
end
$fn$;

-- The tablet is anonymous: the session token is the authorization, as for every kiosk door.
-- REVOKE from PUBLIC first — Postgres grants EXECUTE to PUBLIC by default on a new function, and
-- the sibling kiosk doors do not carry it.
revoke execute on function public.hr_kiosk_pin_reset(text, text) from public;
grant execute on function public.hr_kiosk_pin_reset(text, text) to anon, authenticated;

-- Correct the rows the column default already mis-flagged. Scoped to self-set rows only — an
-- HR-set PIN keeps its flag. Goes through `hr.arm_write()` like every other hr.* write
-- (SPEC-ACCESS law 2; the write guard caught this on the first attempt).
do $backfill$
begin
  perform hr.arm_write();
  update hr.employment_pin
     set must_reset = false
   where revoked_at is null and deleted_at is null
     and must_reset is true
     and set_by_employment_id = employment_id;
end
$backfill$;
