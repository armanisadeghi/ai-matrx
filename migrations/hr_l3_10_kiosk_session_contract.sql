-- HR domain L3 — migration 10 (register item HRB-015, lane L3 punch + kiosk).
-- Full header and RECORDED TECHNICAL DECISIONS live in
-- matrx-frontend/migrations/hr_l3_10_kiosk_session_contract.sql.
--
-- 🚨 THE KIOSK WAS BRICKED AS SHIPPED. `hr_kiosk_authenticate` returned no server clock and no
-- config, so a tablet could not compute skew AT ALL and `kiosk_max_clock_skew_seconds` was
-- unenforceable. `hr_kiosk_session_heartbeat` returned no trust_state, no server time and no config
-- version, so revocation was NOT observable within one interval - which is the only reason the call
-- exists, and is acceptance target T-1.
-- Both functions came from Core C3; this extension is ADDITIVE (no existing key changes meaning)
-- and it is L3's to make because L3 is the consumer SPEC-TIME 1.2 wrote them for.
-- Applied live as `hr_l3_10_kiosk_session_contract`. Idempotent.

-- ONE resolver of the effective punch config, so the tablet enforces exactly what the server does.
create or replace function hr._kiosk_device_config(p_device_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare d hr.kiosk_device%rowtype; v_loc text; v_cfg jsonb;
begin
  select * into d from hr.kiosk_device where id = p_device_id and deleted_at is null;
  if not found then return null; end if;
  select l.name into v_loc from hr.location l where l.id = d.location_id;

  v_cfg := jsonb_build_object(
    'require_photo', d.require_photo,
    'require_geo',   d.require_geo,
    -- the SAME expression hr.punch_record enforces, so the tablet cannot pre-flight a punch the
    -- server would refuse (or fail to pre-flight one the server would accept)
    'max_clock_skew_seconds', greatest(
        d.max_clock_skew_seconds,
        (hr._punch_knob('kiosk_max_clock_skew_seconds', '300'::jsonb) #>> '{}')::integer),
    'pin_length',              (hr._punch_knob('kiosk_pin_length', '4'::jsonb) #>> '{}')::integer,
    'confirm_dismiss_seconds', (hr._punch_knob('kiosk_confirm_dismiss_seconds', '5'::jsonb) #>> '{}')::integer,
    'heartbeat_seconds',       (hr._punch_knob('kiosk_heartbeat_seconds', '60'::jsonb) #>> '{}')::integer,
    'location_name', v_loc);

  return jsonb_build_object(
    'config', v_cfg,
    -- deterministic: it changes if and only if the config changes, so a tablet can compare it
    -- across heartbeats without the server keeping any per-device version counter.
    'config_version', md5(v_cfg::text),
    'trust_state', d.trust_state,
    'location_id', d.location_id);
end
$$;

comment on function hr._kiosk_device_config(uuid) is
  'L3: the ONE resolver of a kiosk device effective punch config + a deterministic config_version. Consumed by hr_kiosk_authenticate and hr_kiosk_session_heartbeat so the two can never drift.';

-- ---------------------------------------------------------------------------------
-- hr_kiosk_authenticate: ADD the server clock, the config and the trust state.
-- Every pre-existing key keeps its name and meaning.
-- ---------------------------------------------------------------------------------
create or replace function public.hr_kiosk_authenticate(p_device_id uuid, p_device_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare d hr.kiosk_device%rowtype; v_ttl int; v_tok text; v_sid uuid; v_cfg jsonb; v_exp timestamptz;
begin
  select * into d from hr.kiosk_device where id = p_device_id and deleted_at is null;
  -- uniform failure: a wrong device id and a wrong secret are indistinguishable to the caller
  if not found or d.trust_state <> 'trusted'
     or d.device_secret_hash is null
     or d.device_secret_hash <> extensions.crypt(coalesce(p_device_secret,''), d.device_secret_hash) then
    return jsonb_build_object('ok', false, 'reason','device_not_authenticated');
  end if;

  v_ttl := (hr._knob('hr.time_and_attendance','kiosk_session_ttl_hours') #>> '{}')::integer;
  v_tok := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(hours => v_ttl);

  perform hr.arm_write();
  insert into hr.kiosk_session
    (organization_id, kiosk_device_id, session_token_hash, auth_method, expires_at)
  values (d.organization_id, d.id, encode(extensions.digest(v_tok,'sha256'),'hex'), 'device', v_exp)
  returning id into v_sid;
  update hr.kiosk_device set last_seen_at = now() where id = d.id;

  v_cfg := hr._kiosk_device_config(d.id);

  -- the session token is returned exactly once; only its hash is stored
  return jsonb_build_object('ok', true, 'session_token', v_tok, 'kiosk_session_id', v_sid,
                            'expires_at', v_exp,
                            'location_id', d.location_id,
                            -- 🚨 SPEC-TIME 1.2: the server clock, for skew computation
                            'server_time', now(),
                            'trust_state', d.trust_state,
                            'config_version', v_cfg ->> 'config_version',
                            'config', v_cfg -> 'config');
end
$function$;

revoke all on function public.hr_kiosk_authenticate(uuid, text) from public;
grant execute on function public.hr_kiosk_authenticate(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------
-- hr_kiosk_session_heartbeat: trust_state + server time + config version, AND it is the
-- door through which revocation becomes observable within one interval (T-1).
-- ---------------------------------------------------------------------------------
create or replace function public.hr_kiosk_session_heartbeat(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare s hr.kiosk_session%rowtype; d hr.kiosk_device%rowtype; v_cfg jsonb;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found or s.expires_at <= now() then
    -- server_time is returned even on the failure path: a bricking tablet still needs a clock to
    -- render "as of" on its full-screen message.
    return jsonb_build_object('ok', false, 'reason','session_not_valid', 'server_time', now());
  end if;

  select * into d from hr.kiosk_device where id = s.kiosk_device_id and deleted_at is null;

  -- 🚨 REVOCATION IS OBSERVABLE HERE, WITHIN ONE INTERVAL. suspended/revoked/pending ends the
  -- session server-side as well as telling the tablet, so a device that stops heartbeating cannot
  -- keep punching on a session nobody can see.
  if d.id is null or d.trust_state <> 'trusted' then
    perform hr.arm_write();
    update hr.kiosk_session
       set ended_at = now(),
           end_reason = case when coalesce(d.trust_state,'revoked') = 'suspended'
                             then 'device_suspended' else 'revoked' end
     where id = s.id and ended_at is null;
    return jsonb_build_object('ok', false, 'reason','device_not_trusted',
                              'trust_state', coalesce(d.trust_state, 'revoked'),
                              'server_time', now());
  end if;

  perform hr.arm_write();
  update hr.kiosk_device set last_seen_at = now() where id = d.id;

  v_cfg := hr._kiosk_device_config(d.id);

  return jsonb_build_object('ok', true, 'kiosk_session_id', s.id, 'expires_at', s.expires_at,
                            'employment_id', s.employment_id,
                            'trust_state', d.trust_state,
                            'server_time', now(),
                            'config_version', v_cfg ->> 'config_version',
                            'config', v_cfg -> 'config');
end
$function$;

revoke all on function public.hr_kiosk_session_heartbeat(text) from public;
grant execute on function public.hr_kiosk_session_heartbeat(text) to anon, authenticated;

-- Make hr.punch_record enforce the SAME skew ceiling the config advertises, so the two cannot drift.
do $outer$
declare v_def text; v_new text;
  v_from constant text :=
'    if abs(v_skew) > greatest(v_dev.max_clock_skew_seconds,
                              (hr._punch_knob(''kiosk_max_clock_skew_seconds'', ''300''::jsonb) #>> ''{}'')::integer) then';
  v_to constant text :=
'    if abs(v_skew) > ((hr._kiosk_device_config(v_dev.id) #>> ''{config,max_clock_skew_seconds}'')::integer) then';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;
  if position(v_to in v_def) > 0 then
    raise notice 'hr_l3_10: punch_record already uses the shared skew ceiling';
    return;
  end if;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_10: the skew ceiling expression was not found in hr.punch_record';
  end if;
  v_new := replace(v_def, v_from, v_to);
  execute v_new;
end $outer$;

do $$
declare v_a text; v_h text;
begin
  v_a := pg_get_functiondef('public.hr_kiosk_authenticate(uuid,text)'::regprocedure);
  v_h := pg_get_functiondef('public.hr_kiosk_session_heartbeat(text)'::regprocedure);
  if v_a not like '%server_time%' or v_a not like '%config_version%' then
    raise exception 'hr_l3_10: hr_kiosk_authenticate is missing the server clock or the config version';
  end if;
  if v_h not like '%trust_state%' or v_h not like '%server_time%' or v_h not like '%config_version%' then
    raise exception 'hr_l3_10: hr_kiosk_session_heartbeat is missing trust_state / server_time / config_version';
  end if;
  if not has_function_privilege('anon','public.hr_kiosk_authenticate(uuid,text)','EXECUTE')
     or not has_function_privilege('anon','public.hr_kiosk_session_heartbeat(text)','EXECUTE') then
    raise exception 'hr_l3_10: a kiosk door lost its anon grant';
  end if;
  if pg_get_functiondef('hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure)
     not like '%_kiosk_device_config%' then
    raise exception 'hr_l3_10: hr.punch_record does not use the shared skew ceiling';
  end if;
end $$;

