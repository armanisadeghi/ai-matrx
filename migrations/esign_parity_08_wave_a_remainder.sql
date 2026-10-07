-- e-sign parity v2 — wave A remainder (CONTRACT.md §5.4, §9, §11): access code reaches the token
-- based-on: public.outsider_verify(text, text, inet) c58097019689959e32eaaa1d87935086503beb37fac88ee9774bda734d1b87f4
-- based-on: esign.materialize_draft(uuid, jsonb) 01dfab571868b444431707b7b4a4f2392e5ac337420d06fa2162fabaaeb1c9a3
-- based-on: public.esign_mint_signer_token(uuid, text) ea1a5f4c30691fd9e86863a0da3494ed1b3032cd726fdab3c9aee34690ab9d6f
-- based-on: public.outsider_send_code(text) 00e3de2a49098d4c4c1dfa7622edb1699ea8549ccb8a44ae88e5b4ca3b0217a7
-- based-on: public.outsider_session_ping(text) 7b6ad45bd17f5dc9ad07aefb0554a3a3e7a360ebe21cefe8b84466b3d6606907
-- based-on: public.esign_void_envelope(uuid, text) b7751d0365d9e33a4192685c5d2b37caa0caf06054eb4a836123484c9f3e3812
-- based-on: public.esign_resend_signer(uuid, text) 6bccfed2f50c9ce10b54debbe9d394b6ee054fcc1134f7f7d56a1a62ece24742
-- based-on: public.esign_expire_sweep(integer) 47628faf8d766d88a064d734aa38cdaed78712cd52edc1d142f4331d67b947d9
-- based-on: public.esign_my_signer_row(uuid) 570587867ea1d634922c34867e89600aa8701d7a747cd852041f8813dacd33d7
-- (stored only as its hash), outsider verify says wrong-code / locked for a LIVE link (loosening L5),
-- the session slides on activity (§5.9), void / resend / expiry move the reminder schedule, a person
-- on several rows signs the row that can act now (A-N5), and each signer row remembers its draft key.
CREATE OR REPLACE FUNCTION public.outsider_verify(p_secret text, p_code text, p_ip inet DEFAULT NULL::inet)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
declare t platform.actor_token%rowtype; c platform.outsider_consumer%rowtype;
        v_hash text; v_sess text; v_sid uuid;
begin
  v_hash := encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex');
  select * into t from platform.actor_token where token_hash = v_hash;
  if not found or not t.is_active or t.revoked_at is not null or t.expires_at <= now()
     or (t.max_uses is not null and t.use_count >= t.max_uses) then
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;
  -- Loosening L5: the link is live (outsider_begin already says so), so a locked or wrong code is
  -- named honestly instead of the dead-link sentence. Dead links keep the uniform answer above.
  if t.verification_locked_until is not null and t.verification_locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'code_locked', 'locked_until', t.verification_locked_until,
                              'message', 'Too many tries. Try again later.');
  end if;

  if t.verification_factor <> 'none' then
    if t.verification_code_hash is null or t.verification_code_expires_at <= now()
       or t.verification_code_hash <> encode(extensions.digest(coalesce(p_code,''),'sha256'),'hex') then
      update platform.actor_token
         set verification_attempts = verification_attempts + 1,
             verification_locked_until = case when verification_attempts + 1 >= 5
                                              then now() + interval '15 minutes' end
       where id = t.id;
      insert into platform.actor_token_event (organization_id, actor_token_id, event_type, ip)
      values (t.organization_id, t.id, 'verification_failed', p_ip);
      if t.verification_attempts + 1 >= 5 then
        return jsonb_build_object('ok', false, 'reason', 'code_locked', 'locked_until', now() + interval '15 minutes',
                                  'message', 'Too many tries. Try again later.');
      end if;
      return jsonb_build_object('ok', false, 'reason', 'code_wrong', 'attempts_left', 5 - (t.verification_attempts + 1),
                                'message', 'That code is not right.');
    end if;
  end if;

  select * into c from platform.outsider_consumer
   where consumer_key = t.consumer_key and resource = t.subject_type and is_subject_resource;

  -- single_session: a second session invalidates the first
  if t.single_session then
    update platform.actor_session set revoked_at = now()
     where actor_token_id = t.id and revoked_at is null;
  end if;

  v_sess := encode(extensions.gen_random_bytes(32), 'hex');
  insert into platform.actor_session
    (organization_id, actor_token_id, session_hash, expires_at, verified_at, ip)
  values (t.organization_id, t.id, encode(extensions.digest(v_sess,'sha256'),'hex'),
          now() + make_interval(mins => coalesce(c.session_ttl_minutes, 30)), now(),
          case when coalesce(c.ip_pinned,true) then p_ip end)
  returning id into v_sid;

  -- 🚨 THE USE IS CONSUMED HERE, on VERIFIED SESSION ISSUANCE — not on resolution.
  update platform.actor_token
     set use_count = use_count + 1, verification_attempts = 0, verification_locked_until = null,
         verification_code_hash = case when t.verification_factor = 'access_code' then verification_code_hash end,
         last_used_at = now(), last_used_ip = p_ip
   where id = t.id;

  insert into platform.actor_token_event (organization_id, actor_token_id, session_id, event_type, ip)
  values (t.organization_id, t.id, v_sid, 'verification_passed', p_ip),
         (t.organization_id, t.id, v_sid, 'session_issued', p_ip);

  return jsonb_build_object('ok', true, 'session', v_sess, 'session_id', v_sid,
                            'expires_at', now() + make_interval(mins => coalesce(c.session_ttl_minutes,30)));
end
$function$;

CREATE OR REPLACE FUNCTION esign.materialize_draft(p_envelope_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
-- §12.1 (service role, called by aidream's POST /esign/drafts/{id}/send after it read and hashed
-- every PDF): documents, signers and v2 field maps from the draft; the real expires_at and a
-- re-resolved snapshot (A-F7). p_payload: {documents: {<key>: {document_version, mime_type}},
-- recipients: {<key>: {actor_type, user_id}}}.
declare e esign.envelope%rowtype; d esign.envelope_draft%rowtype; c jsonb; x jsonb; v_pos int := 0;
        v_docs jsonb := '{}'::jsonb; v_signers jsonb := '{}'::jsonb; v_id uuid; v_snap jsonb; v_order text;
        v_actor text; v_factor text; v_days int; r record;
begin
  select * into e from esign.envelope where id = p_envelope_id for update;
  if not found or e.status <> 'draft' then return jsonb_build_object('granted', false, 'reason', 'not_draft'); end if;
  if exists (select 1 from esign.envelope_document where envelope_id = e.id) then
    return jsonb_build_object('granted', false, 'reason', 'already_materialized');
  end if;
  select * into d from esign.envelope_draft where envelope_id = e.id;
  c := d.composition;
  v_order := coalesce(c #>> '{settings,signing_order}', 'sequential');
  perform esign._arm();
  for x in select value from jsonb_array_elements(coalesce(c -> 'documents', '[]')) loop
    v_pos := v_pos + 1;
    insert into esign.envelope_document (organization_id, envelope_id, position, name, source_kind,
                                         document_id, document_version, field_map, render_source, mime_type)
    values (e.organization_id, e.id, v_pos, coalesce(nullif(x ->> 'name', ''), 'Document ' || v_pos), 'uploaded_file',
            (x ->> 'file_id')::uuid, coalesce((p_payload #>> array['documents', x ->> 'key', 'document_version'])::int, 1),
            '{}'::jsonb, '{}'::jsonb, coalesce(p_payload #>> array['documents', x ->> 'key', 'mime_type'], 'application/pdf'))
    returning id into v_id;
    v_docs := v_docs || jsonb_build_object(x ->> 'key', v_id);
  end loop;
  for r in select value as v from jsonb_array_elements(coalesce(c -> 'recipients', '[]'))
            order by coalesce((value ->> 'order')::int, 1) loop
    v_actor := coalesce(p_payload #>> array['recipients', r.v ->> 'key', 'actor_type'], 'external');
    v_factor := case when v_actor = 'internal_user' then null
                     when r.v ->> 'verification' = 'access_code' and esign._enforce('F1') then 'access_code'
                     when r.v ->> 'verification' in ('access_code', 'email_code') then 'email_code'
                     when r.v ->> 'verification' = 'none' then 'none'
                     else null end;   -- null: the knob's default factor at mint
    insert into esign.envelope_signer (organization_id, envelope_id, position, role, actor_type, signer_user_id,
        full_name, email, auth_method, is_required, verification_factor, company, job_title, private_message, color_index, metadata)
    values (e.organization_id, e.id,
            case when v_order = 'sequential' then coalesce((r.v ->> 'order')::int, 1) else 1 end,
            coalesce(r.v ->> 'role', 'signer'), v_actor,
            case when v_actor = 'internal_user' then nullif(p_payload #>> array['recipients', r.v ->> 'key', 'user_id'], '')::uuid end,
            btrim(r.v ->> 'full_name'), lower(btrim(r.v ->> 'email')),
            case when v_actor = 'internal_user' then 'session' else 'token_link' end,
            coalesce(r.v ->> 'role', 'signer') <> 'cc_recipient', v_factor,
            nullif(r.v ->> 'company', ''), nullif(r.v ->> 'job_title', ''), nullif(r.v ->> 'private_message', ''),
            coalesce((r.v ->> 'color_index')::int, 0),
            jsonb_build_object('recipient_key', r.v ->> 'key'))
    returning id into v_id;
    v_signers := v_signers || jsonb_build_object(r.v ->> 'key', v_id);
  end loop;
  -- FieldMapV2 per document, recipient keys resolved to signer ids (§1.3).
  for x in select value from jsonb_array_elements(coalesce(c -> 'documents', '[]')) loop
    update esign.envelope_document
       set field_map = jsonb_build_object('schema_version', 2,
             'fields', coalesce((select jsonb_agg((f - 'document_key' - 'recipient_key')
                                                  || jsonb_build_object('signer_id', v_signers ->> (f ->> 'recipient_key')))
                                   from jsonb_array_elements(coalesce(c -> 'fields', '[]')) f
                                  where f ->> 'document_key' = x ->> 'key' and v_signers ? (f ->> 'recipient_key')), '[]'::jsonb),
             'groups', coalesce((select jsonb_agg((g - 'document_key' - 'recipient_key')
                                                  || jsonb_build_object('signer_id', v_signers ->> (g ->> 'recipient_key')))
                                   from jsonb_array_elements(coalesce(c -> 'groups', '[]')) g
                                  where g ->> 'document_key' = x ->> 'key' and v_signers ? (g ->> 'recipient_key')), '[]'::jsonb))
     where id = (v_docs ->> (x ->> 'key'))::uuid;
  end loop;
  v_days := least(greatest(coalesce((c #>> '{settings,expires_in_days}')::int, 30), 1), 365);
  v_snap := esign.resolve_config_snapshot(e.organization_id, e.sensitivity) || jsonb_strip_nulls(jsonb_build_object(
    'reminder_cadence_days', case when coalesce((c #>> '{settings,reminders,enabled}')::boolean, true)
                                  then coalesce(c #> '{settings,reminders,cadence_days}', '[]'::jsonb) else '[]'::jsonb end,
    'reminder_max_count', case when coalesce((c #>> '{settings,reminders,enabled}')::boolean, true)
                               then jsonb_array_length(coalesce(c #> '{settings,reminders,cadence_days}', '[]'::jsonb)) else 0 end,
    'expiry_warning_days', c #> '{settings,expiry_warning_days}',
    'delegation_allowed', c #> '{settings,allow_delegation}',
    'fill_all_allowed', c #> '{settings,allow_fill_all}',
    'form_view', c #> '{settings,form_view}',
    'date_format_default', c #> '{settings,date_format_default}',
    'sender_time_zone', c #> '{settings,sender_time_zone}',
    'allow_uploaded', esign.config_resolve(e.organization_id, 'esign.signature.allow_uploaded'),
    'allow_phone', esign.config_resolve(e.organization_id, 'esign.signature.allow_phone'),
    'frame_on_copy', esign.config_resolve(e.organization_id, 'esign.signature.frame_on_copy'),
    'envelope_id_on_pages', esign.config_resolve(e.organization_id, 'esign.signed_copy.envelope_id_on_pages'),
    'message_to_sender_allowed', esign.config_resolve(e.organization_id, 'esign.signer.message_to_sender')));
  update esign.envelope
     set title = coalesce(nullif(btrim(c ->> 'title'), ''), e.title), message = nullif(c ->> 'message', ''),
         email_subject = coalesce(nullif(btrim(c ->> 'email_subject'), ''), 'Please sign: ' || e.title),
         signing_order = v_order, expires_at = now() + make_interval(days => v_days),
         config_snapshot = v_snap, metadata = metadata - 'placeholder_until_send'
   where id = e.id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', e.id, 'documents', v_docs, 'signers', v_signers);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_mint_signer_token(p_signer_id uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_scope jsonb; v_mint jsonb;
        v_factor text; v_email text;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    perform platform.refuse_not_found(format('esign_mint_signer_token: signer %s does not exist', p_signer_id));
  end if;
  select * into e from esign.envelope where id = s.envelope_id;

  -- THE PERMISSION CHECK — the whole reason a per-purpose wrapper exists (§5.4 issuance side).
  if auth.uid() is not null and not esign._may_manage(e.id, 'editor') then
    return jsonb_build_object('granted', false, 'reason', 'no_permission_on_envelope');
  end if;
  if s.actor_type <> 'external' then
    return jsonb_build_object('granted', false, 'reason', 'internal_signer_uses_session',
      'detail', 'an internal signer authenticates with their platform session at /sign/e/{envelopeId} (§6.0 U-03)');
  end if;
  if e.status not in ('draft','sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;

  v_email  := lower(coalesce(p_email, s.email));
  v_factor := coalesce(s.verification_factor,
                       trim(both '"' from (e.config_snapshot -> 'verification_factor')::text),
                       'email_code');

  -- §5.3: no wildcards; every grant names a concrete registered resource plus an id or a parent_id,
  -- and every action is one the registry declares for this purpose.
  v_scope := jsonb_build_object(
    'consumer_key','esign.signer',
    'subject', jsonb_build_object('type','esign_envelope_signer','id', s.id),
    'grants', jsonb_build_array(
      jsonb_build_object('resource','esign_envelope',          'id', e.id,  'actions', jsonb_build_array('read')),
      jsonb_build_object('resource','esign_envelope_document', 'parent_id', e.id, 'actions', jsonb_build_array('read','download')),
      jsonb_build_object('resource','esign_envelope_signer',   'id', s.id, 'actions', jsonb_build_array('read','consent','sign','decline','delegate'))),
    'constraints', jsonb_build_object('expires_at', e.expires_at, 'max_uses', null, 'single_session', true));

  v_mint := platform.mint_outsider_token(
    p_consumer_key => 'esign.signer', p_subject_type => 'esign_envelope_signer',
    p_subject_id => s.id, p_scope => v_scope, p_organization_id => e.organization_id,
    p_recipient => jsonb_build_object('name', s.full_name, 'email', v_email, 'verification_target', v_email),
    p_overrides => jsonb_build_object('verification_factor', v_factor, 'expires_at', e.expires_at));

  -- Decision H: the sender's access code reaches the token as the hash the draft stored; it is reused
  -- on every visit (outsider_verify never clears it) and lives exactly as long as the link.
  if v_factor = 'access_code' then
    update platform.actor_token
       set verification_code_hash = (select d.access_code_hashes ->> (s.metadata ->> 'recipient_key')
                                       from esign.envelope_draft d where d.envelope_id = e.id),
           verification_code_expires_at = expires_at
     where id = (v_mint ->> 'actor_token_id')::uuid;
  end if;

  perform esign._arm();
  update esign.envelope_signer
     set actor_token_id = (v_mint ->> 'actor_token_id')::uuid,
         email = v_email,
         verification_factor = v_factor,
         auth_method = case v_factor when 'none' then 'token_link'
                                     when 'email_code' then 'token_link_email_code'
                                     when 'sms_code' then 'token_link_sms_code'
                                     else 'token_link_access_code' end
   where id = s.id;
  perform esign._disarm();

  return v_mint || jsonb_build_object('granted', true, 'signer_id', s.id, 'envelope_id', e.id);
end $function$;

CREATE OR REPLACE FUNCTION public.outsider_send_code(p_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
declare t platform.actor_token%rowtype; v_hash text; v_code text;
begin
  v_hash := encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex');
  select * into t from platform.actor_token where token_hash = v_hash;
  if not found or not t.is_active or t.revoked_at is not null or t.expires_at <= now() then
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;
  if t.verification_factor = 'none' then
    return jsonb_build_object('ok', true, 'no_code_required', true);
  end if;
  if t.verification_factor = 'access_code' then
    return jsonb_build_object('ok', true, 'code_required', 'access_code', 'sent', false);
  end if;
  if t.verification_locked_until is not null and t.verification_locked_until > now() then
    insert into platform.actor_token_event (organization_id, actor_token_id, event_type)
    values (t.organization_id, t.id, 'rate_limited');
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;

  -- §5.7: 6 digits, single-use, TTL 10 minutes, invalidated on issue of a new one.
  -- 1350: from the CSPRNG. `random()` is a seeded PRNG and a credential is not a dice roll.
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint
                   % 1000000))::text, 6, '0');
  update platform.actor_token
     set verification_code_hash = encode(extensions.digest(v_code,'sha256'),'hex'),
         verification_code_expires_at = now() + interval '10 minutes'
   where id = t.id;
  insert into platform.actor_token_event (organization_id, actor_token_id, event_type, detail)
  values (t.organization_id, t.id, 'verification_sent', jsonb_build_object('factor', t.verification_factor));

  -- 🚨 1350: THE CODE IS RETURNED ONLY TO THE SERVER LANE. This function is service_role-only
  -- (below): its caller is the server that puts the code on the SECOND channel. A browser that
  -- could call it would read the code off the response, and the second factor would be the
  -- first factor twice.
  return jsonb_build_object('ok', true, 'sent', true, 'code_for_delivery', v_code,
                            'verification_factor', t.verification_factor,
                            'verification_target', t.verification_target);
end
$function$;

CREATE OR REPLACE FUNCTION public.outsider_session_ping(p_session text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
declare s platform.actor_session%rowtype; v_exp timestamptz;
begin
  select * into s from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');
  if not found or s.revoked_at is not null or s.expires_at <= now() then
    if s.id is not null then
      insert into platform.actor_token_event (organization_id, actor_token_id, session_id, event_type)
      values (s.organization_id, s.actor_token_id, s.id, 'replay_rejected');
    end if;
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;
  -- §5.9: a consumer that asks for it keeps the session alive while the person works (idle TTL),
  -- never past the link's own expiry.
  select least(now() + make_interval(mins => coalesce(c.session_ttl_minutes, 30)), t.expires_at) into v_exp
    from platform.actor_token t
    join platform.outsider_consumer c on c.consumer_key = t.consumer_key and c.resource = t.subject_type
                                     and c.is_subject_resource and c.session_sliding
   where t.id = s.actor_token_id;
  if v_exp is not null and v_exp > s.expires_at then
    update platform.actor_session set expires_at = v_exp where id = s.id;
    s.expires_at := v_exp;
  end if;
  return jsonb_build_object('ok', true, 'expires_at', s.expires_at);
end
$function$;

CREATE OR REPLACE FUNCTION public.esign_void_envelope(p_envelope_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_revoked int; r record; v_told int := 0;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_void_envelope: envelope %s does not exist', p_envelope_id));
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'reason_required');
  end if;
  if e.status = 'completed' then
    -- §3.5: voiding a completed envelope is impossible; the correction path is a NEW envelope with
    -- a superseding reference.
    return jsonb_build_object('granted', false, 'reason', 'cannot_void_completed',
      'detail', 'issue a new envelope carrying superseded_by_envelope_id');
  end if;
  if e.status in ('declined','voided','expired') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;

  perform esign._arm();
  update esign.envelope set status = 'voided', voided_at = now(), void_reason = p_reason
   where id = p_envelope_id;
  v_revoked := esign._revoke_open_tokens(p_envelope_id, 'envelope voided');
  perform esign._event(p_envelope_id, 'voided', esign._requester_actor_type(e.consumer_key),
                       p_actor_user_id => auth.uid(),
                       p_actor_label => 'requester',
                       p_payload => jsonb_build_object('reason', p_reason, 'tokens_revoked', v_revoked));
  perform esign._cancel_scheduled_notices(p_envelope_id, null);
  -- D11.2: everyone who was asked and has not finished hears that the link is dead.
  for r in select id, signer_user_id, email from esign.envelope_signer
            where envelope_id = p_envelope_id and last_notified_at is not null and role <> 'cc_recipient'
              and status not in ('signed', 'acknowledged', 'declined', 'delegated', 'expired') loop
    perform esign._notify(p_envelope_id, 'esign.voided_for_signer', r.id, p_to_user => r.signer_user_id,
                          p_to_address => r.email, p_subject => 'Cancelled: ' || coalesce(e.title, ''));
    v_told := v_told + 1;
  end loop;
  perform esign._notify(p_envelope_id, 'esign.voided',
                        p_to_user => e.created_by, p_to_address => null,
                        p_subject => 'Signature request voided: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('reason', p_reason));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', p_envelope_id, 'status', 'voided',
                            'tokens_revoked', v_revoked, 'signers_told', v_told);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_resend_signer(p_signer_id uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_new_addr boolean; v_tok jsonb;
        v_link text; v_old uuid;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    perform platform.refuse_not_found(format('esign_resend_signer: signer %s does not exist', p_signer_id));
  end if;
  select * into e from esign.envelope where id = s.envelope_id;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;
  if not (esign._can_act(s.id) ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', esign._can_act(s.id) ->> 'reason');
  end if;

  v_new_addr := p_email is not null and lower(p_email) is distinct from s.email;
  perform esign._arm();
  if s.actor_type = 'external' and (v_new_addr or s.actor_token_id is null) then
    -- §3.5: the addressee changed, so the old token dies and a new one is minted — the evidence
    -- must show WHICH ADDRESS received WHICH LINK. Same address ⇒ the existing token is reused, so
    -- an already-opened link keeps working.
    v_old := s.actor_token_id;
    if v_old is not null then
      perform platform.revoke_outsider_token(v_old, 'signer email corrected on resend');
      update esign.envelope_signer set actor_token_id = null where id = s.id;
    end if;
    v_tok := public.esign_mint_signer_token(s.id, coalesce(p_email, s.email));
    if not coalesce((v_tok ->> 'granted')::boolean, false) then
      perform esign._disarm();
      return v_tok;
    end if;
    v_link := '/x/sign#t=' || (v_tok ->> 'secret');
  end if;

  perform esign._notify(s.envelope_id, 'esign.signature_requested', s.id,
                        p_to_user => s.signer_user_id,
                        p_to_address => lower(coalesce(p_email, s.email)),
                        p_actor_token_id => coalesce((v_tok ->> 'actor_token_id')::uuid, s.actor_token_id),
                        p_subject => coalesce(e.title,'Signature requested'), p_deep_link => v_link);
  update esign.envelope_signer
     set last_notified_at = now(), notify_attempts = notify_attempts + 1,
         status = case when status = 'delivery_failed' then 'notified' else status end,
         delivery_error = null
   where id = s.id;
  -- §9: the reminder schedule restarts from this notice, carrying the link it just sent.
  perform esign._schedule_signer_notices(s.id, v_link);
  perform esign._event(s.envelope_id, 'resent', esign._requester_actor_type(e.consumer_key),
                       p_signer_id => s.id, p_actor_user_id => auth.uid(),
                       p_payload => jsonb_build_object('address_changed', v_new_addr,
                                                       'token_reissued', v_tok is not null,
                                                       'revoked_token_id', v_old));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'address_changed', v_new_addr,
                            'token_reissued', v_tok is not null);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_expire_sweep(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare r record; v_n int := 0; v_tokens int := 0;
begin
  -- The sweep crosses every organization, so it is the scheduler's call and platform staff's, not
  -- an ordinary member's. It can only move rows that are ALREADY past their frozen expiry.
  if auth.uid() is not null and not public.is_platform_admin() then
    return jsonb_build_object('granted', false, 'reason', 'platform_admin_only');
  end if;
  perform esign._arm();
  for r in select id, organization_id, created_by, title from esign.envelope
            where status in ('sent','in_progress') and expires_at <= now() and deleted_at is null
            order by expires_at limit p_limit loop
    update esign.envelope set status = 'expired' where id = r.id;
    update esign.envelope_signer set status = 'expired'
     where envelope_id = r.id and status not in ('signed','declined','delegated');
    v_tokens := v_tokens + esign._revoke_open_tokens(r.id, 'envelope expired');
    perform esign._cancel_scheduled_notices(r.id, null);
    perform esign._event(r.id, 'expired', 'automation',
                         p_payload => jsonb_build_object('swept_at', now()));
    perform esign._notify(r.id, 'esign.expired', p_to_user => r.created_by,
                          p_subject => 'Signature request expired: ' || coalesce(r.title,''));
    v_n := v_n + 1;
  end loop;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'expired', v_n, 'tokens_revoked', v_tokens);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_my_signer_row(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_id uuid; begin
  if auth.uid() is null then return jsonb_build_object('granted', false, 'reason', 'not_authenticated'); end if;
  -- A-N5: one person on several rows signs the lowest-position row that can act now, else the lowest.
  select id into v_id from esign.envelope_signer
   where envelope_id = p_envelope_id and signer_user_id = auth.uid()
     and status not in ('declined','delegated','expired')
   order by (esign._can_act(id) ->> 'can_act')::boolean desc nulls last, position, created_at limit 1;
  if v_id is null then return jsonb_build_object('granted', false, 'reason', 'not_a_signer'); end if;
  return jsonb_build_object('granted', true, 'signer_id', v_id);
end $function$;

-- ═══ DOORS ═══ esign_expire_sweep had no declaration; it is the scheduler's sweep (service role).
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Cross-organization expiry sweep; takes only a batch size and moves rows already past their frozen expiry.',
       'esign_parity_08_wave_a_remainder',
       'server_only: the scheduled e-sign expiry sweep runs on the service connection; no browser calls it.', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'esign_expire_sweep'
on conflict do nothing;
