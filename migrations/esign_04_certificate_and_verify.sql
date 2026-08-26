-- E-sign C7 — migration 4 of 6 (register item HRB-011, lane core-c7-esign).
--
-- COMPLETION, THE Ed25519-SIGNED CERTIFICATE, AND TAMPER VERIFICATION. §2.6's certificate is
-- generated once, at the moment the last required signer signs, and its payload is SELF-SUFFICIENT:
-- a reader with no database access must be able to evaluate it.
--
-- Authority: SPEC-ESIGN §2.6, §3.3, §8.1, §8.2. Applied live as `esign_04_certificate_and_verify`.
-- Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. `jsonb::text` IS THE CANONICAL SERIALIZATION, AND THAT IS A PROPERTY OF THE TYPE, NOT A HOPE.
--    §2.6 hashes "the canonical JSON serialization of payload". Postgres `jsonb` normalises on
--    input — duplicate keys collapse, insignificant whitespace is gone, and object keys are stored
--    in a deterministic order (length, then bytewise) — so two jsonb values that are equal always
--    render the same text. Hashing `payload::text` is therefore reproducible by anyone holding the
--    payload, which is exactly what a verifiable certificate needs. A hand-rolled canonicaliser
--    would be a second implementation of something the type already guarantees.
--
-- 2. THE COMPLETION RACE IS CLOSED BY A ROW LOCK **AND** A UNIQUE INDEX (§8.5 case 43). Parallel
--    signers finishing in the same instant is the normal case for a bulk campaign, not an exotic
--    one. `esign._maybe_complete` takes `select … for update` on the envelope before it counts, so
--    the second transaction blocks and then sees `completed`; the unique index from migration 01 is
--    the backstop that makes a second certificate impossible even if the lock were ever bypassed.
--
-- 3. THE CERTIFICATE EMBEDS THE DISCLOSURE'S FULL TEXT, NOT ITS ID (§2.6/§4.1). An id is a
--    database reference and §2.6's whole test is that the reader has no database. The disclosure
--    row is immutable once cited (migration 01's trigger), so the embedded text and the cited row
--    can never disagree.
--
-- 4. KEY ROTATION KEEPS EVERY OLD KEY FOREVER. `esign_rotate_signing_key` marks the current key
--    retired and inserts a new one; nothing is deleted and nothing is re-signed, so a certificate
--    issued under an old key still verifies against the old public key (§8.1 case 7).
--
-- 5. VERIFICATION TAKES THE OBSERVED HASHES AS AN ARGUMENT, for the reason recorded in migration 03
--    decision 1, and it reports EXPECTED AND ACTUAL per document (§8.2 case 9) rather than a
--    boolean — "it failed" is not a finding anyone can act on.
-- ===================================================================================

set local statement_timeout = '300s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. The self-sufficient certificate payload (§2.6).
-- ---------------------------------------------------------------------------------
create or replace function esign._certificate_payload(p_envelope_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; v_org jsonb; v_type text;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  select jsonb_build_object('id', o.id, 'name', o.name) into v_org
    from iam.organizations o where o.id = e.organization_id;
  select c.slug into v_type from platform.categories c where c.id = e.category_id;

  return jsonb_build_object(
    'certificate_version', 1,
    'issuer', 'AI Matrx e-sign',
    'issuer_note', 'This certificate is signed with a key held by AI Matrx. It proves the certificate has not been altered since issue. It is not a certificate from a qualified trust service provider and no third party attested the timestamps.',
    'generated_at', now(),
    'envelope', jsonb_build_object(
      'id', e.id, 'title', e.title, 'type', v_type, 'consumer_key', e.consumer_key,
      'source', jsonb_build_object('type', e.source_type, 'id', e.source_id),
      'sensitivity', e.sensitivity, 'signing_order', e.signing_order,
      'status', 'completed', 'sent_at', e.sent_at, 'completed_at', now(),
      'expires_at', e.expires_at),
    'organization', v_org,
    'config_snapshot', e.config_snapshot,
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'position', d.position, 'name', d.name,
               'source_kind', d.source_kind,
               'template_id', d.template_id, 'template_version', d.template_version,
               'document_id', d.document_id, 'document_version', d.document_version,
               'byte_size', d.byte_size, 'page_count', d.page_count, 'mime_type', d.mime_type,
               'hash_algorithm', d.hash_algorithm, 'content_hash', d.content_hash,
               'frozen_at', d.frozen_at) order by d.position)
        from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.full_name, 'email', s.email, 'role', s.role,
               'order', s.position, 'actor_type', s.actor_type,
               'authentication_method', s.auth_method,
               'verification_factor', coalesce(s.verification_factor, 'session'),
               'verification_passed', s.verification_passed,
               'status', s.status,
               'document_previewed_at', s.document_previewed_at,
               'consented_at', s.consented_at, 'signed_at', s.signed_at,
               'declined_at', s.declined_at, 'decline_reason', s.decline_reason,
               'signature_kind', s.signature_kind, 'typed_name', s.typed_name,
               'signature_payload_hash', s.signature_payload_hash,
               'signed_content_hash', s.signed_content_hash,
               -- RECORDED DECISION 3: the disclosure's FULL TEXT travels with the certificate.
               'consent_disclosure', (select jsonb_build_object(
                       'id', cd.id, 'key', cd.disclosure_key, 'version', cd.version_label,
                       'locale', cd.locale, 'title', cd.title, 'text', cd.body)
                  from esign.consent_disclosure cd where cd.id = s.consent_disclosure_id),
               'interaction_evidence', (select jsonb_agg(jsonb_build_object(
                       'event', v.event_type, 'at', v.occurred_at,
                       'ip', host(v.ip_address), 'user_agent', v.user_agent) order by v.occurred_at)
                  from esign.envelope_event v
                 where v.signer_id = s.id
                   and v.event_type in ('opened','viewed','consent_given','signature_adopted','signed','declined','downloaded'))
             ) order by s.position)
        from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb),
    'event_ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', v.event_type, 'at', v.occurred_at, 'actor_type', v.actor_type,
               'actor_label', v.actor_label, 'auth_method', v.auth_method,
               'signer_id', v.signer_id, 'document_id', v.document_id,
               'ip', host(v.ip_address), 'user_agent', v.user_agent,
               'payload', v.payload) order by v.occurred_at, v.id)
        from esign.envelope_event v where v.envelope_id = e.id), '[]'::jsonb));
end $fn$;

-- ---------------------------------------------------------------------------------
-- 2. Generate, seal and sign it.
-- ---------------------------------------------------------------------------------
create or replace function esign.generate_certificate(p_envelope_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; k esign.signing_key%rowtype;
        v_payload jsonb; v_hash text; v_sig text; v_id uuid; v_sign boolean;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign.generate_certificate: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if exists (select 1 from esign.envelope_certificate where envelope_id = p_envelope_id) then
    return jsonb_build_object('granted', true, 'already_generated', true,
                              'certificate_id', (select id from esign.envelope_certificate where envelope_id = p_envelope_id));
  end if;

  v_payload := esign._certificate_payload(p_envelope_id);
  v_hash    := encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex');   -- RECORDED DECISION 1

  v_sign := coalesce((esign.config_resolve(e.organization_id,'esign.certificate.sign_payload'))::boolean, true);
  select * into k from esign.signing_key where is_current limit 1;
  if v_sign and k.id is null then
    return jsonb_build_object('granted', false, 'reason', 'no_signing_key');
  end if;
  v_sig := case when v_sign
                then encode(pgsodium.crypto_sign_detached(convert_to(v_hash,'UTF8'), k.secret_key), 'base64')
                else '' end;

  insert into esign.envelope_certificate
    (organization_id, envelope_id, payload, payload_hash, signature, key_id, generated_at)
  values (e.organization_id, p_envelope_id, v_payload, v_hash, v_sig, k.key_id, now())
  returning id into v_id;

  update esign.envelope set certificate_id = v_id where id = p_envelope_id;
  perform esign._event(p_envelope_id, 'certificate_generated', 'automation',
                       p_payload => jsonb_build_object('certificate_id', v_id, 'payload_hash', v_hash,
                                                       'key_id', k.key_id, 'algorithm', k.algorithm));
  return jsonb_build_object('granted', true, 'certificate_id', v_id, 'payload_hash', v_hash,
                            'key_id', k.key_id);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 3. Completion — the race-safe transition (§3.3, RECORDED DECISION 2).
-- ---------------------------------------------------------------------------------
create or replace function esign._maybe_complete(p_envelope_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; v_outstanding int; v_cert jsonb; r record;
begin
  select * into e from esign.envelope where id = p_envelope_id for update;   -- serialise the race
  if e.status = 'completed' then
    return jsonb_build_object('completed', true, 'already', true,
                              'certificate_id', e.certificate_id);
  end if;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('completed', false, 'reason', 'envelope_' || e.status);
  end if;

  select count(*) into v_outstanding from esign.envelope_signer s
   where s.envelope_id = p_envelope_id and s.is_required
     and s.role in ('signer','approver') and s.status <> 'signed';
  if v_outstanding > 0 then
    if e.status = 'sent' then
      update esign.envelope set status = 'in_progress' where id = p_envelope_id;
    end if;
    -- the ordered walk advances: notify exactly whoever may act now
    perform esign._notify_actionable(p_envelope_id, 'esign.signature_requested');
    return jsonb_build_object('completed', false, 'outstanding', v_outstanding);
  end if;

  update esign.envelope set status = 'completed', completed_at = now() where id = p_envelope_id;
  v_cert := esign.generate_certificate(p_envelope_id);

  -- cc_recipient tokens are minted READ-ONLY AT COMPLETION, never at send (§3.3).
  for r in select * from esign.envelope_signer
            where envelope_id = p_envelope_id and role = 'cc_recipient'
              and actor_type = 'external' and actor_token_id is null loop
    perform platform.mint_outsider_token(
      p_consumer_key => 'esign.signer', p_subject_type => 'esign_envelope_signer',
      p_subject_id => r.id,
      p_scope => jsonb_build_object(
        'consumer_key','esign.signer',
        'subject', jsonb_build_object('type','esign_envelope_signer','id', r.id),
        'grants', jsonb_build_array(
          jsonb_build_object('resource','esign_envelope','id', p_envelope_id,'actions', jsonb_build_array('read')),
          jsonb_build_object('resource','esign_envelope_document','parent_id', p_envelope_id,'actions', jsonb_build_array('read','download')),
          jsonb_build_object('resource','esign_envelope_signer','id', r.id,'actions', jsonb_build_array('read')))),
      p_organization_id => e.organization_id,
      p_recipient => jsonb_build_object('name', r.full_name, 'email', r.email, 'verification_target', r.email),
      p_overrides => jsonb_build_object('expires_at', e.expires_at));
  end loop;

  perform esign._notify(p_envelope_id, 'esign.completed', p_to_user => e.created_by,
                        p_to_address => null,
                        p_subject => 'Signing complete: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('certificate_id', v_cert -> 'certificate_id',
                                                        'callback_key', e.callback_key));
  return jsonb_build_object('completed', true, 'certificate_id', v_cert -> 'certificate_id');
end $fn$;

-- ---------------------------------------------------------------------------------
-- 4. VERIFY — recompute and compare every hash (§6.1 POST /verify, §8.2 cases 9 and 10).
-- ---------------------------------------------------------------------------------
create or replace function public.esign_verify_envelope(p_envelope_id uuid, p_observed jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; c esign.envelope_certificate%rowtype; k esign.signing_key%rowtype;
        d record; o jsonb; v_docs jsonb := '[]'::jsonb; v_mismatch int := 0; v_checked int := 0;
        v_recomputed text; v_cert jsonb; v_sig_ok boolean;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_verify_envelope: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if not esign._may_manage(e.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;

  perform esign._arm();
  for d in select * from esign.envelope_document where envelope_id = p_envelope_id order by position loop
    o := null;
    select el into o from jsonb_array_elements(coalesce(p_observed,'[]'::jsonb)) as el
     where el ->> 'document_id' = d.id::text limit 1;
    if o is null then
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_id', d.id, 'name', d.name, 'result', 'not_observed',
        'expected_hash', d.content_hash,
        'detail', 'no observed hash was supplied for this document — an unchecked document is reported as unchecked, never as matching'));
      continue;
    end if;
    v_checked := v_checked + 1;
    if lower(o ->> 'content_hash') is not distinct from d.content_hash then
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_id', d.id, 'name', d.name, 'result', 'match', 'expected_hash', d.content_hash));
      perform esign._event(p_envelope_id, 'hash_verified', 'automation', p_document_id => d.id,
                           p_payload => jsonb_build_object('document_hash', d.content_hash));
    else
      v_mismatch := v_mismatch + 1;
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_id', d.id, 'name', d.name, 'result', 'MISMATCH',
        'expected_hash', d.content_hash, 'actual_hash', lower(o ->> 'content_hash')));
      perform esign._event(p_envelope_id, 'hash_mismatch', 'automation', p_document_id => d.id,
                           p_payload => jsonb_build_object('expected_hash', d.content_hash,
                                                           'actual_hash', lower(o ->> 'content_hash')));
    end if;
  end loop;

  -- §8.2 case 10: the certificate is checked against itself, both ways.
  select * into c from esign.envelope_certificate where envelope_id = p_envelope_id;
  if c.id is not null then
    v_recomputed := encode(sha256(convert_to(c.payload::text,'UTF8')), 'hex');
    select * into k from esign.signing_key where key_id = c.key_id;
    v_sig_ok := case when c.signature = '' or k.public_key is null then null
                     else pgsodium.crypto_sign_verify_detached(
                            decode(c.signature,'base64'), convert_to(c.payload_hash,'UTF8'),
                            decode(k.public_key,'base64')) end;
    v_cert := jsonb_build_object(
      'certificate_id', c.id, 'key_id', c.key_id,
      'stored_payload_hash', c.payload_hash, 'recomputed_payload_hash', v_recomputed,
      'payload_hash_matches', v_recomputed = c.payload_hash,
      'signature_verifies', v_sig_ok);
  else
    v_cert := jsonb_build_object('certificate_id', null, 'detail', 'no certificate — the envelope has not completed');
  end if;
  perform esign._disarm();

  return jsonb_build_object(
    'granted', true, 'envelope_id', p_envelope_id, 'status', e.status,
    'documents_checked', v_checked, 'documents_mismatched', v_mismatch,
    'intact', v_mismatch = 0
             and coalesce((v_cert ->> 'payload_hash_matches')::boolean, true)
             and coalesce((v_cert ->> 'signature_verifies')::boolean, true),
    'documents', v_docs, 'certificate', v_cert);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 5. The published public keys, and rotation (§2.6, RECORDED DECISION 4).
-- ---------------------------------------------------------------------------------
create or replace function public.esign_certificate_public_keys()
returns jsonb
language sql stable security definer set search_path to 'esign','public' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key_id', key_id, 'algorithm', algorithm, 'public_key', public_key,
           'is_current', is_current, 'activated_at', activated_at, 'retired_at', retired_at)
         order by activated_at), '[]'::jsonb)
    from esign.signing_key;
$fn$;

create or replace function public.esign_rotate_signing_key(p_reason text default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare kp pgsodium.crypto_sign_keypair; v_old text; v_new text;
begin
  if not public.is_platform_admin() and auth.uid() is not null then
    return jsonb_build_object('granted', false, 'reason', 'platform_admin_only');
  end if;
  select key_id into v_old from esign.signing_key where is_current;
  update esign.signing_key set is_current = false, retired_at = now() where is_current;
  kp := pgsodium.crypto_sign_seed_new_keypair(extensions.gen_random_bytes(32));
  v_new := 'esign-ed25519-' || to_char(now(),'YYYYMMDD') || '-' ||
           lpad(((select count(*) from esign.signing_key) + 1)::text, 2, '0');
  insert into esign.signing_key (organization_id, key_id, algorithm, public_key, secret_key, is_current)
  values ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v_new, 'ed25519',
          encode((kp).public,'base64'), (kp).secret, true);
  -- Nothing is deleted and nothing is re-signed: every certificate issued under v_old still
  -- verifies against v_old's retained public key.
  return jsonb_build_object('granted', true, 'retired_key_id', v_old, 'current_key_id', v_new,
                            'reason', p_reason);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'public.esign_verify_envelope(uuid,jsonb)',
    'public.esign_certificate_public_keys()',
    'public.esign_rotate_signing_key(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 7. ASSERTIONS — the certificate machinery proves itself here, on a throwaway payload.
-- ---------------------------------------------------------------------------------
do $$
declare k esign.signing_key%rowtype; v_payload jsonb; v_hash text; v_sig text;
begin
  select * into k from esign.signing_key where is_current;
  v_payload := jsonb_build_object('b', 2, 'a', 1);
  v_hash := encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');
  -- RECORDED DECISION 1: jsonb normalises, so an equal payload always renders the same text.
  if v_hash <> encode(sha256(convert_to((jsonb_build_object('a',1,'b',2))::text,'UTF8')),'hex') then
    raise exception 'esign_04: jsonb serialization is not canonical — the certificate hash would not be reproducible';
  end if;
  v_sig := encode(pgsodium.crypto_sign_detached(convert_to(v_hash,'UTF8'), k.secret_key),'base64');
  if not pgsodium.crypto_sign_verify_detached(decode(v_sig,'base64'), convert_to(v_hash,'UTF8'),
                                              decode(k.public_key,'base64')) then
    raise exception 'esign_04: the Ed25519 round trip does not verify';
  end if;
  -- and a single altered byte must fail
  if pgsodium.crypto_sign_verify_detached(decode(v_sig,'base64'), convert_to(v_hash || 'x','UTF8'),
                                          decode(k.public_key,'base64')) then
    raise exception 'esign_04: a tampered payload verified — the signature is not binding';
  end if;

  if to_regprocedure('esign.generate_certificate(uuid)') is null
     or to_regprocedure('esign._maybe_complete(uuid)') is null
     or to_regprocedure('public.esign_verify_envelope(uuid,jsonb)') is null then
    raise exception 'esign_04: the certificate family did not create';
  end if;
end $$;
