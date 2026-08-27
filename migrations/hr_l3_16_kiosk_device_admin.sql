-- HR domain L3 — migration 16 (register item HRB-015, lane L3 punch + kiosk).
-- Full header lives in matrx-frontend/migrations/hr_l3_16_kiosk_device_admin.sql.
--
-- The four kiosk device-admin contracts route 75a needs, matching KioskDeviceAdminSource /
-- KioskDeviceRow / KioskPairingCode in features/hr/time/ exactly. Plus `tz` on the kiosk session
-- config, which the tablet needs to render stamped times.
--
-- 🚨 U-09'S FOUR COLUMNS ARE ALREADY LIVE - NO ALTER IS OWED. Verified against
-- information_schema before writing a line: `hr.kiosk_device` already carries pairing_code_hash,
-- pairing_code_expires_at, pairing_claimed_at and device_fingerprint. The readiness doc's "owed
-- DDL" line is stale, and `hr_kiosk_claim_pairing` has been reading those columns since hr_l3_05.
-- No ALTER, so no DDL guard to re-ack.
--
-- 🚨 NO KIOSK-ORIGINATED CORRECTION CONTRACT IS INVENTED. Per the ruling, the duplicate-suspected
-- card's ONE door points the employee at a manager-attended correction; v1 has no kiosk RPC for it
-- and this migration does not create one.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
-- 1. DEVICE ADMIN IS HR ADMIN, ENFORCED THROUGH THE LANE'S EXISTING TENANCY-DEFENDED PREDICATE.
--    All four gate on `hr._punch_capability(uid, 'working_record.write', null, current_date, org)` -
--    the org-rung form, since a device belongs to an organization and not to a person. That routes
--    through the hr_l3_09 defence, so the `hr.capability` cross-org leak cannot reach device admin.
-- 2. THE PAIRING CODE IS SHOWN ONCE AND STORED ONLY AS A BCRYPT HASH, exactly like the device
--    secret. Regenerating a code for an unclaimed device REPLACES the old one (the old code stops
--    working immediately) rather than creating a second device row.
-- 3. `set_trust` REQUIRES A REASON. Revoking a wall clock stops a location punching; that is not a
--    toggle, it is an act with a record. The reason lands in `hr.kiosk_device.metadata.trust_log`
--    as an append-only array, and revoking also ENDS every live session for the device so
--    revocation does not wait for the next heartbeat where it can act immediately.
-- 4. THE LIST NEVER RETURNS A SECRET OR A CODE. Not `device_secret_hash`, not `pairing_code_hash`.
--    It returns `pairing_code_expires_at` / `pairing_claimed_at` so an administrator can see a
--    pairing is pending, which is the only thing the surface needs.
-- ===================================================================================

create or replace function hr._kiosk_admin_gate(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return hr._punch_refusal('hr_no_authenticated_caller',
      'Kiosk device administration is a signed-in HR surface.');
  end if;
  if not hr._punch_capability(v_uid, 'working_record.write', null, current_date, p_organization_id) then
    return hr._punch_refusal('hr_no_kiosk_admin_authority',
      'Administering kiosk devices needs the working_record.write capability in this organization.',
      jsonb_build_object('needed', 'working_record.write', 'organization_id', p_organization_id));
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- The row shape KioskDeviceRow declares. Never a secret, never a code (decision 4).
create or replace function hr._kiosk_device_row(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  select jsonb_build_object(
    'id', d.id,
    'device_name', d.device_name,
    'location_id', d.location_id,
    'location_name', (select l.name from hr.location l where l.id = d.location_id),
    'trust_state', d.trust_state,
    'last_seen_at', d.last_seen_at,
    'last_seen_ip', host(d.last_seen_ip),
    'clock_skew_seconds', d.clock_skew_seconds,
    'max_clock_skew_seconds', d.max_clock_skew_seconds,
    'require_photo', d.require_photo,
    'require_geo', d.require_geo,
    'pairing_code_expires_at', d.pairing_code_expires_at,
    'pairing_claimed_at', d.pairing_claimed_at,
    'registered_by_name', (select e.display_name from hr.employment em
                             join hr.employee e on e.id = em.employee_id
                            where em.id = d.registered_by_employment_id))
    from hr.kiosk_device d where d.id = p_id;
$$;

create or replace function hr.kiosk_device_list(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v_gate jsonb;
begin
  v_gate := hr._kiosk_admin_gate(p_organization_id);
  if not coalesce((v_gate ->> 'ok')::boolean, false) then return v_gate; end if;
  return jsonb_build_object('ok', true,
    'rows', (select coalesce(jsonb_agg(hr._kiosk_device_row(d.id) order by d.device_name), '[]'::jsonb)
               from hr.kiosk_device d
              where d.organization_id = p_organization_id and d.deleted_at is null));
end
$$;

create or replace function hr.kiosk_pairing_code_create(
  p_organization_id uuid, p_device_name text, p_location_id uuid, p_device_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_gate jsonb; v_code text; v_ttl int; v_id uuid; v_exp timestamptz; v_emp uuid;
begin
  v_gate := hr._kiosk_admin_gate(p_organization_id);
  if not coalesce((v_gate ->> 'ok')::boolean, false) then return v_gate; end if;

  if p_device_id is null and coalesce(btrim(p_device_name), '') = '' then
    return hr._punch_refusal('hr_kiosk_device_name_required',
      'Give the tablet a name an administrator will recognise on a list - "Break room tablet", not a serial number.');
  end if;
  if p_device_id is null and p_location_id is null then
    return hr._punch_refusal('hr_kiosk_location_required',
      'A kiosk belongs to a work location: that is what its punches are checked against and what '
      || 'cross-location flagging compares to.');
  end if;

  v_ttl  := (hr._punch_knob('pairing_code_ttl_minutes', '15'::jsonb) #>> '{}')::integer;
  v_exp  := now() + make_interval(mins => v_ttl);
  -- unambiguous alphabet: no O/0, no I/1
  v_code := 'PAIR-' || upper(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'),
                                              '+/=OI01lo', 'ABCDEFGHJ'), 1, 6));
  select em.id into v_emp from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = auth.uid() and em.organization_id = p_organization_id limit 1;

  perform hr.arm_write();
  if p_device_id is not null then
    -- decision 2: regenerating replaces the old code; it stops working immediately
    update hr.kiosk_device
       set pairing_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
           pairing_code_expires_at = v_exp,
           pairing_claimed_at = null
     where id = p_device_id and organization_id = p_organization_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      return hr._punch_refusal('hr_kiosk_device_not_found',
        'That device does not exist in this organization.',
        jsonb_build_object('device_id', p_device_id));
    end if;
  else
    insert into hr.kiosk_device (organization_id, location_id, device_name, device_secret_hash,
      pairing_code_hash, pairing_code_expires_at, trust_state, registered_by_employment_id)
    values (p_organization_id, p_location_id, btrim(p_device_name),
            '!unpaired',   -- replaced by hr_kiosk_claim_pairing; NOT NULL, never a usable secret
            extensions.crypt(v_code, extensions.gen_salt('bf')), v_exp, 'pending', v_emp)
    returning id into v_id;
  end if;

  -- decision 2: the code is returned ONCE. Only its hash is stored.
  return jsonb_build_object('ok', true, 'device_id', v_id, 'code', v_code, 'expires_at', v_exp,
    'code_is_shown_once', true,
    'device', hr._kiosk_device_row(v_id));
end
$$;

create or replace function hr.kiosk_device_set_trust(
  p_device_id uuid, p_trust_state text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare d hr.kiosk_device%rowtype; v_gate jsonb; v_ended int := 0;
begin
  select * into d from hr.kiosk_device where id = p_device_id and deleted_at is null;
  if not found then
    return hr._punch_refusal('hr_kiosk_device_not_found', 'That device does not exist.');
  end if;
  v_gate := hr._kiosk_admin_gate(d.organization_id);
  if not coalesce((v_gate ->> 'ok')::boolean, false) then return v_gate; end if;

  if p_trust_state not in ('pending','trusted','suspended','revoked') then
    return hr._punch_refusal('hr_kiosk_trust_state_unknown',
      p_trust_state || ' is not a trust state.',
      jsonb_build_object('allowed', jsonb_build_array('pending','trusted','suspended','revoked')));
  end if;
  -- decision 3: not a toggle, an act with a record
  if p_reason is null or length(btrim(p_reason)) < 2 then
    return hr._punch_refusal('hr_kiosk_trust_reason_required',
      'Changing a tablet''s trust needs a written reason. Revoking one stops a whole location '
      || 'punching, and somebody will ask why.');
  end if;

  perform hr.arm_write();
  update hr.kiosk_device
     set trust_state = p_trust_state,
         metadata = metadata || jsonb_build_object('trust_log',
           coalesce(metadata -> 'trust_log', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'at', now(), 'from', d.trust_state, 'to', p_trust_state,
             'reason', p_reason, 'by_user_id', auth.uid())))
   where id = p_device_id;

  -- decision 3: revocation acts NOW, not at the next heartbeat
  if p_trust_state in ('revoked','suspended') then
    perform hr.arm_write();
    with x as (
      update hr.kiosk_session
         set ended_at = now(),
             end_reason = case when p_trust_state = 'suspended' then 'device_suspended' else 'revoked' end
       where kiosk_device_id = p_device_id and ended_at is null
      returning 1)
    select count(*) into v_ended from x;
  end if;

  return jsonb_build_object('ok', true, 'device', hr._kiosk_device_row(p_device_id),
    'sessions_ended', v_ended,
    'note', case when p_trust_state in ('revoked','suspended')
      then 'Live sessions were ended immediately; the tablet also bricks at its next heartbeat.' end);
end
$$;

create or replace function hr.kiosk_device_set_capture(
  p_device_id uuid, p_require_photo boolean, p_require_geo boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare d hr.kiosk_device%rowtype; v_gate jsonb;
begin
  select * into d from hr.kiosk_device where id = p_device_id and deleted_at is null;
  if not found then
    return hr._punch_refusal('hr_kiosk_device_not_found', 'That device does not exist.');
  end if;
  v_gate := hr._kiosk_admin_gate(d.organization_id);
  if not coalesce((v_gate ->> 'ok')::boolean, false) then return v_gate; end if;

  perform hr.arm_write();
  update hr.kiosk_device
     set require_photo = coalesce(p_require_photo, require_photo),
         require_geo   = coalesce(p_require_geo,   require_geo),
         metadata = metadata || jsonb_build_object('capture_log',
           coalesce(metadata -> 'capture_log', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'at', now(), 'require_photo', coalesce(p_require_photo, d.require_photo),
             'require_geo', coalesce(p_require_geo, d.require_geo), 'by_user_id', auth.uid())))
   where id = p_device_id;

  return jsonb_build_object('ok', true, 'device', hr._kiosk_device_row(p_device_id),
    -- SPEC-TIME 4.9: turning capture on is never retroactive and the employee is told BEFORE the
    -- punch. The config_version changes, so every tablet picks it up on its next heartbeat.
    'not_retroactive', true,
    'note', 'Capture applies to punches from now on. It never backfills and never re-labels a '
         || 'historical punch as having been captured.');
end
$$;

-- ---------------------------------------------------------------------------------
-- the tz gap: the tablet renders stamped times, so the session config must carry the zone
-- ---------------------------------------------------------------------------------
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr._kiosk_device_config(uuid)'::regprocedure;
  if position('''tz'', ' in v_def) > 0 then
    raise notice 'hr_l3_16: tz already in the kiosk config'; return;
  end if;
  execute replace(v_def,
    E'    ''location_name'', v_loc);',
    E'    ''location_name'', v_loc,\n    -- the tablet renders stamped times, so it needs the zone the punches are stamped in\n    ''tz'', (select l.tz from hr.location l where l.id = d.location_id));');
end $outer$;

-- ---------------------------------------------------------------------------------
-- wrappers (TD-1) — authenticated only, anon gets nothing
-- ---------------------------------------------------------------------------------
create or replace function public.hr_kiosk_device_list(p_organization_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr'
as $$ select hr.kiosk_device_list(p_organization_id); $$;

create or replace function public.hr_kiosk_pairing_code_create(
  p_organization_id uuid, p_device_name text default null,
  p_location_id uuid default null, p_device_id uuid default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $$ select hr.kiosk_pairing_code_create(p_organization_id, p_device_name, p_location_id, p_device_id); $$;

create or replace function public.hr_kiosk_device_set_trust(
  p_device_id uuid, p_trust_state text, p_reason text)
returns jsonb language sql security definer set search_path to 'public','hr'
as $$ select hr.kiosk_device_set_trust(p_device_id, p_trust_state, p_reason); $$;

create or replace function public.hr_kiosk_device_set_capture(
  p_device_id uuid, p_require_photo boolean default null, p_require_geo boolean default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $$ select hr.kiosk_device_set_capture(p_device_id, p_require_photo, p_require_geo); $$;

revoke all on function hr.kiosk_device_list(uuid) from public, anon;
revoke all on function hr.kiosk_pairing_code_create(uuid, text, uuid, uuid) from public, anon;
revoke all on function hr.kiosk_device_set_trust(uuid, text, text) from public, anon;
revoke all on function hr.kiosk_device_set_capture(uuid, boolean, boolean) from public, anon;

revoke all on function public.hr_kiosk_device_list(uuid) from public, anon;
revoke all on function public.hr_kiosk_pairing_code_create(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.hr_kiosk_device_set_trust(uuid, text, text) from public, anon;
revoke all on function public.hr_kiosk_device_set_capture(uuid, boolean, boolean) from public, anon;

grant execute on function public.hr_kiosk_device_list(uuid) to authenticated;
grant execute on function public.hr_kiosk_pairing_code_create(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.hr_kiosk_device_set_trust(uuid, text, text) to authenticated;
grant execute on function public.hr_kiosk_device_set_capture(uuid, boolean, boolean) to authenticated;

do $$
declare v_bad text;
begin
  select string_agg(f, ', ') into v_bad from unnest(array[
    'public.hr_kiosk_device_list(uuid)',
    'public.hr_kiosk_pairing_code_create(uuid,text,uuid,uuid)',
    'public.hr_kiosk_device_set_trust(uuid,text,text)',
    'public.hr_kiosk_device_set_capture(uuid,boolean,boolean)']) f
   where to_regprocedure(f) is null
      or not has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE')
      or has_function_privilege('anon', to_regprocedure(f), 'EXECUTE');
  if v_bad is not null then
    raise exception 'hr_l3_16: device-admin door contract violated: %', v_bad;
  end if;
  if pg_get_functiondef('hr._kiosk_device_config(uuid)'::regprocedure) not like '%''tz''%' then
    raise exception 'hr_l3_16: tz did not land in the kiosk session config';
  end if;
  -- the gate must stay green with four new doors present
  select string_agg(check_key, ', ') into v_bad
    from hr.punch_write_path_conformance() where not ok;
  if v_bad is not null then
    raise exception 'hr_l3_16: the conformance gate went RED: %', v_bad;
  end if;
end $$;
