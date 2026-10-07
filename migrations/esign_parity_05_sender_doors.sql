-- chair-step: the only DELETE removes platform.client_callable_door rows whose function signature no longer exists (a door follows its function); no data row is deleted.
-- based-on: public.esign_envelope_state(uuid) 8cb9a4514232194bb6556704bda41c5eea7e9c24e5c191ac974bf7fab3ce82c0
-- based-on: public.esign_envelope_list(text, uuid, text, integer) adbf97229d2a50f35cf00524e6ce9b5d258bbf166e9bf1da74c8f68adf283199
-- E-signature parity, wave A, step 5 — the sender's doors (CONTRACT.md v2 §6.1, §12; decision A; A-F6,
-- A-F7, A-R9; coordinator amendment 2026-10-07: esign_draft_get answers {envelope:{id,status,
-- organization_id,title}, draft:{composition,revision,saved_at}}; template recipients may carry an
-- empty name/email when they carry a template_role).
-- SCHEMA: every new door lives in `esign` (nothing new may be created in public), so `esign` joins
-- PostgREST's exposed schemas at the end of this file; the browser calls supabase.schema('esign').rpc(…).
-- Reads follow the envelope's own access (esign._may_manage) — no new read rule (A-R9).

create or replace function esign._draft_problem(p_c jsonb, p_template boolean default false) returns text
language plpgsql immutable set search_path = pg_catalog as $$
-- §12.1 maxima; answers the JSON path of the first problem, or null.
declare r jsonb; i int := 0;
begin
  if jsonb_typeof(p_c) <> 'object' or coalesce((p_c ->> 'schema_version')::int, 0) <> 1 then return 'schema_version'; end if;
  if p_c::text ~ '"access_code"\s*:' then return 'access_code'; end if;   -- A-F6: codes never travel in a composition
  if length(coalesce(p_c ->> 'title', '')) > 300 then return 'title'; end if;
  if length(coalesce(p_c ->> 'email_subject', '')) > 200 then return 'email_subject'; end if;
  if length(coalesce(p_c ->> 'message', '')) > 4000 then return 'message'; end if;
  if jsonb_typeof(coalesce(p_c -> 'documents', '[]')) <> 'array' or jsonb_array_length(coalesce(p_c -> 'documents', '[]')) > 10 then return 'documents'; end if;
  if jsonb_typeof(coalesce(p_c -> 'recipients', '[]')) <> 'array' or jsonb_array_length(coalesce(p_c -> 'recipients', '[]')) > 20 then return 'recipients'; end if;
  if jsonb_typeof(coalesce(p_c -> 'fields', '[]')) <> 'array' or jsonb_array_length(coalesce(p_c -> 'fields', '[]')) > 500 then return 'fields'; end if;
  if jsonb_typeof(coalesce(p_c -> 'groups', '[]')) <> 'array' or jsonb_array_length(coalesce(p_c -> 'groups', '[]')) > 200 then return 'groups'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_c -> 'recipients', '[]')) loop
    if length(coalesce(r ->> 'private_message', '')) > 2000 then return format('recipients[%s].private_message', i); end if;
    if p_template and coalesce(btrim(r ->> 'template_role'), '') = '' then return format('recipients[%s].template_role', i); end if;
    i := i + 1;
  end loop;
  return null;
end $$;

create or replace function esign._default_composition(p_organization_id uuid, p_title text) returns jsonb
language plpgsql stable security definer set search_path = esign, public as $$
begin
  return jsonb_build_object(
    'schema_version', 1, 'title', coalesce(p_title, ''),
    'email_subject', 'Please sign: ' || coalesce(nullif(btrim(p_title), ''), 'your document'),
    'message', '', 'documents', '[]'::jsonb, 'recipients', '[]'::jsonb, 'fields', '[]'::jsonb, 'groups', '[]'::jsonb,
    'settings', jsonb_build_object(
      'signing_order', trim(both '"' from esign.config_resolve(p_organization_id, 'esign.signing_order.default')::text),
      'expires_in_days', (esign.config_resolve(p_organization_id, 'esign.expiry_days.standard'))::text::int,
      'reminders', jsonb_build_object('enabled', true,
                                      'cadence_days', esign.config_resolve(p_organization_id, 'esign.reminder.cadence_days')),
      'expiry_warning_days', (esign.config_resolve(p_organization_id, 'esign.reminder.expiry_warning_days'))::text::int,
      'allow_delegation', (esign.config_resolve(p_organization_id, 'esign.delegation.allowed'))::text::boolean,
      'allow_fill_all', (esign.config_resolve(p_organization_id, 'esign.signature.fill_all_allowed'))::text::boolean,
      'form_view', trim(both '"' from esign.config_resolve(p_organization_id, 'esign.signer.form_view')::text),
      'date_format_default', trim(both '"' from esign.config_resolve(p_organization_id, 'esign.fields.date_format_default')::text),
      'sender_time_zone', null));
end $$;

create or replace function esign.esign_draft_create(p_organization_id uuid, p_title text,
    p_template_id uuid default null, p_copy_of_envelope_id uuid default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare v_uid uuid := auth.uid(); v_comp jsonb; v_env uuid; v_cat uuid; t esign.template%rowtype; v_title text;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'not_authenticated'); end if;
  if p_organization_id is null or not esign.may_send_in(p_organization_id) then
    return jsonb_build_object('granted', false, 'reason', 'not_a_member');
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), 'Untitled');
  v_comp := esign._default_composition(p_organization_id, v_title);
  if p_template_id is not null then
    select * into t from esign.template where id = p_template_id and deleted_at is null;
    if not found or not (t.created_by = v_uid or iam.has_access('esign_template', t.id, 'viewer'::permission_level)) then
      return jsonb_build_object('granted', false, 'reason', 'template_not_found');
    end if;
    v_comp := t.composition || jsonb_build_object('title', v_title,
      'recipients', coalesce((select jsonb_agg(r || jsonb_build_object('has_access_code', false))
                                from jsonb_array_elements(coalesce(t.composition -> 'recipients', '[]')) r), '[]'::jsonb));
  elsif p_copy_of_envelope_id is not null then
    if not esign._may_manage(p_copy_of_envelope_id, 'viewer') then
      return jsonb_build_object('granted', false, 'reason', 'no_access');
    end if;
    select d.composition into v_comp from esign.envelope_draft d where d.envelope_id = p_copy_of_envelope_id;
    if v_comp is null then
      -- An envelope sent before drafts existed: its documents and recipients, no fields.
      select jsonb_build_object('documents', coalesce((select jsonb_agg(jsonb_build_object('key', x.id, 'file_id', coalesce(x.document_id, x.content_file_id),
                                   'name', x.name, 'page_count', x.page_count) order by x.position)
                                  from esign.envelope_document x where x.envelope_id = e.id), '[]'::jsonb),
                                'recipients', coalesce((select jsonb_agg(jsonb_build_object('key', s.id, 'role', case when s.role in ('signer','viewer','cc_recipient') then s.role else 'signer' end,
                                   'order', s.position, 'full_name', s.full_name, 'email', s.email, 'user_id', s.signer_user_id,
                                   'color_index', coalesce(s.color_index, s.position - 1), 'verification', 'none', 'has_access_code', false) order by s.position)
                                  from esign.envelope_signer s where s.envelope_id = e.id and s.status <> 'delegated'), '[]'::jsonb),
                                'message', coalesce(e.message, ''))
        into v_comp from esign.envelope e where e.id = p_copy_of_envelope_id;
      v_comp := esign._default_composition(p_organization_id, v_title) || v_comp;
    end if;
    v_comp := v_comp || jsonb_build_object('title', v_title,
      'recipients', coalesce((select jsonb_agg(r || jsonb_build_object('has_access_code', false))
                                from jsonb_array_elements(coalesce(v_comp -> 'recipients', '[]')) r), '[]'::jsonb));
  end if;

  select id into v_cat from platform.categories
   where dimension = 'esign_envelope_type' and slug = 'custom' and deleted_at is null
   order by (organization_id = p_organization_id) desc limit 1;
  perform esign._arm();
  -- A-F7: expires_at and the snapshot are PLACEHOLDERS until Send replaces both.
  insert into esign.envelope (organization_id, category_id, title, message, status, signing_order, consumer_key,
                              source_type, sensitivity, expires_at, config_snapshot, created_by, template_id,
                              copied_from_envelope_id, email_subject, metadata)
  values (p_organization_id, v_cat, v_title, nullif(v_comp ->> 'message', ''), 'draft',
          coalesce(v_comp #>> '{settings,signing_order}', 'sequential'), 'documents.send_for_signature',
          'files.file', 'standard', now() + interval '365 days',
          esign.resolve_config_snapshot(p_organization_id, 'standard'), v_uid, p_template_id, p_copy_of_envelope_id,
          v_comp ->> 'email_subject', jsonb_build_object('placeholder_until_send', jsonb_build_array('expires_at', 'config_snapshot')))
  returning id into v_env;
  insert into esign.envelope_draft (organization_id, envelope_id, composition, revision, saved_at, created_by)
  values (p_organization_id, v_env, v_comp, 0, now(), v_uid);
  perform esign._event(v_env, 'created', 'employee', p_actor_user_id => v_uid, p_actor_label => 'requester',
                       p_payload => jsonb_build_object('draft', true, 'template_id', p_template_id,
                                                       'copy_of', p_copy_of_envelope_id));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', v_env, 'revision', 0, 'composition', v_comp);
end $$;

create or replace function esign.esign_draft_get(p_envelope_id uuid) returns jsonb
language plpgsql stable security definer set search_path = esign, public as $$
declare e esign.envelope%rowtype; d esign.envelope_draft%rowtype;
begin
  select * into e from esign.envelope where id = p_envelope_id and deleted_at is null;
  if not found or not esign._may_manage(p_envelope_id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  select * into d from esign.envelope_draft where envelope_id = p_envelope_id;
  return jsonb_build_object('granted', true,
    'envelope', jsonb_build_object('id', e.id, 'status', e.status, 'organization_id', e.organization_id, 'title', e.title),
    'draft', case when d.id is null then null else jsonb_build_object('composition', d.composition, 'revision', d.revision,
                  'saved_at', d.saved_at,
                  'access_codes_set', coalesce((select jsonb_agg(k) from jsonb_object_keys(d.access_code_hashes) k), '[]'::jsonb)) end);
end $$;

create or replace function esign.esign_draft_save(p_envelope_id uuid, p_composition jsonb, p_base_revision int)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
-- Decision A: one non-versioned row per draft; no history row per save. Concurrency by revision.
declare e esign.envelope%rowtype; d esign.envelope_draft%rowtype; v_problem text;
begin
  select * into e from esign.envelope where id = p_envelope_id and deleted_at is null;
  if not found or not esign._may_manage(p_envelope_id, 'editor') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  if e.status <> 'draft' then return jsonb_build_object('granted', false, 'reason', 'not_draft'); end if;
  select * into d from esign.envelope_draft where envelope_id = p_envelope_id for update;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_draft'); end if;
  if p_base_revision is distinct from d.revision then
    return jsonb_build_object('granted', false, 'reason', 'stale_draft', 'revision', d.revision, 'composition', d.composition);
  end if;
  v_problem := esign._draft_problem(p_composition);
  if v_problem is not null then
    return jsonb_build_object('granted', false, 'reason', 'draft_invalid', 'path', v_problem);
  end if;
  update esign.envelope_draft set composition = p_composition, revision = revision + 1, saved_at = now()
   where id = d.id;
  -- The list shows the envelope's title; touch the (versioned) envelope only when the title moved.
  if coalesce(nullif(btrim(p_composition ->> 'title'), ''), 'Untitled') is distinct from e.title then
    perform esign._arm();
    update esign.envelope set title = coalesce(nullif(btrim(p_composition ->> 'title'), ''), 'Untitled') where id = e.id;
    perform esign._disarm();
  end if;
  return jsonb_build_object('granted', true, 'revision', d.revision + 1, 'saved_at', now());
end $$;

create or replace function esign.esign_draft_set_access_code(p_envelope_id uuid, p_recipient_key text, p_code text)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
-- §11 / A-F6: hashed on entry into the non-versioned draft row; never returned, never in history.
declare e esign.envelope%rowtype;
begin
  select * into e from esign.envelope where id = p_envelope_id and deleted_at is null;
  if not found or not esign._may_manage(p_envelope_id, 'editor') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  if e.status <> 'draft' then return jsonb_build_object('granted', false, 'reason', 'not_draft'); end if;
  if nullif(btrim(coalesce(p_code, '')), '') is null then
    update esign.envelope_draft set access_code_hashes = access_code_hashes - p_recipient_key where envelope_id = p_envelope_id;
    return jsonb_build_object('granted', true, 'has_access_code', false);
  end if;
  if length(btrim(p_code)) < 4 and esign._enforce('F1') then
    return jsonb_build_object('granted', false, 'reason', 'code_too_short');
  end if;
  update esign.envelope_draft
     set access_code_hashes = access_code_hashes || jsonb_build_object(p_recipient_key,
           encode(extensions.digest(btrim(p_code), 'sha256'), 'hex'))
   where envelope_id = p_envelope_id;
  return jsonb_build_object('granted', true, 'has_access_code', true);
end $$;

create or replace function esign.esign_draft_delete(p_envelope_id uuid) returns jsonb
language plpgsql security definer set search_path = esign, public as $$
declare e esign.envelope%rowtype;
begin
  select * into e from esign.envelope where id = p_envelope_id and deleted_at is null;
  if not found or not esign._may_manage(p_envelope_id, 'editor') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  if e.status <> 'draft' then return jsonb_build_object('granted', false, 'reason', 'not_draft'); end if;
  perform esign._arm();
  update esign.envelope set deleted_at = now() where id = e.id;
  perform esign._disarm();
  return jsonb_build_object('granted', true);
end $$;

create or replace function esign.materialize_draft(p_envelope_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = esign, public as $$
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
        full_name, email, auth_method, is_required, verification_factor, company, job_title, private_message, color_index)
    values (e.organization_id, e.id,
            case when v_order = 'sequential' then coalesce((r.v ->> 'order')::int, 1) else 1 end,
            coalesce(r.v ->> 'role', 'signer'), v_actor,
            case when v_actor = 'internal_user' then nullif(p_payload #>> array['recipients', r.v ->> 'key', 'user_id'], '')::uuid end,
            btrim(r.v ->> 'full_name'), lower(btrim(r.v ->> 'email')),
            case when v_actor = 'internal_user' then 'session' else 'token_link' end,
            coalesce(r.v ->> 'role', 'signer') <> 'cc_recipient', v_factor,
            nullif(r.v ->> 'company', ''), nullif(r.v ->> 'job_title', ''), nullif(r.v ->> 'private_message', ''),
            coalesce((r.v ->> 'color_index')::int, 0))
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
end $$;

-- ── templates (§12.2; REGISTER ruling R11) ───────────────────────────────────
create or replace function esign.esign_template_save(p_organization_id uuid, p_template_id uuid, p_name text,
    p_description text, p_composition jsonb, p_expected_version int default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare v_uid uuid := auth.uid(); t esign.template%rowtype; v_problem text; v_id uuid; v_comp jsonb;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'not_authenticated'); end if;
  v_problem := esign._draft_problem(p_composition, true);
  if v_problem is not null then return jsonb_build_object('granted', false, 'reason', 'template_invalid', 'path', v_problem); end if;
  if p_template_id is not null then
    select * into t from esign.template where id = p_template_id and deleted_at is null;
  end if;
  if t.id is null then
    if p_organization_id is null or not esign.may_send_in(p_organization_id) then
      return jsonb_build_object('granted', false, 'reason', 'not_a_member');
    end if;
    insert into esign.template (id, organization_id, name, description, composition, created_by)
    values (coalesce(p_template_id, gen_random_uuid()), p_organization_id, coalesce(nullif(btrim(p_name), ''), 'Untitled template'),
            p_description, p_composition, v_uid)
    returning id into v_id;
    return jsonb_build_object('granted', true, 'template_id', v_id, 'version', 1);
  end if;
  if not (t.created_by = v_uid or iam.has_access('esign_template', t.id, 'editor'::permission_level)) then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  if p_expected_version is not null and p_expected_version <> t.version then
    return jsonb_build_object('granted', false, 'reason', 'stale_template', 'version', t.version);
  end if;
  update esign.template set name = coalesce(nullif(btrim(p_name), ''), name), description = p_description,
                            composition = p_composition
   where id = t.id;
  return jsonb_build_object('granted', true, 'template_id', t.id, 'version', t.version + 1);
end $$;

create or replace function esign.esign_template_list(p_lane text default 'all', p_org_id uuid default null,
    p_search text default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = esign, public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'not_authenticated'); end if;
  return jsonb_build_object('granted', true, 'templates', coalesce((
    select jsonb_agg(x order by x.updated_at desc) from (
      select t.id, t.name, t.description, t.organization_id,
             (select o.name from iam.organizations o where o.id = t.organization_id) as organization_name,
             (t.created_by = v_uid or iam.has_access('esign_template', t.id, 'editor'::permission_level)) as i_manage,
             t.updated_at,
             coalesce((select jsonb_agg(jsonb_build_object('name', dd ->> 'name', 'page_count', dd -> 'page_count'))
                         from jsonb_array_elements(coalesce(t.composition -> 'documents', '[]')) dd), '[]'::jsonb) as documents,
             coalesce((select jsonb_agg(rr ->> 'template_role')
                         from jsonb_array_elements(coalesce(t.composition -> 'recipients', '[]')) rr), '[]'::jsonb) as roles
        from esign.template t
       where t.deleted_at is null
         and (t.created_by = v_uid or iam.has_access('esign_template', t.id, 'viewer'::permission_level))
         and (coalesce(p_lane, 'all') <> 'mine' or t.created_by = v_uid)
         and (p_org_id is null or t.organization_id = p_org_id)
         and (p_search is null or t.name ilike '%' || p_search || '%')
       order by t.updated_at desc
       limit least(greatest(coalesce(p_limit, 200), 1), 500)) x), '[]'::jsonb));
end $$;

create or replace function esign.esign_template_get(p_template_id uuid) returns jsonb
language plpgsql stable security definer set search_path = esign, public as $$
declare t esign.template%rowtype;
begin
  select * into t from esign.template where id = p_template_id and deleted_at is null;
  if not found or not (t.created_by = auth.uid() or iam.has_access('esign_template', t.id, 'viewer'::permission_level)) then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  return jsonb_build_object('granted', true, 'template', to_jsonb(t));
end $$;

create or replace function esign.esign_template_delete(p_template_id uuid) returns jsonb
language plpgsql security definer set search_path = esign, public as $$
declare t esign.template%rowtype;
begin
  select * into t from esign.template where id = p_template_id and deleted_at is null;
  if not found or not (t.created_by = auth.uid() or iam.has_access('esign_template', t.id, 'editor'::permission_level)) then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  update esign.template set deleted_at = now() where id = t.id;
  return jsonb_build_object('granted', true);
end $$;

-- ── saved signatures (§3.2) ──────────────────────────────────────────────────
create or replace function esign.saved_signature_create(p_user_id uuid, p_organization_id uuid, p_target text,
    p_kind text, p_typed_text text, p_typed_style text, p_image_file_id uuid, p_make_default boolean)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
-- The ONE creation path (A-F16): aidream's adopt {save_to_profile}, after the image is filed.
declare v_id uuid;
begin
  if coalesce(p_make_default, false) then
    update esign.saved_signature set is_default = false
     where created_by = p_user_id and target = p_target and is_default and deleted_at is null;
  end if;
  insert into esign.saved_signature (organization_id, created_by, target, kind, typed_text, typed_style, image_file_id, is_default)
  values (p_organization_id, p_user_id, p_target, p_kind, p_typed_text, p_typed_style, p_image_file_id, coalesce(p_make_default, false))
  returning id into v_id;
  return jsonb_build_object('granted', true, 'id', v_id);
end $$;

create or replace function esign.esign_saved_signatures() returns jsonb
language plpgsql stable security definer set search_path = esign, public as $$
begin
  if auth.uid() is null then return jsonb_build_object('granted', false, 'reason', 'not_authenticated'); end if;
  return jsonb_build_object('granted', true, 'signatures', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'target', s.target, 'kind', s.kind, 'typed_text', s.typed_text,
                       'typed_style', s.typed_style, 'image_file_id', s.image_file_id, 'is_default', s.is_default,
                       'label', s.label, 'created_at', s.created_at) order by s.is_default desc, s.created_at desc)
      from esign.saved_signature s where s.created_by = auth.uid() and s.deleted_at is null), '[]'::jsonb));
end $$;

create or replace function esign.esign_saved_signature_set_default(p_id uuid) returns jsonb
language plpgsql security definer set search_path = esign, public as $$
declare s esign.saved_signature%rowtype;
begin
  select * into s from esign.saved_signature where id = p_id and deleted_at is null;
  if not found or s.created_by is distinct from auth.uid() then return jsonb_build_object('granted', false, 'reason', 'no_access'); end if;
  update esign.saved_signature set is_default = false where created_by = s.created_by and target = s.target and is_default and id <> s.id;
  update esign.saved_signature set is_default = true where id = s.id;
  return jsonb_build_object('granted', true);
end $$;

create or replace function esign.esign_saved_signature_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = esign, public as $$
declare s esign.saved_signature%rowtype;
begin
  select * into s from esign.saved_signature where id = p_id and deleted_at is null;
  if not found or s.created_by is distinct from auth.uid() then return jsonb_build_object('granted', false, 'reason', 'no_access'); end if;
  update esign.saved_signature set deleted_at = now(), is_default = false where id = s.id;
  return jsonb_build_object('granted', true);
end $$;

CREATE OR REPLACE FUNCTION public.esign_envelope_state(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_envelope_state: envelope %s does not exist', p_envelope_id));
  end if;
  if not esign._may_manage(e.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  return jsonb_build_object(
    'granted', true,
    'envelope', to_jsonb(e) - 'config_snapshot',
    'config_snapshot', e.config_snapshot,
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers',   coalesce((select jsonb_agg(to_jsonb(s) - 'signature_payload_hash' order by s.position)
                             from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(v) order by v.occurred_at)
                             from esign.envelope_event v where v.envelope_id = e.id), '[]'::jsonb),
    -- e-sign parity §5.4 (+ coordinator amendment 2026-10-07): the draft, the schedule, progress, owed steps.
    'draft', (select jsonb_build_object('composition', d.composition, 'revision', d.revision, 'saved_at', d.saved_at)
                from esign.envelope_draft d where d.envelope_id = e.id),
    'scheduled_notices', coalesce((select jsonb_agg(jsonb_build_object('signer_id', n.payload ->> 'signer_id',
                                     'event_key', n.event_key, 'deliver_at', n.next_attempt_at, 'status', n.status,
                                     'sent_at', n.sent_at) order by n.next_attempt_at)
                                     from communication.notification n
                                    where n.target_kind = 'esign_envelope' and n.target_id = e.id and n.channel = 'email'
                                      and coalesce((n.metadata ->> 'esign_scheduled')::boolean, false)), '[]'::jsonb),
    'progress', coalesce((select jsonb_object_agg(s.id, jsonb_build_object(
                    'required_total', (select count(*) from jsonb_array_elements(esign._my_fields(s.id)) x
                                        where x ->> 'kind' <> 'date_signed' and nullif(x ->> 'group_id', '') is null),
                    'required_done', case when s.status in ('signed','acknowledged') then
                        (select count(*) from jsonb_array_elements(esign._my_fields(s.id)) x
                          where x ->> 'kind' <> 'date_signed' and nullif(x ->> 'group_id', '') is null)
                      else greatest((select count(*) from jsonb_array_elements(esign._my_fields(s.id)) x
                                      where x ->> 'kind' <> 'date_signed' and nullif(x ->> 'group_id', '') is null)
                           - jsonb_array_length(esign._missing_required(s.id, esign._resolve_values(s.id, esign._plain_values(s.field_values), null))), 0) end))
                  from esign.envelope_signer s where s.envelope_id = e.id and s.role <> 'cc_recipient'), '{}'::jsonb),
    'finalize', jsonb_build_object(
      'copies_owed', e.status = 'completed' and exists (select 1 from esign.envelope_document d
                                                          where d.envelope_id = e.id and d.metadata ->> 'signed_copy_file_id' is null),
      'certificate_owed', e.status = 'completed' and e.certificate_id is null,
      'emails_owed', false));
end $function$;

CREATE OR REPLACE FUNCTION public.esign_envelope_list(p_lane text DEFAULT 'all'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  end if;
  return jsonb_build_object('granted', true, 'envelopes', coalesce((
    select jsonb_agg(row_to_json(x) order by x.updated_at desc)
      from (
        select e.id, e.title, e.status, e.organization_id,
               (select o.name from iam.organizations o where o.id = e.organization_id) as organization_name,
               e.created_at, e.sent_at, e.completed_at, e.expires_at, e.voided_at, e.declined_at,
               greatest(e.updated_at, e.created_at) as updated_at,
               (e.created_by = v_uid or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level)) as i_manage,
               mine.id as my_signer_id,
               mine.status as my_signer_status,
               coalesce((esign._can_act(mine.id) ->> 'can_act')::boolean, false) as my_turn,
               (select count(*) from esign.envelope_signer s
                 where s.envelope_id = e.id and s.role <> 'cc_recipient') as signer_count,
               (select count(*) from esign.envelope_signer s
                 where s.envelope_id = e.id and s.status = 'signed') as signed_count,
               (select string_agg(s.full_name, ', ' order by s.position) from esign.envelope_signer s
                 where s.envelope_id = e.id) as signer_names,
               e.email_subject,
               coalesce((select jsonb_agg(jsonb_build_object('name', s.full_name, 'status', s.status, 'role', s.role) order by s.position)
                           from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb) as signers
          from esign.envelope e
          left join lateral (
            select s.id, s.status from esign.envelope_signer s
             where s.envelope_id = e.id and s.signer_user_id = v_uid
             order by s.position limit 1) mine on true
         where e.deleted_at is null
           -- e-sign parity §5.4: drafts are listed to whoever may manage them (never to a signer).
           and (e.status <> 'draft' or e.created_by = v_uid
                or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level))
           and (p_org_id is null or e.organization_id = p_org_id)
           and (p_search is null or e.title ilike '%' || p_search || '%')
           and case coalesce(p_lane, 'all')
                 when 'sent' then e.created_by = v_uid
                                  or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level)
                 when 'to_sign' then mine.id is not null
                 else e.created_by = v_uid or mine.id is not null
                      or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level)
               end
         order by greatest(e.updated_at, e.created_at) desc
         limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) x), '[]'::jsonb));
end $function$;

-- ── the browser reaches these doors: `esign` joins PostgREST's exposed schemas ─────────────
do $x$
declare v_cur text;
begin
  select substring(c from 'pgrst.db_schemas=(.*)$') into v_cur
    from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  if v_cur is not null and not (string_to_array(replace(v_cur, ' ', ''), ',') @> array['esign']) then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_cur || ',esign');
  end if;
end $x$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- ═══ DOORS (generated) ═══

-- Every new SECURITY DEFINER function declares who may call it (§5.8; provision_shape_guard).
delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('esign','_draft_problem'),
  ('esign','_default_composition'),
  ('esign','materialize_draft'),
  ('esign','saved_signature_create'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal e-sign step; every id argument is a row the calling door already authorised.', 'esign_parity_05_sender_doors',
       'server_only: called only by the aidream draft send and adopt routes on the service connection after authorising the caller; no client calls it directly', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('esign','_draft_problem'),
  ('esign','_default_composition'),
  ('esign','materialize_draft'),
  ('esign','saved_signature_create'))
   and p.prosecdef
on conflict do nothing;

delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('esign','esign_draft_create'),
  ('esign','esign_draft_get'),
  ('esign','esign_draft_save'),
  ('esign','esign_draft_set_access_code'),
  ('esign','esign_draft_delete'),
  ('esign','esign_template_save'),
  ('esign','esign_template_list'),
  ('esign','esign_template_get'),
  ('esign','esign_template_delete'),
  ('esign','esign_saved_signatures'),
  ('esign','esign_saved_signature_set_default'),
  ('esign','esign_saved_signature_delete'),
  ('public','esign_envelope_state'),
  ('public','esign_envelope_list'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, anonymous_purpose, argument_rules)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Signed-in door; every id argument is checked against the callers own access inside the function (CONTRACT.md v2 §6).', 'esign_parity_05_sender_doors', null, true, false,
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
  ('esign','esign_draft_create'),
  ('esign','esign_draft_get'),
  ('esign','esign_draft_save'),
  ('esign','esign_draft_set_access_code'),
  ('esign','esign_draft_delete'),
  ('esign','esign_template_save'),
  ('esign','esign_template_list'),
  ('esign','esign_template_get'),
  ('esign','esign_template_delete'),
  ('esign','esign_saved_signatures'),
  ('esign','esign_saved_signature_set_default'),
  ('esign','esign_saved_signature_delete'),
  ('public','esign_envelope_state'),
  ('public','esign_envelope_list'))
on conflict do nothing;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_draft_create' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_draft_get' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_draft_save' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_draft_set_access_code' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_draft_delete' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_template_save' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_template_list' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_template_get' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_template_delete' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_saved_signatures' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_saved_signature_set_default' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_saved_signature_delete' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esign_envelope_state' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esign_envelope_list' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
