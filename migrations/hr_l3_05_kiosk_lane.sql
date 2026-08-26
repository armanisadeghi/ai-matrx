-- HR domain L3 — migration 5 of 7 (register item HRB-015, lane L3 punch + kiosk).
--
-- The kiosk lane's two new doors: `public.hr_kiosk_claim_pairing` (the ONLY place a device secret
-- is ever minted) and `public.hr_kiosk_punch` (the token IS the authorization). Both
-- `SECURITY DEFINER` with EXECUTE to `anon` and `authenticated`; `hr.punch` carries zero `anon`
-- table grants, so these functions are the only door.
--
-- Authority: SPEC-TIME §1.2, §3.3, §14 D1; SPEC-ACCESS §6.3; SPEC-DATA-MODEL §4.11, §7.10, §7.11;
--            R-L3-READINESS L3-15, L3-17, L3-18, L3-20, L3-21, U-05, U-09.
-- Applied live as `hr_l3_05_kiosk_lane`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE FROZEN `hr_kiosk_punch` SIGNATURE HAS A PIN AND NO EMPLOYEE NUMBER, SO THE PERSON MUST
--    ALREADY BE BOUND. Identifying an employee from a bare PIN would mean bcrypt-comparing it
--    against every active PIN in the organization — slow, and worse, a four-digit PIN collides
--    across a workforce, so it would punch the WRONG PERSON some fraction of the time. The live
--    `public.hr_kiosk_session_open(p_session_token, p_employee_number, p_employment_pin)` already
--    owns employee-number resolution and the lockout machinery, and it binds the person onto the
--    SAME `hr.kiosk_session` row. So the kiosk calls `hr_kiosk_session_open` first, and
--    `hr_kiosk_punch` re-verifies the PIN against the already-bound employment. An unbound session
--    is refused with "Enter your employee number and PIN" — which is also the wording for an
--    expired person-session and reveals nothing either way.
--
-- 2. `hr.clock.kiosk_enabled` IS READ, BUT AN ABSENT ROW IS NOT AN OPT-OUT — AND THIS IS A DEBT,
--    NOT A LOOPHOLE. SPEC-TIME §13 registers the knob default as `false` ("orgs opt in"). Verified
--    live: `platform.feature_knob` is keyed `(feature, key)` and **has no organization column at
--    all**, so there is no rung on which one org can differ from another. Defaulting an unseeded
--    row to `false` would therefore not implement "orgs opt in" — it would disable the kiosk for
--    every organization on the platform with no configuration that could re-enable one of them.
--    So: an explicit `false` refuses; an ABSENT row does not, because an administrator issuing a
--    pairing code is that organization's opt-in and is the only per-org signal that exists.
--    **DEBT, owner the knob-store owner + SPEC-UI-IA §10's owner: `hr.clock.kiosk_enabled` needs an
--    organization rung before it can mean what §13 says it means.**
--
-- 3. 🚨 R-L3 U-05 IS ENFORCED HERE AS WELL AS IN `hr.punch_record`, AND IT ALSO UNBINDS.
--    A person-bound session past `kiosk_session_ttl_minutes` (default 2) is not merely refused —
--    the row's `employment_id` is cleared and `auth_method` returns to `device`, so a tablet that
--    an employee walked away from cannot be punched against by the next person to touch it. The
--    live `hr_kiosk_session_open` leaves `expires_at` at the device's 12 hours when it binds a
--    person; **DEBT, owner Core C3 (`hr_c3_07_actor_lane`): it should shorten `expires_at`.**
--    Until it does, this function is what makes the 12-hour value not gate a person's session.
--
-- 4. THE PAIRING CLAIM RETURNS ONE SENTENCE FOR EVERY FAILURE. Unknown code, expired code, already
--    claimed, blank input and kiosk-disabled all return the identical `pairing_not_available`
--    message. A distinguishable refusal would let anyone with the endpoint enumerate which codes
--    exist and which organizations run kiosks. `pairing_code_hash` is NULLED on a successful claim,
--    so a claim is structurally once-only rather than once-only by a flag anyone could reset.
--
-- 5. THE PAIRING CODE IS MATCHED BY SCANNING THE UNCLAIMED, UNEXPIRED CANDIDATES. bcrypt carries
--    its salt inside the digest, so a code cannot be looked up by hash. The candidate set is
--    `pairing_code_hash IS NOT NULL AND pairing_claimed_at IS NULL AND pairing_code_expires_at >
--    now()` — devices actively waiting to be paired, which is a handful, not a table scan.
--
-- 6. 🚨 THE KIOSK RESULT IS THE DISPLAY NAME AND THE PUNCH, AND DELIBERATELY NOT THE `clock_state`
--    BLOCK. `hr.punch_record` returns the full clock state, which carries the day's open
--    exceptions and the resolved jurisdiction rule detail. None of that is a wall tablet's
--    business (§3.3: never a roster, never another HR field, never more than the punching
--    employee's display name). The tablet gets the five punch fields it needs to render a
--    confirmation card, the resulting state word, and the auto-dismiss interval.
--
-- 7. NOBODY IS ISSUING PAIRING CODES YET. `hr_kiosk_claim_pairing` reads
--    `pairing_code_hash` / `pairing_code_expires_at`, which no shipped function writes — the HR-admin
--    side (generate a code for a device) is route 75a's, batched to L1 per R-L3 U-08, and the panel
--    components are L3's client lane. **DEBT, owner L1 + the L3 client lane: `/hr/settings/devices`
--    and its code-issuing RPC.** Named here so the gap is visible rather than discovered when the
--    first tablet is unboxed.
-- ===================================================================================

create or replace function public.hr_kiosk_claim_pairing(
  p_pairing_code text, p_device_fingerprint text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $$
declare
  d        hr.kiosk_device%rowtype;
  v_secret text;
  v_org    text;
  v_loc    text;
  v_gate   jsonb;
  r        record;
begin
  -- ONE sentence for every failure mode: unknown, expired, already claimed, blank. It leaks
  -- nothing about whether a code exists, whether it once existed, or which org it belongs to.
  if p_pairing_code is null or length(btrim(p_pairing_code)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'pairing_not_available',
      'message', 'That pairing code cannot be used. Ask an administrator for a new one.');
  end if;

  -- decision 5: bcrypt carries its salt inside the digest, so scan the small waiting-to-pair set
  for r in
    select k.* from hr.kiosk_device k
     where k.deleted_at is null
       and k.pairing_code_hash is not null
       and k.pairing_claimed_at is null
       and k.pairing_code_expires_at is not null
       and k.pairing_code_expires_at > now()
  loop
    if r.pairing_code_hash = extensions.crypt(btrim(p_pairing_code), r.pairing_code_hash) then
      d := r;
      exit;
    end if;
  end loop;

  if d.id is null then
    return jsonb_build_object('ok', false, 'reason', 'pairing_not_available',
      'message', 'That pairing code cannot be used. Ask an administrator for a new one.');
  end if;

  -- decision 2: read, but an ABSENT row is not an opt-out
  v_gate := hr._clock_knob('kiosk_enabled', 'null'::jsonb);
  if jsonb_typeof(v_gate) = 'boolean' and not (v_gate #>> '{}')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'pairing_not_available',
      'message', 'That pairing code cannot be used. Ask an administrator for a new one.');
  end if;

  -- 🚨 THE ONLY PLACE A DEVICE SECRET IS EVER MINTED. Returned once; only the hash is stored.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  perform hr.arm_write();
  update hr.kiosk_device
     set device_secret_hash   = extensions.crypt(v_secret, extensions.gen_salt('bf')),
         device_secret_set_at = now(),
         pairing_claimed_at   = now(),
         pairing_code_hash    = null,          -- decision 4: once-only structurally, not by a flag
         device_fingerprint   = coalesce(p_device_fingerprint, device_fingerprint),
         last_seen_at         = now()
   where id = d.id;

  select o.name into v_org from iam.organizations o where o.id = d.organization_id;
  select l.name into v_loc from hr.location l where l.id = d.location_id;

  return jsonb_build_object(
    'ok', true,
    'device_id', d.id,
    'device_secret', v_secret,
    'device_secret_is_shown_once', true,
    'device_name', d.device_name,
    'organization_name', v_org,
    'location_name', v_loc,
    'trust_state', 'pending',
    'message', 'This tablet is paired. It cannot record punches until an administrator marks it trusted.');
end
$$;

comment on function public.hr_kiosk_claim_pairing(text, text) is
  'L3-15: the ONLY way a kiosk device secret is ever minted. The secret is returned once and never re-readable. Every refusal is one sentence that leaks nothing.';

revoke all on function public.hr_kiosk_claim_pairing(text, text) from public;
grant execute on function public.hr_kiosk_claim_pairing(text, text) to anon, authenticated;

create or replace function public.hr_kiosk_punch(
  p_session_token     text,
  p_employee_pin      text,
  p_kind              text,
  p_device_reported_at timestamptz,
  p_idempotency_key   text,
  p_photo_file_id     uuid  default null,
  p_geo               jsonb default null,
  p_attestation       jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $$
declare
  s        hr.kiosk_session%rowtype;
  v_ttl    integer;
  v_ver    jsonb;
  v_res    jsonb;
  v_name   text;
begin
  if p_session_token is null or btrim(p_session_token) = '' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_valid',
      'message', 'This tablet is not signed in. Ask an administrator.');
  end if;

  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
     and ended_at is null and deleted_at is null;

  if not found or s.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_not_valid',
      'message', 'This tablet''s session has ended. It will sign in again on its own.');
  end if;

  -- decision 1: the token authorizes the DEVICE. The person is bound by
  -- public.hr_kiosk_session_open, which owns employee-number resolution and the PIN lockout
  -- machinery. This function never reimplements it and never learns whether a PIN exists.
  if s.employment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated',
      'message', 'Enter your employee number and PIN.');
  end if;

  -- decision 3 / R-L3 U-05: the PERSON-BOUND session is minutes, never the device's 12 hours,
  -- and a lapsed one is UNBOUND so the next person to touch the tablet cannot punch as them.
  v_ttl := (hr._punch_knob('kiosk_session_ttl_minutes', '2'::jsonb) #>> '{}')::integer;
  if s.started_at + make_interval(mins => v_ttl) <= now() then
    perform hr.arm_write();
    update hr.kiosk_session set employment_id = null, auth_method = 'device' where id = s.id;
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated',
      'message', 'Enter your employee number and PIN.');
  end if;

  -- Re-verify on every punch through the EXISTING machinery (attempt count, locked_until all live
  -- on hr.employment_pin). The wording never distinguishes a wrong PIN from a PIN that is not set.
  v_ver := hr.verify_employment_pin(s.employment_id, p_employee_pin);
  if not coalesce((v_ver ->> 'ok')::boolean, false) then
    perform hr.arm_write();
    update hr.kiosk_session set failed_attempt_count = failed_attempt_count + 1 where id = s.id;
    if (v_ver ->> 'reason') = 'locked' then
      return jsonb_build_object('ok', false, 'reason', 'locked',
        'message', 'Too many incorrect entries. Try again later, or ask your manager.');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated',
      'message', 'That was not correct. Try again, or ask your manager.');
  end if;

  -- lets hr.clock_state admit this kiosk for this employment; transaction-local
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

  -- 🚨 decision 6: THE DISPLAY NAME AND THE PUNCH RESULT ONLY. Never a roster, never another HR
  -- field, and never the clock_state block (jurisdiction rule detail + the day's open exceptions
  -- are not a wall tablet's business).
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
    'duplicate_suspected', exists (
      select 1 from jsonb_array_elements(coalesce(v_res -> 'exceptions', '[]'::jsonb)) x
       where x ->> 'detector' = 'near_duplicate'),
    'confirm_dismiss_seconds',
      (hr._punch_knob('kiosk_confirm_dismiss_seconds', '5'::jsonb) #>> '{}')::integer);
end
$$;

comment on function public.hr_kiosk_punch(text, text, text, timestamptz, text, uuid, jsonb, jsonb) is
  'L3-17: the kiosk punch. The session token is the authorization; PIN verification delegates to the existing hr.verify_employment_pin lockout machinery; the write delegates to hr.punch_record (SPEC-TIME 14 D1). Returns the display name and the punch result ONLY.';

revoke all on function public.hr_kiosk_punch(text, text, text, timestamptz, text, uuid, jsonb, jsonb) from public;
grant execute on function public.hr_kiosk_punch(text, text, text, timestamptz, text, uuid, jsonb, jsonb) to anon, authenticated;

do $$
declare missing text;
begin
  select string_agg(f, ', ') into missing from unnest(array[
    'public.hr_kiosk_claim_pairing','public.hr_kiosk_punch']) f
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if missing is not null then
    raise exception 'hr_l3_05: these objects did not land: %', missing;
  end if;
end $$;
