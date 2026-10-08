-- chair-step: the only DELETE removes platform.client_callable_door rows whose function signature no longer exists (a door follows its function); no data row is deleted.
-- based-on: esign._certificate_payload(uuid) de4b84b6195cb8326bc47c73314c439e3762fb8d7d380bff5c92558e25c7616b
-- based-on: esign._maybe_complete(uuid) 4a4802caffa5822015eb2caa76bc0026cbe963c6514188ddab80ede81e15642a
-- e-sign parity v2 wave C (CONTRACT.md §0 I, §10): the certificate is owed to finalize (copies first,
-- then a v2 certificate that carries their fingerprints and each recipient's signed-event evidence).
CREATE OR REPLACE FUNCTION esign._certificate_payload(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_org jsonb; v_type text; v_sender jsonb;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  select jsonb_build_object('id', o.id, 'name', o.name) into v_org
    from iam.organizations o where o.id = e.organization_id;
  v_sender := esign.envelope_sender(p_envelope_id);
  select c.slug into v_type from platform.categories c where c.id = e.category_id;

  return jsonb_build_object(
    'certificate_version', 2,
    'sender', v_sender,
    'issuer', 'AI Matrx e-sign',
    'issuer_note', 'This certificate is signed with a key held by AI Matrx. It proves the certificate has not been altered since issue. It is not a certificate from a qualified trust service provider and no third party attested the timestamps.',
    'generated_at', now(),
    'envelope', jsonb_build_object(
      'id', e.id, 'title', e.title, 'type', v_type, 'consumer_key', e.consumer_key,
      'source', jsonb_build_object('type', e.source_type, 'id', e.source_id),
      'email_subject', e.email_subject,
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
               'frozen_at', d.frozen_at,
               -- §10.1: the signed copy's own fingerprint, from its signed_copy_made event.
               'signed_copy_sha256', (select v.payload ->> 'sha256' from esign.envelope_event v
                                       where v.envelope_id = e.id and v.event_type = 'signed_copy_made'
                                         and v.document_id = d.id order by v.occurred_at desc limit 1)) order by d.position)
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
    -- §10.1 per recipient: what the evidence says, read from each signed event (never the row).
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.full_name, 'email', s.email, 'role', s.role, 'order', s.position,
               'actor_type', s.actor_type, 'status', s.status,
               'security_level', case when s.actor_type = 'internal_user' then 'Account sign-in'
                                      when coalesce(s.verification_factor, 'none') = 'email_code' then 'Email link + email code'
                                      when s.verification_factor = 'access_code' then 'Email link + access code'
                                      else 'Email link' end,
               'authentication', (select jsonb_build_object('factor', a.payload ->> 'factor', 'verified_at', a.occurred_at)
                                    from esign.envelope_event a where a.signer_id = s.id and a.event_type = 'authenticated'
                                   order by a.occurred_at limit 1),
               'sent_at', s.last_notified_at, 'viewed_at', s.document_previewed_at, 'consented_at', s.consented_at,
               'signed_at', s.signed_at, 'declined_at', s.declined_at, 'decline_reason', s.decline_reason,
               'acknowledged_at', (select a.occurred_at from esign.envelope_event a
                                    where a.signer_id = s.id and a.event_type = 'acknowledged' limit 1),
               'delegated_to', (select jsonb_build_object('name', d2.full_name, 'email', d2.email)
                                  from esign.envelope_signer d2 where d2.delegated_from_signer_id = s.id limit 1),
               'signing_ip', host(ev.ip_address), 'signing_user_agent', ev.user_agent,
               'adoption', jsonb_build_object('signature_kind', ev.payload #>> '{payload,signature_kind}',
                                              'signature_source', ev.payload #>> '{payload,signature_source}',
                                              'initials_kind', ev.payload #>> '{payload,initials_kind}'),
               'signature_image_checksum', ev.payload #>> '{payload,signature_image_checksum}',
               'initials_image_checksum', ev.payload #>> '{payload,initials_image_checksum}',
               'handoff_phone_last4', (select a.payload ->> 'phone_last4' from esign.envelope_event a
                                        where a.signer_id = s.id and a.event_type = 'signature_handoff_completed'
                                        order by a.occurred_at desc limit 1),
               'payload_version', ev.payload ->> 'payload_version',
               'signature_payload_hash', ev.payload ->> 'signature_payload_hash',
               'field_values_hash', ev.payload #>> '{payload,field_values_hash}') order by s.position, s.created_at)
        from esign.envelope_signer s
        left join lateral (select v.* from esign.envelope_event v where v.signer_id = s.id and v.event_type = 'signed'
                            order by v.occurred_at desc limit 1) ev on true
       where s.envelope_id = e.id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'documents', (select count(*) from esign.envelope_document d where d.envelope_id = e.id),
      'pages', (select coalesce(sum(d.page_count), 0) from esign.envelope_document d where d.envelope_id = e.id),
      'signers', (select count(*) from esign.envelope_signer s where s.envelope_id = e.id and s.role <> 'cc_recipient'),
      'cc', (select count(*) from esign.envelope_signer s where s.envelope_id = e.id and s.role = 'cc_recipient'),
      'signatures', (select count(*) from esign.envelope_event v where v.envelope_id = e.id and v.event_type = 'signed')),
    'event_ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', v.event_type, 'at', v.occurred_at, 'actor_type', v.actor_type,
               'actor_label', v.actor_label, 'auth_method', v.auth_method,
               'signer_id', v.signer_id, 'document_id', v.document_id,
               'ip', host(v.ip_address), 'user_agent', v.user_agent,
               'payload', v.payload) order by v.occurred_at, v.id)
        from esign.envelope_event v where v.envelope_id = e.id), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION esign._maybe_complete(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
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
     and s.role in ('signer','approver','viewer') and s.status not in ('signed','acknowledged','delegated');   -- A-F3
  if v_outstanding > 0 then
    if e.status = 'sent' then
      update esign.envelope set status = 'in_progress' where id = p_envelope_id;
    end if;
    -- the ordered walk advances: notify exactly whoever may act now
    perform esign._notify_actionable(p_envelope_id, 'esign.signature_requested');
    return jsonb_build_object('completed', false, 'outstanding', v_outstanding);
  end if;

  update esign.envelope set status = 'completed', completed_at = now() where id = p_envelope_id;
  perform esign._cancel_scheduled_notices(p_envelope_id);
  -- Decision I (wave C): the certificate is owed to aidream's finalize, which makes the signed copies
  -- first so the certificate carries their fingerprints; esign_envelope_state.finalize shows it owed.

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
                        p_payload => jsonb_build_object('certificate_owed', true,
                                                        'callback_key', e.callback_key));
  return jsonb_build_object('completed', true, 'certificate_owed', true);
end $function$;

-- §5.5 finalize's server-only steps.
create or replace function esign.record_signed_copy_made(p_document_id uuid, p_file_id uuid, p_sha256 text)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare d esign.envelope_document%rowtype;
begin
  select * into d from esign.envelope_document where id = p_document_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'unknown_document'); end if;
  perform esign.record_signed_copy(p_document_id, p_file_id);
  if not exists (select 1 from esign.envelope_event where document_id = p_document_id and event_type = 'signed_copy_made'
                    and payload ->> 'file_id' = p_file_id::text) then
    perform esign._event(d.envelope_id, 'signed_copy_made', 'automation', p_document_id => p_document_id,
                         p_payload => jsonb_build_object('file_id', p_file_id, 'sha256', p_sha256));
  end if;
  return jsonb_build_object('granted', true);
end $$;

create or replace function esign.record_certificate_file(p_certificate_id uuid, p_file_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  update esign.envelope_certificate set rendered_file_id = p_file_id, updated_at = now() where id = p_certificate_id
  returning jsonb_build_object('granted', true)
$$;

-- What finalize and the v2 signed copy read: every signer's latest signed event (the evidence of
-- record, decision B) and the certificate as stored.
create or replace function esign.finalize_inputs(p_envelope_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'envelope_id', e.id, 'status', e.status, 'title', e.title, 'organization_id', e.organization_id,
    'owner_id', e.created_by, 'completed_at', e.completed_at, 'config_snapshot', e.config_snapshot,
    'certificate', (select jsonb_build_object('id', c.id, 'payload', c.payload, 'payload_hash', c.payload_hash,
                                              'signature', c.signature, 'key_id', c.key_id,
                                              'rendered_file_id', c.rendered_file_id, 'generated_at', c.generated_at)
                      from esign.envelope_certificate c where c.envelope_id = e.id),
    'signed', coalesce((select jsonb_object_agg(x.signer_id, x.ev) from (
        select distinct on (v.signer_id) v.signer_id, jsonb_build_object('payload', v.payload, 'occurred_at', v.occurred_at) ev
          from esign.envelope_event v where v.envelope_id = e.id and v.event_type = 'signed'
         order by v.signer_id, v.occurred_at desc) x), '{}'::jsonb),
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'full_name', s.full_name, 'email', s.email,
                                       'role', s.role, 'status', s.status, 'color_index', s.color_index)
                                       order by s.position, s.created_at)
                              from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb))
  from esign.envelope e where e.id = p_envelope_id
$$;

-- ═══ DOORS (generated) ═══

-- Every new SECURITY DEFINER function declares who may call it (§5.8; provision_shape_guard).
delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('esign','_certificate_payload'),
  ('esign','_maybe_complete'),
  ('esign','record_signed_copy_made'),
  ('esign','record_certificate_file'),
  ('esign','finalize_inputs'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal e-sign step; every id argument is a row the calling door already authorised.', 'esign_parity_10_finalize',
       'server_only: e-sign finalize steps run on the aidream service connection after the envelope completes', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('esign','_certificate_payload'),
  ('esign','_maybe_complete'),
  ('esign','record_signed_copy_made'),
  ('esign','record_certificate_file'),
  ('esign','finalize_inputs'))
   and p.prosecdef
on conflict do nothing;
