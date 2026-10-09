-- e-sign parity fix round 2 (verify A3, sender verdict defect 3): an "Access code" recipient is sent
-- with the access code only when the sender set one. With none set (an API caller; the editor asks
-- for the code before Send) the emailed code stands in — never a link nobody can open — and aidream's
-- send answer carries the warning `access_code_not_set` for that recipient.
-- based-on: esign.materialize_draft(uuid, jsonb) 0add1c79455a2ac33b2c868af8adeb69e744a7963d15f31945914688325f831f
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
                     -- the sender's access code, when one was set; with none set there is no code to ask
                     -- for, so the emailed code stands in and the send answer names it (verify A3).
                     when r.v ->> 'verification' = 'access_code' and esign._enforce('F1')
                          and (select d.access_code_hashes ? (r.v ->> 'key') from esign.envelope_draft d where d.envelope_id = e.id)
                          then 'access_code'
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
