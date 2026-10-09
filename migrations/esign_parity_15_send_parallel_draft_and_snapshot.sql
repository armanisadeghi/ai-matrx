-- e-sign parity server part 3: (1) send of a PARALLEL draft answered 500 "position 1 is already taken on a
-- SEQUENTIAL envelope" - the envelope row kept the order it was created with while materialize wrote signer
-- rows for the draft's order; the order now lands first. (2) resolve_config_snapshot carries every section 5.6
-- key (materialize used to bolt five of them on). (3) L4: template documents are sendable by anyone who may
-- view the template.
-- based-on: esign.materialize_draft(uuid, jsonb) 050a9eac29171bfe6e6c8c56b28bfc7506e25597bf65a217832ad0b5c87eb2a2
-- based-on: esign.resolve_config_snapshot(uuid, text) c500220a521403cde0a7a3f130d378239ba11489ac6d6003535560f1e949967f
-- based-on: esign.sendable_file(uuid) d0ad79d8696d05eddc26b55e3ccdba4722e32d8d5122b4208de28354be306ee0
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
  -- The envelope row was created with the order it had then; the signer guard reads THAT column, so it
  -- must carry the draft's order before the first signer row lands (a parallel draft answered 500).
  update esign.envelope set signing_order = v_order where id = e.id;
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
    'sender_time_zone', c #> '{settings,sender_time_zone}'));
  update esign.envelope
     set title = coalesce(nullif(btrim(c ->> 'title'), ''), e.title), message = nullif(c ->> 'message', ''),
         email_subject = coalesce(nullif(btrim(c ->> 'email_subject'), ''), 'Please sign: ' || e.title),
         signing_order = v_order, expires_at = now() + make_interval(days => v_days),
         config_snapshot = v_snap, metadata = metadata - 'placeholder_until_send'
   where id = e.id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', e.id, 'documents', v_docs, 'signers', v_signers);
end $function$;

CREATE OR REPLACE FUNCTION esign.resolve_config_snapshot(p_organization_id uuid, p_sensitivity text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_factor jsonb; v_disc uuid;
begin
  v_factor := esign.config_resolve(p_organization_id, 'esign.outsider.verification.default_factor.esign_signer');
  -- §5.6 A: email_code is FORCED when the envelope is sensitive; the `none` escape exists only for
  -- standard envelopes, and the certificate records which factor actually applied.
  if p_sensitivity = 'sensitive' then v_factor := '"email_code"'::jsonb; end if;

  select id into v_disc from esign.consent_disclosure
   where deleted_at is null and is_current
     and (organization_id = p_organization_id or is_platform_default)
   order by (organization_id = p_organization_id) desc, effective_from desc limit 1;

  return jsonb_build_object(
    'resolved_at', now(),
    'expiry_days', esign.config_resolve(p_organization_id,
        case when p_sensitivity = 'sensitive' then 'esign.expiry_days.sensitive' else 'esign.expiry_days.standard' end),
    'reminder_cadence_days', esign.config_resolve(p_organization_id, 'esign.reminder.cadence_days'),
    'reminder_max_count',    esign.config_resolve(p_organization_id, 'esign.reminder.max_count'),
    'reminder_quiet_hours',  esign.config_resolve(p_organization_id, 'esign.reminder.quiet_hours'),
    'verification_factor',   v_factor,
    'consent_disclosure_id', to_jsonb(v_disc),
    'require_preview',       esign.config_resolve(p_organization_id, 'esign.consent.require_preview'),
    'hash_algorithm',        esign.config_resolve(p_organization_id, 'esign.hash.algorithm'),
    'allow_typed',           esign.config_resolve(p_organization_id, 'esign.signature.allow_typed'),
    'allow_drawn',           esign.config_resolve(p_organization_id, 'esign.signature.allow_drawn'),
    'delegation_allowed',    esign.config_resolve(p_organization_id, 'esign.delegation.allowed'),
    'download_url_ttl_seconds', esign.config_resolve(p_organization_id, 'esign.download.url_ttl_seconds'),
    'session_ttl_minutes',   esign.config_resolve(p_organization_id, 'esign.outsider.session.ttl_minutes.esign_signer'),
    'retention_trigger',     esign.config_resolve(p_organization_id, 'esign.retention.default_trigger'),
    'certificate_key_id',    to_jsonb((select key_id from esign.signing_key where is_current limit 1)),
    'allow_uploaded',        esign.config_resolve(p_organization_id, 'esign.signature.allow_uploaded'),
    'allow_phone',           esign.config_resolve(p_organization_id, 'esign.signature.allow_phone'),
    'fill_all_allowed',      esign.config_resolve(p_organization_id, 'esign.signature.fill_all_allowed'),
    'frame_on_copy',         esign.config_resolve(p_organization_id, 'esign.signature.frame_on_copy'),
    'envelope_id_on_pages',  esign.config_resolve(p_organization_id, 'esign.signed_copy.envelope_id_on_pages'),
    'expiry_warning_days',   esign.config_resolve(p_organization_id, 'esign.reminder.expiry_warning_days'),
    'form_view',             esign.config_resolve(p_organization_id, 'esign.signer.form_view'),
    'message_to_sender_allowed', esign.config_resolve(p_organization_id, 'esign.signer.message_to_sender'),
    'date_format_default',   esign.config_resolve(p_organization_id, 'esign.fields.date_format_default'),
    'branding', (select jsonb_build_object('organization_id', o.id, 'name', o.name, 'logo_url', o.logo_url)
                   from iam.organizations o where o.id = p_organization_id));
end $function$;

CREATE OR REPLACE FUNCTION esign.sendable_file(p_file_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
           'file_id', f.id, 'name', f.file_name, 'mime_type', f.mime_type,
           'version', coalesce(v.version_number, f.current_version, 1),
           'storage_uri', coalesce(v.storage_uri, f.storage_uri), 'size_bytes', f.size_bytes)
    from files.files f
    left join files.file_versions v on v.file_id = f.id and v.version_number = f.current_version
   where f.id = p_file_id
     and f.deleted_at is null
     and auth.uid() is not null
     and (f.created_by = auth.uid() or iam.has_access('file', f.id, 'viewer'::public.permission_level)
          or public.is_platform_admin()
          -- L4: a document named in a template the caller may view is sendable by that caller.
          or exists (select 1 from esign.template t
                      where t.deleted_at is null
                        and (t.created_by = auth.uid() or iam.has_access('esign_template', t.id, 'viewer'::public.permission_level))
                        and t.composition -> 'documents' @> jsonb_build_array(jsonb_build_object('file_id', f.id::text))));
$function$;

-- The snapshot resolver is an internal step of the send/create doors (it runs as the definer of THEIR authorised calls).
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal e-sign step; the organization id is the one the calling door already authorised for the caller.', 'esign_parity_15_send_parallel_draft_and_snapshot',
       'server_only: called only from inside the e-sign create, send and materialize doors after they authorise the caller; no client calls it directly', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) = ('esign', 'resolve_config_snapshot') and p.prosecdef
on conflict do nothing;
