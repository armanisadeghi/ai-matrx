-- chair-step: the DROP re-creates envelope_event_event_type_check with two more allowed values (signer_removed, signer_record_changed) in the same transaction; the REVOKEs keep six new internal helpers off the client.
-- e-sign parity fix round 2 (verify A1/B1, A2, A3, A5, A6, A7): the evidence is the record.
--   * The certificate's recipients and signers are read from the append-only `signed` events (and
--     the new `signer_removed` events); a signer row rewritten or deleted after Sign changes nothing
--     the certificate attests (REGISTER 2026-10-08 ruling A1/A2: read the evidence, no new refusal).
--   * Deleting a recipient row, or a direct (non-door) edit of a recipient's identity, after send is
--     itself recorded as an append-only event — evidence, never a refusal (law 12).
--   * esign_verify_envelope compares every signed event with the live row and with the certificate,
--     and answers intact = false naming each disagreement.
--   * F1: the sender's access code works as chosen (materialize keeps `access_code`).
--   * A5: a locked link says it is locked and when it reopens; A6: over-long text is cut to the
--     field's max length and the answer says so; A7: a signer already told is not "told" again on
--     every later signature (that moved their Sent time and re-sent their invitation).

-- based-on: esign._certificate_payload(uuid) 436f43a7a2bcf251ea2de02e9b3f4be5e1ad15b647b3eea3bd5c5517cd50825b
-- based-on: public.esign_verify_envelope(uuid, jsonb) 82c3f7c955c28758cae84e423cf92cb2ddc75cee65697259a8ba7c43a228ac42
-- based-on: esign._enforce(text) 3d864d181a372b1f2b29fa8f40613f3803d273611e2bcbcc877749dc327373d4
-- based-on: public.outsider_send_code(text) 7024e979ee683493e2490528eabf4fcc88deb1d6edc5c747f20a5b791ca2dc09
-- based-on: esign._act_save_values(jsonb, jsonb) 9953449c82ac360bfb623df58851515cdd269ef0b8367dbb3dc7f8c60c45440b
-- based-on: esign._resolve_values(uuid, jsonb, text) 6f0b3805688da06b0efdef2b49d432dc91d81762fbeb2e625813b0d1a2cdd26e
-- based-on: esign._notify_actionable(uuid, text) b8a080069bb1b8da7f102d00e70fcc6d7780be413761b7c1b5b404a6d7703237
alter table esign.envelope_event drop constraint envelope_event_event_type_check;
alter table esign.envelope_event add constraint envelope_event_event_type_check check (event_type = any (array[
  'created','document_frozen','sent','delivered','delivery_failed','opened','viewed','consent_shown','consent_given',
  'consent_withdrawn','signature_adopted','signed','declined','delegated','reminded','resent','voided','expired',
  'downloaded','certificate_generated','hash_verified','hash_mismatch','provider_dispatched',
  'provider_status_received','provider_completed','authenticated','signature_handoff_started',
  'signature_handoff_completed','acknowledged','signed_copy_made','certificate_rendered',
  'signer_removed','signer_record_changed']::text[]));

-- Who did a direct write, for the ledger line (a person's address, or the automation that ran it).
CREATE OR REPLACE FUNCTION esign._direct_writer_label()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
  select coalesce((select u.email::text from auth.users u where u.id = auth.uid()), current_user::text)
$function$;

-- A2: a recipient row deleted after send leaves an append-only line naming who, when, and whether
-- they had signed; the certificate reads it. Draft rows are composition, not evidence.
CREATE OR REPLACE FUNCTION esign._record_signer_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype;
begin
  select * into e from esign.envelope where id = old.envelope_id;
  if not found or e.status = 'draft' then return old; end if;   -- the envelope itself is going, or a draft
  perform esign._event(old.envelope_id, 'signer_removed', esign._requester_actor_type(e.consumer_key),
    p_signer_id => old.id, p_actor_user_id => auth.uid(), p_actor_label => esign._direct_writer_label(),
    p_payload => jsonb_build_object(
      'had_signed', exists (select 1 from esign.envelope_event v where v.signer_id = old.id and v.event_type = 'signed'),
      'status_at_removal', old.status,
      'snapshot', jsonb_build_object('full_name', old.full_name, 'email', old.email, 'role', old.role,
                                     'order', old.position, 'actor_type', old.actor_type, 'is_required', old.is_required,
                                     'verification_factor', old.verification_factor)));
  return old;
end $function$;

-- A1: a direct write (not one of the e-sign doors) to what a recipient IS, after send, is recorded.
CREATE OR REPLACE FUNCTION esign._record_signer_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_changed text[] := '{}';
begin
  if esign._privileged() then return new; end if;
  select * into e from esign.envelope where id = new.envelope_id;
  if not found or e.status = 'draft' then return new; end if;
  if new.full_name is distinct from old.full_name then v_changed := v_changed || 'full_name'; end if;
  if new.email is distinct from old.email then v_changed := v_changed || 'email'; end if;
  if new.typed_name is distinct from old.typed_name then v_changed := v_changed || 'typed_name'; end if;
  if new.field_values is distinct from old.field_values then v_changed := v_changed || 'field_values'; end if;
  if new.signature_image_file_id is distinct from old.signature_image_file_id then v_changed := v_changed || 'signature_image_file_id'; end if;
  if new.initials_image_file_id is distinct from old.initials_image_file_id then v_changed := v_changed || 'initials_image_file_id'; end if;
  if new.signature_kind is distinct from old.signature_kind then v_changed := v_changed || 'signature_kind'; end if;
  if new.role is distinct from old.role then v_changed := v_changed || 'role'; end if;
  if new.position is distinct from old.position then v_changed := v_changed || 'order'; end if;
  if new.is_required is distinct from old.is_required then v_changed := v_changed || 'is_required'; end if;
  if new.verification_factor is distinct from old.verification_factor then v_changed := v_changed || 'verification_factor'; end if;
  if cardinality(v_changed) = 0 then return new; end if;
  perform esign._event(new.envelope_id, 'signer_record_changed', esign._requester_actor_type(e.consumer_key),
    p_signer_id => new.id, p_actor_user_id => auth.uid(), p_actor_label => esign._direct_writer_label(),
    p_payload => jsonb_build_object(
      'changed', to_jsonb(v_changed),
      'had_signed', exists (select 1 from esign.envelope_event v where v.signer_id = new.id and v.event_type = 'signed'),
      'before', jsonb_build_object('full_name', old.full_name, 'email', old.email, 'typed_name', old.typed_name),
      'after', jsonb_build_object('full_name', new.full_name, 'email', new.email, 'typed_name', new.typed_name)));
  return new;
end $function$;

create trigger _zz_record_signer_removed after delete on esign.envelope_signer
  for each row execute function esign._record_signer_removed();
create trigger _zz_record_signer_changed after update on esign.envelope_signer
  for each row execute function esign._record_signer_changed();

-- Every recipient the evidence knows: live rows, signers whose row is gone, removed recipients.
-- One row per recipient id; `ev` = their latest signed event, `rm` = their removal event.
CREATE OR REPLACE FUNCTION esign._evidence_roster(p_envelope_id uuid)
 RETURNS TABLE(signer_id uuid, row_present boolean, ev jsonb, ev_at timestamptz, ev_ip inet, ev_ua text,
               rm jsonb, rm_at timestamptz, rm_by text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
  with ids as (
    select s.id from esign.envelope_signer s where s.envelope_id = p_envelope_id
    union
    select v.signer_id from esign.envelope_event v
     where v.envelope_id = p_envelope_id and v.signer_id is not null and v.event_type in ('signed','signer_removed'))
  select i.id,
         exists (select 1 from esign.envelope_signer s where s.id = i.id),
         sg.payload, sg.occurred_at, sg.ip_address, sg.user_agent,
         rm.payload, rm.occurred_at, rm.actor_label
    from ids i
    left join lateral (select v.payload, v.occurred_at, v.ip_address, v.user_agent from esign.envelope_event v
                        where v.envelope_id = p_envelope_id and v.signer_id = i.id and v.event_type = 'signed'
                        order by v.occurred_at desc limit 1) sg on true
    left join lateral (select v.payload, v.occurred_at, v.actor_label from esign.envelope_event v
                        where v.envelope_id = p_envelope_id and v.signer_id = i.id and v.event_type = 'signer_removed'
                        order by v.occurred_at desc limit 1) rm on true
$function$;

-- A1/B1/A2: the certificate attests what was sealed. Identity, values and marks of everyone who
-- signed come from their `signed` event; a recipient whose row is gone stays, from the evidence,
-- with what happened to the record. A later edit of a row cannot change what this payload says.
CREATE OR REPLACE FUNCTION esign._certificate_payload(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_org jsonb; v_type text; v_sender jsonb; v_people jsonb;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  select jsonb_build_object('id', o.id, 'name', o.name) into v_org
    from iam.organizations o where o.id = e.organization_id;
  v_sender := esign.envelope_sender(p_envelope_id);
  select c.slug into v_type from platform.categories c where c.id = e.category_id;

  -- One object per recipient, every fact read from the evidence first and the live row only for
  -- what no event carries (role, order — and for anyone who has not signed).
  select coalesce(jsonb_agg(p order by (p ->> 'order')::int nulls last, p ->> '_created', p ->> 'id'), '[]'::jsonb)
    into v_people
    from (
      select jsonb_build_object(
        '_created', s.created_at,
        'id', r.signer_id,
        'signed', r.ev is not null,
        'name', coalesce(r.ev #>> '{payload,full_name}', s.full_name, r.rm #>> '{snapshot,full_name}'),
        'email', coalesce(r.ev #>> '{payload,email}', s.email, r.rm #>> '{snapshot,email}'),
        'typed_name', coalesce(r.ev #>> '{payload,typed_name}', case when r.ev is null then s.typed_name end),
        'role', coalesce(s.role, r.rm #>> '{snapshot,role}', 'signer'),
        'order', coalesce(s.position, (r.rm #>> '{snapshot,order}')::int),
        'actor_type', coalesce(s.actor_type, r.rm #>> '{snapshot,actor_type}',
                               case when r.ev #>> '{payload,auth_method}' = 'session' then 'internal_user' else 'external' end),
        'auth_method', coalesce(r.ev #>> '{payload,auth_method}', s.auth_method),
        'factor', coalesce(r.ev #>> '{payload,verification_factor}', r.ev ->> 'verification_factor',
                           s.verification_factor, r.rm #>> '{snapshot,verification_factor}'),
        'status', case when r.ev is not null then 'signed'
                       when s.id is not null then s.status
                       when exists (select 1 from esign.envelope_event a where a.signer_id = r.signer_id and a.event_type = 'acknowledged') then 'acknowledged'
                       when exists (select 1 from esign.envelope_event a where a.signer_id = r.signer_id and a.event_type = 'declined') then 'declined'
                       else 'removed' end,
        'sent_at', coalesce((select min(n.created_at) from communication.notification n
                              where n.target_kind = 'esign_envelope' and n.target_id = p_envelope_id
                                and n.event_key in ('esign.signature_requested','esign.review_requested')
                                and n.payload ->> 'signer_id' = r.signer_id::text), s.last_notified_at),
        'viewed_at', coalesce((select min(a.occurred_at) from esign.envelope_event a where a.signer_id = r.signer_id and a.event_type = 'viewed'), s.document_previewed_at),
        'consented_at', coalesce((r.ev #>> '{payload,consented_at}')::timestamptz,
                                 (select max(a.occurred_at) from esign.envelope_event a where a.signer_id = r.signer_id and a.event_type = 'consent_given'), s.consented_at),
        'consent_disclosure_id', coalesce((r.ev #>> '{payload,consent_disclosure_id}')::uuid, s.consent_disclosure_id),
        'signed_at', r.ev_at,
        'declined_at', case when r.ev is null then coalesce(s.declined_at, (select max(a.occurred_at) from esign.envelope_event a where a.signer_id = r.signer_id and a.event_type = 'declined')) end,
        'decline_reason', case when r.ev is null then coalesce(s.decline_reason, (select a.payload ->> 'reason' from esign.envelope_event a where a.signer_id = r.signer_id and a.event_type = 'declined' order by a.occurred_at desc limit 1)) end,
        'signature_kind', coalesce(r.ev #>> '{payload,signature_kind}', case when r.ev is null then s.signature_kind end),
        'ev', r.ev, 'ev_ip', host(r.ev_ip), 'ev_ua', r.ev_ua,
        'record', case when r.row_present then jsonb_build_object('state', 'present')
                       else jsonb_build_object('state', 'removed', 'removed_at', r.rm_at, 'removed_by', r.rm_by,
                                               'had_signed', coalesce((r.rm ->> 'had_signed')::boolean, r.ev is not null)) end) as p
        from esign._evidence_roster(p_envelope_id) r
        left join esign.envelope_signer s on s.id = r.signer_id
    ) x;

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
               'signed_copy_sha256', (select v.payload ->> 'sha256' from esign.envelope_event v
                                       where v.envelope_id = e.id and v.event_type = 'signed_copy_made'
                                         and v.document_id = d.id order by v.occurred_at desc limit 1)) order by d.position)
        from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p ->> 'id', 'name', p ->> 'name', 'email', p ->> 'email', 'role', p ->> 'role',
               'order', p -> 'order', 'actor_type', p ->> 'actor_type',
               'authentication_method', p ->> 'auth_method',
               'verification_factor', coalesce(p ->> 'factor', 'session'),
               'verification_passed', case when (p ->> 'signed')::boolean then true end,
               'status', p ->> 'status',
               'document_previewed_at', p -> 'viewed_at',
               'consented_at', p -> 'consented_at', 'signed_at', p -> 'signed_at',
               'declined_at', p -> 'declined_at', 'decline_reason', p -> 'decline_reason',
               'signature_kind', p -> 'signature_kind', 'typed_name', p -> 'typed_name',
               'signature_payload_hash', p #> '{ev,signature_payload_hash}',
               'signed_content_hash', p #> '{ev,document_hash}',
               'record', p -> 'record',
               -- RECORDED DECISION 3: the disclosure's FULL TEXT travels with the certificate.
               'consent_disclosure', (select jsonb_build_object(
                       'id', cd.id, 'key', cd.disclosure_key, 'version', cd.version_label,
                       'locale', cd.locale, 'title', cd.title, 'text', cd.body)
                  from esign.consent_disclosure cd where cd.id = (p ->> 'consent_disclosure_id')::uuid),
               'interaction_evidence', (select jsonb_agg(jsonb_build_object(
                       'event', v.event_type, 'at', v.occurred_at,
                       'ip', host(v.ip_address), 'user_agent', v.user_agent) order by v.occurred_at)
                  from esign.envelope_event v
                 where v.signer_id = (p ->> 'id')::uuid
                   and v.event_type in ('opened','viewed','consent_given','signature_adopted','signed','declined','downloaded'))
             ) order by ord)
        from jsonb_array_elements(v_people) with ordinality as t(p, ord)), '[]'::jsonb),
    -- §10.1 per recipient: what the evidence says, read from each signed event (never the row).
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p ->> 'id', 'name', p ->> 'name', 'email', p ->> 'email', 'role', p ->> 'role', 'order', p -> 'order',
               'actor_type', p ->> 'actor_type', 'status', p ->> 'status',
               'security_level', case when p ->> 'actor_type' = 'internal_user' then 'Account sign-in'
                                      when coalesce(p ->> 'factor', 'none') = 'email_code' then 'Email link + email code'
                                      when p ->> 'factor' = 'access_code' then 'Email link + access code'
                                      else 'Email link' end,
               'authentication', (select jsonb_build_object('factor', a.payload ->> 'factor', 'verified_at', a.occurred_at)
                                    from esign.envelope_event a where a.signer_id = (p ->> 'id')::uuid and a.event_type = 'authenticated'
                                   order by a.occurred_at limit 1),
               'sent_at', p -> 'sent_at', 'viewed_at', p -> 'viewed_at', 'consented_at', p -> 'consented_at',
               'signed_at', p -> 'signed_at', 'declined_at', p -> 'declined_at', 'decline_reason', p -> 'decline_reason',
               'typed_name', p -> 'typed_name',
               'acknowledged_at', (select a.occurred_at from esign.envelope_event a
                                    where a.signer_id = (p ->> 'id')::uuid and a.event_type = 'acknowledged' limit 1),
               'delegated_to', (select jsonb_build_object('name', d2.full_name, 'email', d2.email)
                                  from esign.envelope_signer d2 where d2.delegated_from_signer_id = (p ->> 'id')::uuid limit 1),
               'signing_ip', p -> 'ev_ip', 'signing_user_agent', p -> 'ev_ua',
               'adoption', jsonb_build_object('signature_kind', p #>> '{ev,payload,signature_kind}',
                                              'signature_source', p #>> '{ev,payload,signature_source}',
                                              'initials_kind', p #>> '{ev,payload,initials_kind}'),
               'signature_image_checksum', p #>> '{ev,payload,signature_image_checksum}',
               'initials_image_checksum', p #>> '{ev,payload,initials_image_checksum}',
               'handoff_phone_last4', (select a.payload ->> 'phone_last4' from esign.envelope_event a
                                        where a.signer_id = (p ->> 'id')::uuid and a.event_type = 'signature_handoff_completed'
                                        order by a.occurred_at desc limit 1),
               'payload_version', p #>> '{ev,payload_version}',
               'signature_payload_hash', p #>> '{ev,signature_payload_hash}',
               'field_values_hash', p #>> '{ev,payload,field_values_hash}',
               'record', p -> 'record') order by ord)
        from jsonb_array_elements(v_people) with ordinality as t(p, ord)), '[]'::jsonb),
    'totals', jsonb_build_object(
      'documents', (select count(*) from esign.envelope_document d where d.envelope_id = e.id),
      'pages', (select coalesce(sum(d.page_count), 0) from esign.envelope_document d where d.envelope_id = e.id),
      'signers', (select count(*) from jsonb_array_elements(v_people) p where p ->> 'role' <> 'cc_recipient'),
      'cc', (select count(*) from jsonb_array_elements(v_people) p where p ->> 'role' = 'cc_recipient'),
      'removed', (select count(*) from jsonb_array_elements(v_people) p where p #>> '{record,state}' = 'removed'),
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

-- A1/A2: what the live records and the certificate say, against what each signer sealed.
-- Read-only; answers one entry per disagreement. v1 events carry no identity, so they are compared
-- only on what they hold.
CREATE OR REPLACE FUNCTION esign._evidence_disagreements(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
  with r as (select * from esign._evidence_roster(p_envelope_id) where ev is not null),
  cert as (select c.payload from esign.envelope_certificate c where c.envelope_id = p_envelope_id),
  found as (
    -- the signer's row is gone
    select r.signer_id, r.ev #>> '{payload,full_name}' as name, 'record_removed_after_signing' as problem,
           null::text as field, null::text as sealed, null::text as now_says
      from r where not r.row_present
    union all
    -- the row says something the signed event does not
    select r.signer_id, coalesce(r.ev #>> '{payload,full_name}', s.full_name), 'record_disagrees_with_signed_event', f.field, f.sealed, f.now_says
      from r join esign.envelope_signer s on s.id = r.signer_id
      cross join lateral (values
        ('full_name', r.ev #>> '{payload,full_name}', s.full_name, (r.ev #> '{payload}') ? 'full_name'),
        ('email', r.ev #>> '{payload,email}', s.email, (r.ev #> '{payload}') ? 'email'),
        ('typed_name', r.ev #>> '{payload,typed_name}', s.typed_name, (r.ev #> '{payload}') ? 'typed_name'),
        ('signature_image_file_id', r.ev #>> '{payload,signature_image_file_id}', s.signature_image_file_id::text, coalesce((r.ev ->> 'payload_version')::int, 1) >= 2),
        ('initials_image_file_id', r.ev #>> '{payload,initials_image_file_id}', s.initials_image_file_id::text, coalesce((r.ev ->> 'payload_version')::int, 1) >= 2),
        ('field_values', (r.ev -> 'final_values')::text, esign._plain_values(s.field_values)::text, r.ev ? 'final_values'),
        ('status', 'signed', s.status, true)
      ) as f(field, sealed, now_says, comparable)
     where f.comparable and f.sealed is distinct from f.now_says
       and not (f.field = 'field_values' and (r.ev -> 'final_values') = esign._plain_values(s.field_values))
    union all
    -- the certificate (if issued) names a signer differently from their signed event, or omits them
    select r.signer_id, r.ev #>> '{payload,full_name}',
           case when cr.rec is null then 'certificate_omits_signer' else 'certificate_disagrees_with_signed_event' end,
           case when cr.rec is not null then f.field end, case when cr.rec is not null then f.sealed end,
           case when cr.rec is not null then f.now_says end
      from r cross join cert
      left join lateral (select x as rec from jsonb_array_elements(coalesce(cert.payload -> 'recipients', cert.payload -> 'signers', '[]'::jsonb)) x
                          where x ->> 'id' = r.signer_id::text limit 1) cr on true
      cross join lateral (values
        ('full_name', r.ev #>> '{payload,full_name}', cr.rec ->> 'name'),
        ('email', r.ev #>> '{payload,email}', cr.rec ->> 'email'),
        ('typed_name', r.ev #>> '{payload,typed_name}', coalesce(cr.rec ->> 'typed_name',
            (select y ->> 'typed_name' from jsonb_array_elements(coalesce(cert.payload -> 'signers', '[]'::jsonb)) y where y ->> 'id' = r.signer_id::text limit 1)))
      ) as f(field, sealed, now_says)
     where (r.ev #> '{payload}') ? 'full_name'
       and (cr.rec is null or f.sealed is distinct from f.now_says)
  )
  select coalesce(jsonb_agg(distinct jsonb_strip_nulls(jsonb_build_object(
           'signer_id', signer_id, 'name', name, 'problem', problem, 'field', field,
           'sealed', case when field = 'field_values' then null else sealed end,
           'now_says', case when field = 'field_values' then null else now_says end))), '[]'::jsonb)
    from found
$function$;

CREATE OR REPLACE FUNCTION public.esign_verify_envelope(p_envelope_id uuid, p_observed jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; c esign.envelope_certificate%rowtype; k esign.signing_key%rowtype;
        d record; o jsonb; v_docs jsonb := '[]'::jsonb; v_mismatch int := 0; v_checked int := 0;
        v_recomputed text; v_cert jsonb; v_sig_ok boolean; v_disagree jsonb; v_changes jsonb; v_checked_signed int;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_verify_envelope: envelope %s does not exist', p_envelope_id));
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

  -- A1/A2 (fix round 2): every signed event against the live record and the certificate. A row
  -- rewritten or deleted after Sign, or a certificate that names a signer differently from what they
  -- sealed, makes the envelope NOT intact and is named here.
  v_disagree := esign._evidence_disagreements(p_envelope_id);
  select count(*) into v_checked_signed from esign._evidence_roster(p_envelope_id) r where r.ev is not null;
  select coalesce(jsonb_agg(jsonb_build_object('event', v.event_type, 'at', v.occurred_at, 'by', v.actor_label,
                                               'signer_id', v.signer_id, 'payload', v.payload) order by v.occurred_at), '[]'::jsonb)
    into v_changes
    from esign.envelope_event v
   where v.envelope_id = p_envelope_id and v.event_type in ('signer_removed', 'signer_record_changed');

  return jsonb_build_object(
    'granted', true, 'envelope_id', p_envelope_id, 'status', e.status,
    'documents_checked', v_checked, 'documents_mismatched', v_mismatch,
    'intact', v_mismatch = 0
             and coalesce((v_cert ->> 'payload_hash_matches')::boolean, true)
             and coalesce((v_cert ->> 'signature_verifies')::boolean, true)
             and jsonb_array_length(v_disagree) = 0,
    'documents', v_docs, 'certificate', v_cert,
    'evidence', jsonb_build_object('signed_records_checked', v_checked_signed,
                                   'disagreements', v_disagree, 'record_changes', v_changes));
end $function$;

-- F1 (verify A3): the sender's "Access code" choice is honoured — the send path keeps `access_code`
-- and the signer is asked for exactly the code the sender set. Off before, which silently replaced the
-- sender's choice with an emailed code. The sender opts in per recipient; the default stays open.
CREATE OR REPLACE FUNCTION esign._enforce(p_flag text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- §18: F1 access code (ON, fix round 2: a sender-chosen per-recipient option, like the emailed
  -- code under ruling F13), F2 required_fields_missing at Sign, F3 save_values shape refusals.
  -- F2 and F3 stay OFF until Arman approves them in his own words, with the date (law 12).
  select case p_flag when 'F1' then true when 'F2' then false when 'F3' then false else false end
$function$;

-- A6: a text value longer than its field allows is cut to the field's max length (default 4000,
-- the same ceiling _value_problem names). Callers that store it say so in their answer.
CREATE OR REPLACE FUNCTION esign._fit_value(p_field jsonb, p_v jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_v is null or jsonb_typeof(p_v) <> 'string' then p_v
    when coalesce(p_field ->> 'kind', '') in ('signature','initials','checkbox','radio','date','date_signed','number','dropdown') then p_v
    when length(p_v #>> '{}') > coalesce((p_field ->> 'max_length')::int, 4000)
      then to_jsonb(left(p_v #>> '{}', coalesce((p_field ->> 'max_length')::int, 4000)))
    else p_v end
$function$;

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
    -- A5 (loosening L5, as outsider_verify): the link is live, so say it is locked and until when.
    return jsonb_build_object('ok', false, 'reason', 'code_locked', 'locked_until', t.verification_locked_until,
                              'message', 'Too many tries. Try again later.');
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

CREATE OR REPLACE FUNCTION esign._act_save_values(p_ctx jsonb, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
-- §2.1/§2.2: per field, stored only when its seq is newer than the stored one; answers the stored
-- entries for the patched fields. After Sign every write is refused by _can_act (signer_signed).
declare s esign.envelope_signer%rowtype; v_can jsonb; v_mine jsonb; k text; p jsonb; f jsonb; x jsonb;
        v_fv jsonb; v_cur jsonb := '{}'::jsonb; v_ignored jsonb := '[]'::jsonb; v_prob text; v_seq numeric;
        v_missing jsonb; v_reason text; v_adjusted jsonb := '[]'::jsonb; v_fit jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  v_mine := esign._my_fields(s.id);
  v_fv := coalesce(s.field_values, '{}'::jsonb);
  for k, p in select key, value from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end) loop
    f := null;
    select y into f from jsonb_array_elements(v_mine) y where y ->> 'id' = k limit 1;
    v_reason := null;
    if f is null then
      v_reason := case when exists (
          select 1 from esign.envelope_document d,
                 jsonb_array_elements(case when jsonb_typeof(d.field_map -> 'fields') = 'array' then d.field_map -> 'fields' else '[]'::jsonb end) y
           where d.envelope_id = s.envelope_id and y ->> 'id' = k) then 'not_your_field' else 'unknown_field' end;
    elsif coalesce((f ->> 'read_only')::boolean, false) or (f ->> 'kind') = 'date_signed' then
      v_reason := 'field_read_only';
    else
      v_prob := esign._value_problem(f, p -> 'v');
      if v_prob is not null and esign._enforce('F3') then
        return jsonb_build_object('granted', false, 'reason', 'invalid_value',
                                  'field_id', k, 'expected', v_prob);
      end if;
    end if;
    if v_reason is not null then
      if esign._enforce('F3') then
        return jsonb_build_object('granted', false, 'reason', v_reason, 'field_id', k);
      end if;
      -- F3 is off: the value is not stored (it is not this signer's to fill) and the answer names it.
      v_ignored := v_ignored || jsonb_build_object('field_id', k, 'reason', v_reason);
      continue;
    end if;
    -- A6: over-long text is stored cut to the field's max length, and the answer names it.
    v_fit := esign._fit_value(f, p -> 'v');
    if v_fit is distinct from p -> 'v' then
      v_adjusted := v_adjusted || jsonb_build_object('field_id', k, 'reason', 'too_long',
                                                     'max_length', length(v_fit #>> '{}'));
      p := jsonb_set(p, '{v}', v_fit);
    end if;
    v_seq := coalesce((p ->> 'seq')::numeric, 0);
    if v_seq > coalesce((v_fv -> k ->> 'seq')::numeric, -1) then
      v_fv := v_fv || jsonb_build_object(k, jsonb_build_object('v', coalesce(p -> 'v', 'null'::jsonb), 'seq', v_seq, 'at', now()));
      if (f ->> 'kind') = 'radio' and p -> 'v' = 'true'::jsonb and nullif(f ->> 'group_id', '') is not null then
        for x in select y from jsonb_array_elements(v_mine) y
                  where y ->> 'group_id' = f ->> 'group_id' and y ->> 'id' <> k loop
          v_fv := v_fv || jsonb_build_object(x ->> 'id', jsonb_build_object('v', false, 'seq', v_seq, 'at', now()));
          v_cur := v_cur || jsonb_build_object(x ->> 'id', v_fv -> (x ->> 'id'));
        end loop;
      end if;
    end if;
    v_cur := v_cur || jsonb_build_object(k, v_fv -> k);
  end loop;

  perform esign._arm();
  update esign.envelope_signer set field_values = v_fv, values_saved_at = now() where id = s.id;
  perform esign._disarm();
  v_missing := esign._missing_required(s.id, esign._resolve_values(s.id, esign._plain_values(v_fv), null));
  return jsonb_build_object('granted', true, 'values_saved_at', now(),
                            'required_remaining', jsonb_array_length(v_missing),
                            'current', v_cur, 'ignored', v_ignored, 'adjusted', v_adjusted);
end $function$;

CREATE OR REPLACE FUNCTION esign._resolve_values(p_signer_id uuid, p_values jsonb, p_time_zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
-- §2.3 step 2: the final value of every field this signer fills.
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; f jsonb; v jsonb;
        v_out jsonb := '{}'::jsonb; v_zone text; v_today date; v_name text;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  select * into e from esign.envelope where id = s.envelope_id;
  v_zone := coalesce(nullif(p_time_zone, ''), s.metadata ->> 'time_zone', 'UTC');
  begin
    v_today := (now() at time zone v_zone)::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;
  v_name := btrim(coalesce(s.full_name, ''));
  for f in select * from jsonb_array_elements(esign._my_fields(p_signer_id)) loop
    v := coalesce(p_values, '{}'::jsonb) -> (f ->> 'id');
    if v = 'null'::jsonb then v := null; end if;
    if coalesce((f ->> 'read_only')::boolean, false) and f -> 'prefill' is not null and f -> 'prefill' <> 'null'::jsonb then
      v := f -> 'prefill';
    elsif (f ->> 'kind') = 'date_signed' then
      v := to_jsonb(esign._format_date(v_today, coalesce(f ->> 'date_format',
             e.config_snapshot ->> 'date_format_default', 'MM/DD/YYYY')));
    elsif (v is null or v = '""'::jsonb)
          and (f ->> 'kind') in ('full_name','first_name','last_name','email','company','title') then
      v := to_jsonb(case f ->> 'kind'
             when 'full_name'  then v_name
             when 'first_name' then case when position(' ' in v_name) > 0 then regexp_replace(v_name, '\s+\S+$', '') else v_name end
             when 'last_name'  then case when position(' ' in v_name) > 0 then substring(v_name from '(\S+)$') else '' end
             when 'email'      then coalesce(s.email, '')
             when 'company'    then coalesce(s.company, '')
             when 'title'      then coalesce(s.job_title, '') end);
      if coalesce(v #>> '{}', '') = '' and f -> 'prefill' is not null and f -> 'prefill' <> 'null'::jsonb then
        v := f -> 'prefill';
      end if;
    elsif v is null and f -> 'prefill' is not null and f -> 'prefill' <> 'null'::jsonb then
      v := f -> 'prefill';
    end if;
    v_out := v_out || jsonb_build_object(f ->> 'id', coalesce(esign._fit_value(f, v), 'null'::jsonb));   -- A6
  end loop;
  return v_out;
end $function$;

CREATE OR REPLACE FUNCTION esign._notify_actionable(p_envelope_id uuid, p_event_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s record; e esign.envelope%rowtype; v_n int := 0; v_tok jsonb; v_link text; v_key text;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  for s in select * from esign.envelope_signer
            where envelope_id = p_envelope_id and status in ('pending','notified','opened','viewed','consented','delivery_failed')
            order by position loop
    -- A7: a request to sign goes to whoever has not been told yet. Re-telling every parallel signer
    -- at each later signature re-sent their invitation, moved their Sent time and their reminders.
    if p_event_key = 'esign.signature_requested' and s.last_notified_at is not null and s.status <> 'delivery_failed' then
      continue;
    end if;
    if (esign._can_act(s.id) ->> 'can_act')::boolean then
      -- §8: a viewer is asked to review, never to sign.
      v_key := case when s.role = 'viewer' and p_event_key = 'esign.signature_requested'
                    then 'esign.review_requested' else p_event_key end;
      v_tok := null;
      if s.actor_type = 'internal_user' then
        -- §6.0 U-03: the internal signing route, outside the HR shell.
        v_link := '/sign/e/' || p_envelope_id::text;
        perform esign._notify(p_envelope_id, v_key, s.id, p_to_user => s.signer_user_id,
                              p_to_address => s.email,
                              p_subject => coalesce(e.title,'Signature requested'),
                              p_deep_link => v_link, p_channel => 'email');
      else
        if s.actor_token_id is null then
          v_tok := public.esign_mint_signer_token(s.id, null);
          if not coalesce((v_tok ->> 'granted')::boolean, false) then
            update esign.envelope_signer
               set status = 'delivery_failed', delivery_error = v_tok ->> 'reason'
             where id = s.id;
            perform esign._event(p_envelope_id, 'delivery_failed', 'automation', p_signer_id => s.id,
                                 p_payload => jsonb_build_object('reason', v_tok ->> 'reason'));
            continue;
          end if;
          -- §5.4: the secret travels in the URL FRAGMENT, never the path or the query string, so it
          -- cannot land in a web-server log, a proxy log or a Referer header.
          v_link := '/x/sign#t=' || (v_tok ->> 'secret');
        else
          v_link := null;   -- a resend that reuses the existing token re-sends the original link
        end if;
        perform esign._notify(p_envelope_id, v_key, s.id, p_to_address => s.email,
                              p_actor_token_id => coalesce((v_tok ->> 'actor_token_id')::uuid,
                                                           (select actor_token_id from esign.envelope_signer where id = s.id)),
                              p_subject => coalesce(e.title,'Signature requested'),
                              p_deep_link => v_link, p_channel => 'email');
      end if;
      update esign.envelope_signer
         set status = case when status = 'pending' then 'notified' else status end,
             last_notified_at = now(), notify_attempts = notify_attempts + 1,
             reminder_count = reminder_count + case when p_event_key = 'esign.signature_reminder' then 1 else 0 end
       where id = s.id;
      if p_event_key = 'esign.signature_reminder' then
        perform esign._event(p_envelope_id, 'reminded', 'automation', p_signer_id => s.id);
      end if;
      -- §9: whenever a signer is told, their reminders and expiry warning are (re)scheduled from
      -- THIS moment, carrying the link they now hold (no second secret). No link to carry (a
      -- resend that reused the token) keeps the schedule they already have.
      if s.role <> 'viewer' then
        perform esign._schedule_signer_notices(s.id, v_link);
      end if;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

-- Internal helpers: never a client door (they read across the envelope without an access check).
revoke execute on function esign._direct_writer_label() from public, anon, authenticated;
revoke execute on function esign._evidence_roster(uuid) from public, anon, authenticated;
revoke execute on function esign._evidence_disagreements(uuid) from public, anon, authenticated;
revoke execute on function esign._fit_value(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function esign._record_signer_removed() from public, anon, authenticated;
revoke execute on function esign._record_signer_changed() from public, anon, authenticated;

-- Access decisions, in data (§6d-4): three internal definers no client ever calls.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
 ('esign', '_direct_writer_label', '', array[]::oid[], 'no arguments; reads only the caller''s own auth.uid() address', 'esign_parity_17_the_evidence_is_the_record.sql',
  'server_only: called only inside the esign signer-row triggers to label a direct write in the ledger', false, false),
 ('esign', '_evidence_roster', 'p_envelope_id uuid', array['uuid'::regtype]::oid[], 'p_envelope_id is not checked here: every caller (certificate payload, verify) has already checked the envelope', 'esign_parity_17_the_evidence_is_the_record.sql',
  'server_only: called by esign._certificate_payload and esign._evidence_disagreements, never by a client', false, false),
 ('esign', '_evidence_disagreements', 'p_envelope_id uuid', array['uuid'::regtype]::oid[], 'p_envelope_id is not checked here: its only caller, esign_verify_envelope, checks _may_manage first', 'esign_parity_17_the_evidence_is_the_record.sql',
  'server_only: called by public.esign_verify_envelope after its own access check, never by a client', false, false);
