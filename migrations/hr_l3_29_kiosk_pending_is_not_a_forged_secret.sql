-- HR domain L3 — migration 29 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 ROUND-3 BLOCKER R1: EVERY CORRECTLY-PAIRED KIOSK DESTROYED ITS OWN SECRET IN THE APPROVAL GAP.
--
-- `hr_kiosk_authenticate` answered a device presenting the CORRECT secret while `trust_state =
-- 'pending'` with the same uniform `device_not_authenticated` it gives a forged secret. The client
-- treats secret-invalid as fatal and discards the stored secret - correctly, per its own contract.
-- But the product's instruction is PAIR THEN APPROVE, so between `hr_kiosk_claim_pairing` (which
-- mints the secret at `trust_state='pending'`) and an administrator marking the device trusted,
-- every tablet that did exactly what it was told threw away the one secret it can never be issued
-- again. The orphan `pending` device rows in the sandbox are that bug's wreckage, not test litter.
--
-- The verifier proved it by falsification: capture the secret, replay it - refused while pending,
-- full session once trusted. Same secret, same call, two answers. So the refusal was never about
-- the secret, and saying "not authenticated" about a device that just authenticated is simply false.
--
-- THE FIX: the uniform refusal is for callers who have NOT proved possession of the secret. Once
-- possession is proved, the trust state is not a secret from them - they already hold the strongest
-- credential the device has, and an administrator's approval status leaks nothing further.
--   * unknown device id, null/placeholder hash, or WRONG secret  -> `device_not_authenticated`,
--     byte-identical to today. The anti-enumeration property is untouched.
--   * CORRECT secret + `pending`   -> `device_pending_approval` + `trust_state` + `server_time`.
--   * CORRECT secret + suspended/revoked -> `device_not_trusted` + `trust_state` + `server_time`,
--     matching the vocabulary `hr_kiosk_session_heartbeat` already uses, so the two doors answer
--     the same question the same way and a client needs one branch, not two.
--
-- 🚨 A CORRECT SECRET ON A PENDING DEVICE NOW TOUCHES `last_seen_at`. An administrator approving
-- devices needs to see which tablet is powered on and waiting; a device stuck invisible in the
-- approval queue is how the gap goes unnoticed in the first place.
--
-- 🚨 AND AN UNPAIRED DEVICE NO LONGER RAISES. `hr.kiosk_pairing_code_create` writes the placeholder
-- `device_secret_hash = '!unpaired'`, which is not a bcrypt digest; `extensions.crypt(secret,
-- '!unpaired')` errors rather than returning false, so authenticating against a never-claimed device
-- id threw a 500 instead of refusing. The hash is now shape-checked before it is used as a salt -
-- a malformed hash takes the uniform refusal, like any other caller who cannot prove possession.
--
-- Applied live as `hr_l3_29_kiosk_pending_is_not_a_forged_secret`. Idempotent.

create or replace function public.hr_kiosk_authenticate(p_device_id uuid, p_device_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare d hr.kiosk_device%rowtype; v_ttl int; v_tok text; v_sid uuid; v_cfg jsonb; v_exp timestamptz;
begin
  select * into d from hr.kiosk_device where id = p_device_id and deleted_at is null;

  -- ── NOT PROVEN: unknown device, unpaired placeholder, malformed hash, or wrong secret.
  -- One answer for all four. A caller who cannot prove possession learns nothing, including
  -- whether the device id exists at all.
  if not found
     or d.device_secret_hash is null
     or d.device_secret_hash not like '$2%'            -- '!unpaired' is not a bcrypt salt
     or d.device_secret_hash <> extensions.crypt(coalesce(p_device_secret,''), d.device_secret_hash) then
    return jsonb_build_object('ok', false, 'reason', 'device_not_authenticated');
  end if;

  -- ── PROVEN. From here the caller holds the device's own secret, so the trust state is not
  -- a secret from them. R1: answering `device_not_authenticated` here made every correctly-paired
  -- tablet discard the secret it can never be issued again.
  if d.trust_state <> 'trusted' then
    perform hr.arm_write();
    update hr.kiosk_device set last_seen_at = now() where id = d.id;
    return jsonb_build_object(
      'ok', false,
      'reason', case when d.trust_state = 'pending'
                     then 'device_pending_approval' else 'device_not_trusted' end,
      'trust_state', d.trust_state,
      'server_time', now(),
      'message', case when d.trust_state = 'pending'
        then 'This tablet is paired and waiting for an administrator to approve it. Keep it on this screen.'
        else 'This tablet''s access has been withdrawn. Ask an administrator.' end);
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

  return jsonb_build_object('ok', true, 'session_token', v_tok, 'kiosk_session_id', v_sid,
                            'expires_at', v_exp,
                            'location_id', d.location_id,
                            'server_time', now(),
                            'trust_state', d.trust_state,
                            'config_version', v_cfg ->> 'config_version',
                            'config', v_cfg -> 'config');
end
$function$;

revoke all on function public.hr_kiosk_authenticate(uuid, text) from public;
grant execute on function public.hr_kiosk_authenticate(uuid, text) to anon, authenticated;

-- the heartbeat already distinguished trusted from not, but lumped `pending` in with revoked.
-- Same vocabulary, so a client branches once.
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'public.hr_kiosk_session_heartbeat(text)'::regprocedure;
  if position('device_pending_approval' in v_def) > 0 then
    raise notice 'hr_l3_29: heartbeat already distinguishes pending'; return;
  end if;
  if position('''reason'',''device_not_trusted''' in v_def) = 0 then
    raise exception 'hr_l3_29: the heartbeat refusal was not in its expected shape';
  end if;
  execute replace(v_def,
    '''reason'',''device_not_trusted''',
    '''reason'', case when coalesce(d.trust_state,''revoked'') = ''pending''' ||
    ' then ''device_pending_approval'' else ''device_not_trusted'' end');
end $outer$;

do $$
declare v_a text; v_h text;
begin
  v_a := pg_get_functiondef('public.hr_kiosk_authenticate(uuid,text)'::regprocedure);
  v_h := pg_get_functiondef('public.hr_kiosk_session_heartbeat(text)'::regprocedure);
  if v_a not like '%device_pending_approval%' then
    raise exception 'hr_l3_29: authenticate does not distinguish pending';
  end if;
  if v_a not like '%not like ''$2%%' then
    raise exception 'hr_l3_29: the bcrypt shape guard did not land';
  end if;
  -- the uniform refusal must still exist for callers who cannot prove possession
  if v_a not like '%device_not_authenticated%' then
    raise exception 'hr_l3_29: the uniform refusal was lost';
  end if;
  if v_h not like '%device_pending_approval%' then
    raise exception 'hr_l3_29: heartbeat does not distinguish pending';
  end if;
  if not has_function_privilege('anon','public.hr_kiosk_authenticate(uuid,text)','EXECUTE') then
    raise exception 'hr_l3_29: authenticate lost its anon grant';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) > 0 then
    raise exception 'hr_l3_29: the conformance gate went RED';
  end if;
end $$;
