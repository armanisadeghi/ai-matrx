-- chair-step: the only DELETE removes platform.client_callable_door rows whose function signature no longer exists (a door follows its function); no data row is deleted.
-- e-sign parity v2, CONTRACT.md §4 / §6.2 / §5.5 — the phone handoff (S7.6) as a platform primitive.
--
-- platform.device_handoff_* is purpose-agnostic (law 5: the PDF scanner, ID photos and signer
-- attachments want the same handoff); e-sign is its first consumer (purpose 'esign.signature').
-- The secret (32 CSPRNG bytes, base64url) exists only in the start answer; the row keeps its
-- SHA-256. The phone never touches the signing session (A-F2). A new start cancels only a
-- 'waiting' handoff, never an 'opened' one (A-R5).

-- ─── the primitive (server-only; consumers wrap it) ─────────────────────────────

create or replace function platform.device_handoff_start(
  p_purpose text, p_organization_id uuid, p_subject_type text, p_subject_id uuid,
  p_envelope_id uuid, p_target text, p_ttl_minutes integer, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_secret text; v_id uuid; v_exp timestamptz;
begin
  if p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'organization_required');
  end if;
  -- A fresh start replaces a code nobody has scanned yet; a phone already holding its page keeps it.
  update platform.device_handoff
     set status = 'cancelled', updated_at = now()
   where purpose = p_purpose and subject_id is not distinct from p_subject_id
     and target is not distinct from p_target and status = 'waiting';
  v_secret := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_exp := now() + make_interval(mins => greatest(coalesce(p_ttl_minutes, 10), 1));
  insert into platform.device_handoff (organization_id, purpose, subject_type, subject_id, envelope_id,
                                       target, secret_hash, status, expires_at)
  values (p_organization_id, p_purpose, p_subject_type, p_subject_id, p_envelope_id, p_target,
          encode(extensions.digest(v_secret, 'sha256'), 'hex'), 'waiting', v_exp)
  returning id into v_id;
  return jsonb_build_object('granted', true, 'handoff_id', v_id, 'secret', v_secret, 'expires_at', v_exp,
                            'path', p_path || '#h=' || v_secret);
end $$;

create or replace function platform._device_handoff_live(p_status text, p_expires_at timestamptz)
returns boolean language sql immutable set search_path = '' as $$
  select p_status in ('waiting', 'opened') and p_expires_at > now()
$$;

create or replace function platform.device_handoff_text(
  p_handoff_id uuid, p_subject_id uuid, p_secret text, p_phone text, p_ip inet,
  p_per_subject integer, p_per_ip_per_day integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h platform.device_handoff%rowtype; v_last4 text; v_by_subject int; v_by_ip int;
begin
  select * into h from platform.device_handoff where id = p_handoff_id for update;
  if not found or h.subject_id is distinct from p_subject_id then
    return jsonb_build_object('granted', false, 'reason', 'handoff_not_yours');
  end if;
  if h.secret_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
     or not platform._device_handoff_live(h.status, h.expires_at) then
    return jsonb_build_object('granted', false, 'reason', 'handoff_not_live');
  end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('granted', false, 'reason', 'phone_invalid');
  end if;
  select coalesce(sum(texts_sent), 0) into v_by_subject
    from platform.device_handoff where purpose = h.purpose and subject_id = h.subject_id;
  select count(*) into v_by_ip
    from platform.device_handoff d, jsonb_array_elements(coalesce(d.metadata -> 'texts', '[]'::jsonb)) t
   where p_ip is not null and t ->> 'ip' = host(p_ip) and (t ->> 'at')::timestamptz > now() - interval '1 day';
  if v_by_subject >= coalesce(p_per_subject, 3) or v_by_ip >= coalesce(p_per_ip_per_day, 10) then
    return jsonb_build_object('granted', false, 'reason', 'handoff_text_limit');
  end if;
  v_last4 := right(p_phone, 4);
  update platform.device_handoff
     set texts_sent = texts_sent + 1, phone_last4 = v_last4, updated_at = now(),
         metadata = jsonb_set(metadata, '{texts}', coalesce(metadata -> 'texts', '[]'::jsonb)
                      || jsonb_build_array(jsonb_build_object('at', now(), 'ip', host(p_ip), 'last4', v_last4)))
   where id = h.id;
  return jsonb_build_object('granted', true, 'last4', v_last4,
                            'minutes', greatest(ceil(extract(epoch from (h.expires_at - now())) / 60), 1)::int);
end $$;

create or replace function platform.device_handoff_status(p_handoff_id uuid, p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h platform.device_handoff%rowtype;
begin
  select * into h from platform.device_handoff where id = p_handoff_id;
  if not found or h.subject_id is distinct from p_subject_id then
    return jsonb_build_object('granted', false, 'reason', 'handoff_not_yours');
  end if;
  if h.status in ('waiting', 'opened') and h.expires_at <= now() then
    update platform.device_handoff set status = 'expired', updated_at = now() where id = h.id;
    h.status := 'expired';
  end if;
  return jsonb_build_object('granted', true, 'handoff_id', h.id, 'status', h.status, 'target', h.target,
                            'method', h.method, 'result_file_id', h.result_file_id,
                            'phone_last4', h.phone_last4, 'expires_at', h.expires_at);
end $$;

create or replace function platform.device_handoff_cancel(p_handoff_id uuid, p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update platform.device_handoff set status = 'cancelled', updated_at = now()
   where id = p_handoff_id and subject_id is not distinct from p_subject_id and status in ('waiting', 'opened');
  return jsonb_build_object('granted', true);
end $$;

-- The phone's two calls: the secret is the whole credential (service role, through aidream).
create or replace function platform.device_handoff_open(p_secret text, p_ip inet, p_ua text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h platform.device_handoff%rowtype;
begin
  select * into h from platform.device_handoff
   where secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') for update;
  if not found or not platform._device_handoff_live(h.status, h.expires_at) then
    return jsonb_build_object('ok', false);
  end if;
  update platform.device_handoff
     set status = 'opened', opened_at = coalesce(opened_at, now()), ip = p_ip, user_agent = left(p_ua, 500),
         updated_at = now()
   where id = h.id;
  return jsonb_build_object('ok', true, 'handoff_id', h.id, 'purpose', h.purpose, 'subject_type', h.subject_type,
                            'subject_id', h.subject_id, 'envelope_id', h.envelope_id, 'target', h.target,
                            'organization_id', h.organization_id, 'expires_at', h.expires_at);
end $$;

create or replace function platform.device_handoff_complete(
  p_secret text, p_image_file_id uuid, p_method text, p_strokes jsonb, p_ip inet, p_ua text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h platform.device_handoff%rowtype;
begin
  select * into h from platform.device_handoff
   where secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') for update;
  if not found or not platform._device_handoff_live(h.status, h.expires_at) then
    return jsonb_build_object('ok', false);
  end if;
  if p_method not in ('drawn', 'uploaded') or p_image_file_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  update platform.device_handoff
     set status = 'completed', completed_at = now(), result_file_id = p_image_file_id, method = p_method,
         strokes = p_strokes, ip = coalesce(p_ip, ip), user_agent = coalesce(left(p_ua, 500), user_agent),
         updated_at = now()
   where id = h.id;
  return jsonb_build_object('ok', true, 'handoff_id', h.id, 'purpose', h.purpose, 'subject_id', h.subject_id,
                            'envelope_id', h.envelope_id, 'target', h.target, 'phone_last4', h.phone_last4);
end $$;

-- ─── e-sign, the first consumer ─────────────────────────────────────────────────

create or replace function esign._act_handoff_start(p_ctx jsonb, p_target text)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; v_target text; v_h jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  v_target := coalesce(nullif(p_target, ''), 'signature');
  if v_target not in ('signature', 'initials') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_target');
  end if;
  if not coalesce((e.config_snapshot ->> 'allow_phone')::boolean,
                  (esign.config_resolve(e.organization_id, 'esign.signature.allow_phone') #>> '{}')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'phone_not_allowed');
  end if;
  v_h := platform.device_handoff_start('esign.signature', e.organization_id, 'esign_envelope_signer', s.id, e.id,
           v_target, (esign.config_resolve(e.organization_id, 'esign.signature.handoff_ttl_minutes') #>> '{}')::int,
           '/x/sign/phone');
  if not (v_h ->> 'granted')::boolean then return v_h; end if;
  perform esign._arm();
  perform esign._event(e.id, 'signature_handoff_started', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label', p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('target', v_target, 'handoff_id', v_h ->> 'handoff_id'));
  perform esign._disarm();
  return v_h;
end $$;

create or replace function esign._act_handoff_text(p_ctx jsonb, p_handoff_id uuid, p_secret text, p_phone text)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare s esign.envelope_signer%rowtype; v jsonb; v_org text;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  v := platform.device_handoff_text(p_handoff_id, s.id, p_secret, regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'),
         (p_ctx ->> 'ip')::inet,
         (esign.config_resolve(s.organization_id, 'esign.signature.handoff_texts_per_signer') #>> '{}')::int,
         (esign.config_resolve(s.organization_id, 'esign.signature.handoff_texts_per_ip_per_day') #>> '{}')::int);
  if not (v ->> 'granted')::boolean then return v; end if;
  select o.name into v_org
    from iam.organizations o where o.id = s.organization_id;
  -- aidream queues the SMS (esign.signature_handoff) with these facts and the link it holds.
  return v || jsonb_build_object('organization_id', s.organization_id, 'envelope_id', s.envelope_id,
                                 'signer_id', s.id, 'employer_short_name', coalesce(v_org, 'AI Matrx'));
end $$;

create or replace function esign._act_handoff_status(p_ctx jsonb, p_handoff_id uuid)
returns jsonb language sql security definer set search_path = 'esign', 'public' as $$
  select platform.device_handoff_status(p_handoff_id, (p_ctx ->> 'signer_id')::uuid)
$$;

create or replace function esign._act_handoff_cancel(p_ctx jsonb, p_handoff_id uuid)
returns jsonb language sql security definer set search_path = 'esign', 'public' as $$
  select platform.device_handoff_cancel(p_handoff_id, (p_ctx ->> 'signer_id')::uuid)
$$;

-- Door pairs (§6.2): signed-in seat and outsider seat, both checked as 'sign'.
create or replace function esign.esign_sign_handoff_start(p_signer_id uuid, p_target text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_handoff_start(c, p_target);
end $$;

create or replace function esign.esign_signer_handoff_start(p_session text, p_target text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_handoff_start(c, p_target);
end $$;

create or replace function esign.esign_sign_handoff_text(p_signer_id uuid, p_handoff_id uuid, p_secret text, p_phone text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_handoff_text(c, p_handoff_id, p_secret, p_phone);
end $$;

create or replace function esign.esign_signer_handoff_text(p_session text, p_handoff_id uuid, p_secret text, p_phone text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_handoff_text(c, p_handoff_id, p_secret, p_phone);
end $$;

create or replace function esign.esign_sign_handoff_status(p_signer_id uuid, p_handoff_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_handoff_status(c, p_handoff_id);
end $$;

create or replace function esign.esign_signer_handoff_status(p_session text, p_handoff_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_handoff_status(c, p_handoff_id);
end $$;

create or replace function esign.esign_sign_handoff_cancel(p_signer_id uuid, p_handoff_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_handoff_cancel(c, p_handoff_id);
end $$;

create or replace function esign.esign_signer_handoff_cancel(p_session text, p_handoff_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_handoff_cancel(c, p_handoff_id);
end $$;

-- The phone page (§4 steps 3–4): open answers who is asking; complete records the mark.
create or replace function esign.handoff_phone_open(p_secret text, p_ip inet, p_ua text)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare v jsonb; s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_sender jsonb; v_org text;
begin
  v := platform.device_handoff_open(p_secret, p_ip, p_ua);
  if not (v ->> 'ok')::boolean or v ->> 'purpose' <> 'esign.signature' then
    return jsonb_build_object('ok', false);
  end if;
  select * into s from esign.envelope_signer where id = (v ->> 'subject_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  if e.status not in ('sent', 'in_progress') then
    return jsonb_build_object('ok', false);
  end if;
  v_sender := esign.envelope_sender(e.id);
  select name into v_org from iam.organizations where id = e.organization_id;
  return jsonb_build_object('ok', true, 'handoff_id', v ->> 'handoff_id', 'target', v ->> 'target',
           'first_name', split_part(btrim(s.full_name), ' ', 1),
           'sender_name', coalesce(v_sender ->> 'name', v_org, 'AI Matrx'),
           'organization_name', coalesce(v_org, ''), 'expires_at', v ->> 'expires_at',
           'allowed', jsonb_build_object('drawn', coalesce((e.config_snapshot ->> 'allow_drawn')::boolean, true),
                                         'uploaded', coalesce((e.config_snapshot ->> 'allow_uploaded')::boolean, true)),
           -- for aidream only (the browser answer drops them): where the image is filed
           'owner_id', e.created_by, 'organization_id', e.organization_id, 'envelope_id', e.id);
end $$;

create or replace function esign.handoff_phone_complete(
  p_secret text, p_image_file_id uuid, p_method text, p_strokes jsonb, p_ip inet, p_ua text)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare v jsonb; s esign.envelope_signer%rowtype;
begin
  v := platform.device_handoff_complete(p_secret, p_image_file_id, p_method, p_strokes, p_ip, p_ua);
  if not (v ->> 'ok')::boolean then return v; end if;
  select * into s from esign.envelope_signer where id = (v ->> 'subject_id')::uuid;
  perform esign._arm();
  perform esign._event(s.envelope_id, 'signature_handoff_completed',
                       case when s.actor_type = 'internal_user' then 'employee' else 'external_signer' end,
                       p_signer_id => s.id, p_actor_label => s.full_name || ' <' || s.email || '> (phone)',
                       p_auth_method => 'device_handoff', p_ip => p_ip, p_user_agent => left(p_ua, 500),
                       p_payload => jsonb_build_object('target', v ->> 'target', 'method', p_method,
                                                       'phone_last4', v ->> 'phone_last4',
                                                       'handoff_id', v ->> 'handoff_id'));
  perform esign._disarm();
  return jsonb_build_object('ok', true);
end $$;

-- ═══ DOORS (generated) ═══

-- Every new SECURITY DEFINER function declares who may call it (§5.8; provision_shape_guard).
delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('platform','device_handoff_start'),
  ('platform','_device_handoff_live'),
  ('platform','device_handoff_text'),
  ('platform','device_handoff_status'),
  ('platform','device_handoff_cancel'),
  ('platform','device_handoff_open'),
  ('platform','device_handoff_complete'),
  ('esign','_act_handoff_start'),
  ('esign','_act_handoff_text'),
  ('esign','_act_handoff_status'),
  ('esign','_act_handoff_cancel'),
  ('esign','esign_signer_handoff_start'),
  ('esign','esign_signer_handoff_text'),
  ('esign','esign_signer_handoff_status'),
  ('esign','esign_signer_handoff_cancel'),
  ('esign','handoff_phone_open'),
  ('esign','handoff_phone_complete'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal e-sign step; every id argument is a row the calling door already authorised.', 'esign_parity_07_phone_handoff_doors',
       'server_only: e-sign phone handoff internals and outsider/phone doors are reached only through aidream (service role)', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('platform','device_handoff_start'),
  ('platform','_device_handoff_live'),
  ('platform','device_handoff_text'),
  ('platform','device_handoff_status'),
  ('platform','device_handoff_cancel'),
  ('platform','device_handoff_open'),
  ('platform','device_handoff_complete'),
  ('esign','_act_handoff_start'),
  ('esign','_act_handoff_text'),
  ('esign','_act_handoff_status'),
  ('esign','_act_handoff_cancel'),
  ('esign','esign_signer_handoff_start'),
  ('esign','esign_signer_handoff_text'),
  ('esign','esign_signer_handoff_status'),
  ('esign','esign_signer_handoff_cancel'),
  ('esign','handoff_phone_open'),
  ('esign','handoff_phone_complete'))
   and p.prosecdef
on conflict do nothing;

delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('esign','esign_sign_handoff_start'),
  ('esign','esign_sign_handoff_text'),
  ('esign','esign_sign_handoff_status'),
  ('esign','esign_sign_handoff_cancel'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, anonymous_purpose, argument_rules)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Signed-in door; every id argument is checked against the callers own access inside the function (CONTRACT.md v2 §6).', 'esign_parity_07_phone_handoff_doors', null, true, false,
       null,
       jsonb_build_object('version', 1, 'arguments', coalesce((
         select jsonb_object_agg(a.nm, jsonb_build_object(
                  'type', format_type(a.ty, null), 'position', a.pos,
                  'optional', a.pos > p.pronargs - p.pronargdefaults,
                  'foreign', case when format_type(a.ty, null) in ('uuid', 'uuid[]')
                                  then jsonb_build_object('bounded', true, 'note', case a.nm
                                    when 'p_signer_id' then 'esign._ctx_internal refuses any signer row whose user is not auth.uid() before any read or write.'
                                    when 'p_image_file_id' then 'Stored as a pointer on the caller''s own signer row only; nothing is read from it or returned.'
                                    when 'p_document_id' then 'Matched to a document on the caller''s own envelope before any read.'
                                    when 'p_organization_id' then 'esign.may_send_in refuses an organization the caller is not a member of.'
                                    else 'Checked against the caller''s own access inside the function before any read or write.' end)
                                  else jsonb_build_object('not_an_id', true) end))
           from unnest(p.proargnames[1:p.pronargs], p.proargtypes::oid[]) with ordinality a(nm, ty, pos)), '{}'::jsonb))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('esign','esign_sign_handoff_start'),
  ('esign','esign_sign_handoff_text'),
  ('esign','esign_sign_handoff_status'),
  ('esign','esign_sign_handoff_cancel'))
on conflict do nothing;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_handoff_start' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_handoff_text' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_handoff_status' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_handoff_cancel' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
