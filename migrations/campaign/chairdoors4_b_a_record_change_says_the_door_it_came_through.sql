-- chair-step: this REPLACES the bodies of the three record-changed statement triggers (custom.io_record_changed_stmt_insert / _update / _delete: metadata.change gains one key, `via`) and of seven write doors (custom.form_submit, custom.portal_form_submit, custom.booking_hold, custom.booking_confirm, custom.booking_reschedule, custom.booking_cancel, custom.io_import_rows: exactly one `perform custom._write_via_mark(...)` line after `begin`, nothing else moves; same signatures, same SECURITY DEFINER, same grants), CREATES two internal SECURITY INVOKER helpers (custom._write_via_mark(text, boolean), custom.io_change_via(); EXECUTE revoked from PUBLIC, anon and authenticated), and DROPS and RECREATES the server-only door custom.record_changes_drain(uuid, text, integer) with one more output column `via` (same body otherwise, same door row, same grants: postgres only). No table, column, index, policy or data row is touched; no client grant is widened.
-- lane: CHAIR-DOORS (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 1d-a)
-- based-on: custom.io_record_changed_stmt_insert() c65e57663309b48ba47dafeaec000e79efdf677870333ca9f0e3fd58894042ee
-- based-on: custom.io_record_changed_stmt_update() 5d8a035e05982e9a2dc8ec6e523e12d784333d45468d20c3466b7b1b099c75d3
-- based-on: custom.io_record_changed_stmt_delete() 25ead2651c87562520f9d59d5cb3686f1852ac2ffd6c547854d9abec65fb9d80
-- based-on: custom.form_submit(uuid, text, jsonb, text, text, text) 554e3a94018e47e51620c1ef06aac8c04947a18ed1e84bdcccca77276b73d3be
-- based-on: custom.portal_form_submit(uuid, uuid, uuid, jsonb, text) c4df1625598f3e0d2073a9e457504264c2e44473e18bea3f33adfea6d44231c1
-- based-on: custom.booking_hold(uuid, text, text, text, text) 387202bc55ea92c0d739a26bfd32f19992a6340142cf0bb7871cc15b64994c02
-- based-on: custom.booking_confirm(uuid, uuid, text, jsonb, text, text, text) 17768d34475e59b58fa5f059872f36f7fae860a3890e7b30e1041d360ef216a4
-- based-on: custom.booking_reschedule(text, text, text, text) 41d14be1bad639d6255f4624a3643659d393cfb3601b18bf0921d5f0539f943a
-- based-on: custom.booking_cancel(text, text) c817c46addd43e17598d5a42c0b4304cbae97fe57250566ccd61ecf410b5e18d
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 2de44656c45d1e67941469241a9c3055257c2bf24ea41a3acb5c325a61763490
-- based-on: custom.record_changes_drain(uuid, text, integer) 5a6246c7b9e679696439002f7e788f190a0b7e196b90803749a2f5c2668d9af6
--
-- A RECORD CHANGE SAYS THE DOOR IT CAME THROUGH. The record-changed event on custom.io_outbox carried
-- created / updated / deleted and nothing about HOW, so the workflow builder refused "form answered"
-- and "booking made" (aidream workflow_builder/compiler.py NOT_EMITTED_EVENTS). This file adds ONE key
-- to the existing event — never a second event:
--
--   metadata.change.via = form | booking | import | agent | api | person
--
--   form     written through custom.form_submit or custom.portal_form_submit
--   booking  written through custom.booking_hold / booking_confirm / booking_reschedule / booking_cancel
--            (a confirm goes through form_submit inside; form_submit keeps an outer door's word)
--   import   written through custom.io_import_rows
--   agent    no door mark; the actor chain declares an agent (platform.declared_actor_tier = agent)
--   person   no door mark; a signed-in person's own browser (platform.is_client_channel, tier user)
--   api      no door mark; anything else the server wrote (REST v1, the MCP, a workflow step, a job)
--
-- Read off the channel and the door, never claimed by a row: the mark is a transaction-local setting
-- only the doors set (custom._write_via_mark, no client EXECUTE), read once per statement by the
-- three statement triggers beside the actor (custom.io_change_via). The server hook
-- matrx_records.record_changes exposes it as RecordChange.via (custom.record_changes_drain gains the
-- column), and matrx_graph.db.store_change.refusal_for matches a trigger's `via` (form.answered takes
-- only form, booking.made only booking).
--
-- Proof (clone, rolled back, one transaction): custom.record_write as admin@admin.com through the client
-- channel, as the server, and as a declared agent; one custom.form_submit and one custom.booking_hold +
-- booking_confirm as a visitor: the outbox rows say person, api, agent, form, booking (the hold and the
-- booked record). See the campaign report.
-- Inverse: migrations/inverse/chairdoors4_b_a_record_change_says_the_door_it_came_through_down.sql

-- THE MARK: a door says which door it is, transaction-local (one PostgREST call is one transaction).
-- A door sets its word; custom.form_submit alone KEEPS an outer door's word (p_keep_outer), because a
-- booking confirms through it and the change came through the booking. Internal: no client may call
-- it — set_config is no client door, and a browser that could mark its own write "form" would be
-- lying to every trigger that filters on it.
CREATE OR REPLACE FUNCTION custom._write_via_mark(p_via text, p_keep_outer boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_via is null or p_via not in ('form', 'booking', 'import') then
    raise exception 'custom._write_via_mark: "%" is not a door word.', coalesce(p_via, 'null')
      using errcode = '22023', hint = 'The doors that mark themselves are form, booking and import. Nothing was written.';
  end if;
  if p_keep_outer and nullif(current_setting('custom.write_via', true), '') is not null then
    return;
  end if;
  perform set_config('custom.write_via', p_via, true);
end
$function$;
revoke execute on function custom._write_via_mark(text, boolean) from public, anon, authenticated;

-- THE WORD ON THE EVENT: the mark when a door set one; otherwise read off the channel, never
-- claimed — a declared agent is `agent`; a signed-in person's own browser (platform.is_client_channel,
-- tier user) is `person`; everything else the server wrote (REST v1, the MCP, a workflow step, a
-- scheduled job) is `api`. Exactly the six words lane 11's trigger filter matches.
CREATE OR REPLACE FUNCTION custom.io_change_via()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mark text := nullif(current_setting('custom.write_via', true), '');
  v_tier text;
begin
  if v_mark in ('form', 'booking', 'import') then
    return v_mark;
  end if;
  v_tier := coalesce(platform.declared_actor_tier(), platform.actor_tier());
  if v_tier = 'agent' then
    return 'agent';
  end if;
  if v_tier = 'user' and platform.is_client_channel() then
    return 'person';
  end if;
  return 'api';
end
$function$;
revoke execute on function custom.io_change_via() from public, anon, authenticated;

-- ── THE THREE STATEMENT TRIGGERS ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_via   text;
  v_op    uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING. A fact about the connection, not about the row.
  v_actor := custom.io_change_actor();
  -- THE DOOR IT CAME THROUGH (CHAIR-DOORS-4): once per statement, like the actor.
  v_via   := custom.io_change_via();
  v_op := nullif(current_setting('custom.op_id', true), '')::uuid;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
  with changed as (
    select n.organization_id, n.id, n.table_id, n.data, n.version,
           custom.io_changed_keys('{}'::jsonb, n.data) as keys
      from new_rows n
  )
  select c.organization_id, 'records.changed', c.id, c.table_id, 'created',
         case when coalesce(array_length(c.keys, 1), 0) = 0
              then '[]'::jsonb
              else coalesce((select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
                               from unnest(c.keys) k
                               join custom.applicable_fields(c.organization_id, c.table_id, null) f
                                 on (f.data ->> 'key') = k), '[]'::jsonb) end,
         v_actor || jsonb_build_object('declared', coalesce(c.data, '{}'::jsonb) ->> '_actor'),
         c.organization_id::text || ':' || c.id::text || ':' || coalesce(c.version, 0)::text || ':created',
         v_op,
         jsonb_build_object('change', jsonb_build_object(
           'kind',    'create',
           'version', c.version,
           'fields',  custom.io_change_fields(c.keys, '{}'::jsonb, c.data),
           'via',     v_via))
    from changed c
   order by c.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_via   text;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING, once per statement (it was asked once per row).
  v_actor := custom.io_change_actor();
  -- THE DOOR IT CAME THROUGH (CHAIR-DOORS-4): once per statement, like the actor.
  v_via   := custom.io_change_via();

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
  select n.organization_id, 'records.changed', n.id, n.table_id, k.op,
         -- The row trigger's `v_changed`, character for character: `[]` when no key moved,
         -- otherwise the field ids of (old.data -> new.data) — the old side is `old.data`
         -- whenever tg_op is UPDATE, which is every row here, including the restore arm.
         case when coalesce(array_length(k.keys, 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     o.data, coalesce(n.data, '{}'::jsonb)) end,
         v_actor || jsonb_build_object('declared', coalesce(n.data, o.data) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' ||
           coalesce(n.version, o.version, 0)::text || ':' || k.op,
         nullif(current_setting('custom.op_id', true), '')::uuid,
         jsonb_build_object('change', jsonb_build_object(
           'kind',    k.kind,
           'version', coalesce(n.version, o.version),
           'fields',  custom.io_change_fields(k.keys, o.data, n.data),
           'via',     v_via))
    from new_rows n
    join old_rows o
      on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral (
      select
        -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
        -- when a record disappeared would be lying in the one case people notice.
        case when n.deleted_at is not null and o.deleted_at is null then 'deleted'
             when o.deleted_at is not null and n.deleted_at is null then 'created'
             else 'updated' end as op,
        -- THE KIND tells what `op` cannot: an archive from a purge, a restore from a create.
        case when n.deleted_at is not null and o.deleted_at is null then 'archive'
             when o.deleted_at is not null and n.deleted_at is null then 'restore'
             else 'update' end as kind,
        case when n.deleted_at is not null and o.deleted_at is null then array[]::text[]
             when o.deleted_at is not null and n.deleted_at is null
               then custom.io_changed_keys('{}'::jsonb, n.data)
             else custom.io_changed_keys(o.data, n.data) end as keys) k
   -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field ids.
   where not (k.op = 'updated'
              and coalesce(array_length(k.keys, 1), 0) = 0
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_via   text;
begin
  for v_org in select distinct o.organization_id from old_rows o loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  v_actor := custom.io_change_actor();
  -- THE DOOR IT CAME THROUGH (CHAIR-DOORS-4): once per statement, like the actor.
  v_via   := custom.io_change_via();

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
  select o.organization_id, 'records.changed', o.id, o.table_id, 'deleted',
         -- On a delete `v_keys` is empty by construction, so the answer is `[]` whatever the
         -- join would have done — and asking anyway made a deletion event depend on the caller
         -- still being allowed to READ the Table.
         '[]'::jsonb,
         v_actor || jsonb_build_object('declared', o.data ->> '_actor'),
         o.organization_id::text || ':' || o.id::text || ':' || coalesce(o.version, 0)::text || ':deleted',
         nullif(current_setting('custom.op_id', true), '')::uuid,
         -- A HARD DELETE (the retention purge) is its own kind; no field "changed", the row is gone.
         jsonb_build_object('change', jsonb_build_object(
           'kind', 'delete', 'version', o.version, 'fields', '{}'::jsonb, 'via', v_via))
    from old_rows o
   order by o.id
  on conflict do nothing;

  return null;
end;
$function$;

-- ── THE SEVEN DOORS THAT MARK THEMSELVES ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.form_submit(p_form_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text DEFAULT NULL::text, p_client_key text DEFAULT NULL::text)
 RETURNS TABLE(submission_id uuid, record_id uuid, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f        custom.anon_form;
  v_count    bigint;
  v_exposed  text[];
  v_required text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_id       uuid;
  v_rec      uuid;
  v_file     uuid;
  v_sigs     jsonb := '{}'::jsonb;
  v_held     text;
  v_stood    boolean := false;
begin
  perform custom._write_via_mark('form', true);  -- CHAIR-DOORS-4: the change event says it came through a form door (a booking confirming through here keeps its word)
  if p_form_id is null then
    raise exception 'This form is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This form is not available.'
      using errcode = '23503',
            hint = 'The link names no form. It may have been mistyped, or the form may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.form_submit');

  -- CLOSED BY DEFAULT, the same three words custom.anon_write says.
  if v_f.published_at is null then
    raise exception 'This form is not accepting responses.'
      using errcode = '42501',
            hint = 'It exists but has never been published. Whoever owns it publishes it; until then nothing can be submitted, which is the point of the default.';
  end if;
  if v_f.closed_at is not null then
    submission_id := null; record_id := null; state := 'closed';
    message := 'This form is closed, so it is not taking any more answers.';
    return next; return;
  end if;

  -- THE DECOY, ANSWERED FIRST AND ANSWERED CHEERFULLY. See this file's header, decision 5.
  if v_f.honeypot_key is not null and coalesce(btrim(p_honeypot), '') <> '' then
    insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                        raw_payload, client_key, state, remote_origin,
                                        rejection_reason)
    values (v_f.organization_id, v_f.id, v_f.table_id, 'form', '{}'::jsonb,
            jsonb_build_object('form_id', v_f.id, 'at', now(), 'origin', p_origin,
                               'honeypot', true),
            p_client_key, 'rejected', p_origin,
            format('The decoy field "%s" was filled in, which a person answering this form never does. Nothing was written and the sender was shown the thank-you screen.',
                   v_f.honeypot_key))
    returning id into v_id;
    submission_id := v_id; record_id := null; state := 'accepted';
    message := null; return next; return;
  end if;

  -- IDEMPOTENCY BEFORE RATE, so a replay costs no budget and makes no second row.
  if p_client_key is not null then
    select s.id, s.record_id into v_existing, v_rec from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.form_id = v_f.id
       and s.client_key = p_client_key;
    if v_existing is not null then
      submission_id := v_existing; record_id := v_rec; state := 'accepted';
      message := 'This answer had already arrived, so it was not written twice.';
      return next; return;
    end if;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    submission_id := null; record_id := null; state := 'full';
    message := 'This form has all the answers it was set up to take.';
    return next; return;
  end if;

  -- THE RATE LIMIT, on the bucket the SERVER chose (a coarse client identifier). A
  -- browser choosing its own bucket would be counting itself.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    submission_id := null; record_id := null; state := 'too_many';
    message := 'That is more answers than this form takes in one go. Try again in a little while.';
    return next; return;
  end;

  -- SCOPE. A key the form does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one error beside a form with twenty questions.';
  end if;

  -- A DRAWN SIGNATURE IS A FILE (lane VIEWS-AND-FIELDS; CHAIR-DOORS-1, 2026-10-02), exactly as
  -- custom.sign_request_sign keeps one: a File record (REC-27) holding the drawing, in the form's
  -- organization, and the Value's envelope naming it as `signature_file_id`. The Value itself is the
  -- word "Signed" — a drawn form signature carries no typed name, and the drawing is not copied into
  -- the record. Only an answer to a Signature column (custom.doc_signature_field_ok) that is a drawing
  -- (the same data: URL shape sign_request_sign accepts) is turned into a File; every other answer
  -- passes unchanged. The File is written on behalf of the form's publisher when nobody is signed in
  -- (a stranger on the public form), the same stand-in custom.anon_clear takes, put back on every path.
  for v_key in select k from jsonb_object_keys(v_doc) k loop
    continue when jsonb_typeof(v_doc -> v_key) <> 'string'
               or (v_doc ->> v_key) !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]{64,}$';
    continue when not exists (
      select 1 from custom.record fd
       where fd.organization_id = v_f.organization_id
         and fd.table_id = custom.field_kernel_id()
         and fd.deleted_at is null
         and (fd.data ->> 'entity_definition_id')::uuid = v_f.table_id
         and fd.data ->> 'key' = v_key
         and custom.doc_signature_field_ok(fd.data));
    if not v_stood and custom.query_principal() is null and v_f.published_by is not null then
      v_held := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text, true);
      v_stood := true;
    end if;
    begin
      insert into custom.record (organization_id, table_id, data_class, data)
      values (v_f.organization_id, custom.file_kernel_id(), 'record', jsonb_build_object(
        'name',      format('Signature on %s', coalesce(nullif(btrim(v_f.title), ''), 'a form')),
        'mime_type', split_part(split_part(v_doc ->> v_key, ';', 1), ':', 2),
        'content',   v_doc ->> v_key,
        'byte_size', length(v_doc ->> v_key),
        'kind',      'signature'))
      returning id into v_file;
    exception when others then
      if v_stood then
        perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
      end if;
      raise;
    end;
    v_sigs := v_sigs || jsonb_build_object(v_key, jsonb_build_object('src', jsonb_build_object(
      'kind', 'signature', 'mark', 'drawn', 'signature_file_id', v_file,
      'signed_at', now(), 'via', 'form', 'form_id', v_f.id)));
    v_doc := v_doc || jsonb_build_object(v_key, 'Signed');
  end loop;
  if v_stood then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  end if;
  if v_sigs <> '{}'::jsonb then
    v_doc := v_doc || jsonb_build_object('_values', v_sigs);
  end if;

  -- QUARANTINE. `custom.record` is not touched here, and the provenance travels with the
  -- submission so the record made from it can always say where it came from.
  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin)
  values (v_f.organization_id, v_f.id, v_f.table_id, 'form', v_doc,
          jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                             'form_version', v_f.version, 'at', now(),
                             'origin', p_origin, 'via', 'form'),
          p_client_key, 'quarantined', p_origin)
  returning id into v_id;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, captured_at)
    values (v_f.organization_id, p_client_key, v_f.table_id, v_id, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  -- S7': THE STRANGER'S SAVED PLACE IS USED UP BY THE ANSWER IT BECAME. When the page saved
  -- progress for this person it sends that saved place's key as the client key, so the one
  -- send that turns the answers into a submission also marks the saved place sent, in this
  -- same transaction. Its answers are emptied — they live in the submission now, and a second
  -- copy of somebody's intake answers kept for a month would be a copy nobody asked for.
  if p_client_key is not null then
    update custom.anon_form_draft d
       set submitted_at = now(), submission_id = v_id, answers = '{}'::jsonb
     where d.organization_id = v_f.organization_id
       and d.form_id = v_f.id
       and d.secret_hash = encode(extensions.digest(p_client_key, 'sha256'), 'hex')
       and d.submitted_at is null
       and d.deleted_at is null;
  end if;

  -- THE ACCEPT RULE. With one, the answer becomes a record now; with none, it waits for a
  -- person and this function SAYS SO instead of implying it landed.
  if v_f.quarantine_rule_id is not null then
    v_rec := custom.anon_clear(v_f.organization_id, v_id);
  end if;

  if v_rec is not null then
    perform custom.form_notify(v_f.organization_id, v_f.id, v_rec, v_id);
    submission_id := v_id; record_id := v_rec; state := 'accepted'; message := null;
  elsif v_f.quarantine_rule_id is null then
    submission_id := v_id; record_id := null; state := 'held';
    message := 'Your answer arrived and is waiting for someone to look at it.';
  else
    select s.rejection_reason into message from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.id = v_id;
    submission_id := v_id; record_id := null; state := 'held';
    message := coalesce(message, 'Your answer arrived and is waiting for someone to look at it.');
  end if;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.portal_form_submit(p_organization_id uuid, p_portal_id uuid, p_form_id uuid, p_payload jsonb, p_client_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pp       custom.portal_principal;
  v_p        custom.portal;
  v_f        custom.anon_form;
  v_names    text;
  v_exposed  text[];
  v_required text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_rec      uuid;
  v_id       uuid;
  v_count    bigint;
  v_held     text;
  v_stood    boolean := false;
  v_msg      text;
begin
  perform custom._write_via_mark('form');  -- CHAIR-DOORS-4: the change event says it came through a form door
  -- A CLIENT IS TOLD IN A CLIENT'S WORDS. `assert_store_door`'s refusal is written for the
  -- business ("open Database Settings … turn it back on", "the role that owns custom.record") and
  -- would reach a property manager on her own portal; `store_off_sentence` is the one the portal's
  -- sign-in page already shows her. The store door still runs after it, for every other refusal.
  if not custom.store_is_open(p_organization_id) then
    raise exception '%', custom.store_off_sentence(p_organization_id) using errcode = '42501';
  end if;
  perform custom.assert_store_door(p_organization_id, 'custom.portal_form_submit');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_form_submit');
  v_pp := custom._portal_principal_here(p_organization_id, p_portal_id, 'custom.portal_form_submit');
  select * into v_p from custom.portal where id = v_pp.portal_id;

  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if v_f.id is null or not exists (
       select 1 from jsonb_array_elements(coalesce(v_p.config -> 'forms', '[]'::jsonb)) e(v)
        where e.v ->> 'form_id' = p_form_id::text) then
    raise exception 'That form is not on your portal.'
      using errcode = '02000', hint = 'Go back to your portal: the forms you can send are listed there.';
  end if;
  select pt.edge_role into v_names from custom.portal_table pt
   where pt.portal_id = v_p.id and pt.table_id = v_f.table_id;
  if v_names is null then
    -- custom.portal_declare refuses this state; a table taken off the portal outside it still
    -- says so rather than writing a record that would never reach her.
    raise exception 'That form puts its answers in a table this portal no longer shows, so it cannot be sent from here.'
      using errcode = '22023', hint = 'The business has to put the table back on the portal, or take the form off it.';
  end if;

  if v_f.closed_at is not null then
    return jsonb_build_object('submission_id', null, 'record_id', null, 'state', 'closed',
             'message', 'This form is closed, so it is not taking any more answers.');
  end if;

  -- IDEMPOTENCY BEFORE RATE, so a replay costs no budget and makes no second row.
  if p_client_key is not null then
    select s.id, s.record_id into v_existing, v_rec from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.form_id = v_f.id
       and s.client_key = p_client_key and s.deleted_at is null;
    if v_existing is not null then
      return jsonb_build_object('submission_id', v_existing, 'record_id', v_rec, 'state', 'accepted',
               'message', 'This had already arrived, so it was not sent twice.');
    end if;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    return jsonb_build_object('submission_id', null, 'record_id', null, 'state', 'full',
             'message', 'This form has all the answers it was set up to take.');
  end if;

  -- THE RATE LIMIT, on a bucket that is THIS person on THIS portal — the store's own choice.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id, 'portal:' || v_pp.id::text, null);
  exception when sqlstate '53400' then
    return jsonb_build_object('submission_id', null, 'record_id', null, 'state', 'too_many',
             'message', 'That is more than this form takes in one go. Try again in a little while.');
  end;

  -- SCOPE. A key the form does not ask for is refused BY NAME, never trimmed in silence — and the
  -- Field that says which client this is for is the portal's, never hers to fill.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if v_key = v_names then
      raise exception 'Which client this is for is decided by the portal, not by the form, so "%" cannot be filled in here.', v_key
        using errcode = '42501', hint = 'Leave it out: the portal fills it with your own record.';
    end if;
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(array_remove(v_exposed, v_names), ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where k is distinct from v_names
     and coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one error beside a form with twenty questions.';
  end if;

  -- THE PORTAL NAMES THE CLIENT.
  v_doc := v_doc || jsonb_build_object(v_names, v_pp.client_record_id::text);

  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin)
  values (v_f.organization_id, v_f.id, v_f.table_id, 'portal', v_doc,
          jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                             'form_version', v_f.version, 'at', now(), 'via', 'portal',
                             'portal_id', v_p.id, 'principal_id', v_pp.id,
                             'client_record_id', v_pp.client_record_id),
          p_client_key, 'quarantined', 'portal:' || v_p.slug)
  returning id into v_id;

  -- WHO WRITES IT: the person who declared this portal. They were judged at `admin` on every
  -- Table it shows, and she was not — she holds her own records, not the Table. The stand-in is
  -- put back on every exit path.
  if v_p.created_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_p.created_by, 'role', 'authenticated')::text, true);
    v_stood := true;
  end if;
  begin
    if v_f.quarantine_rule_id is not null then
      -- The form's own Rule decides, exactly as it decides a stranger's.
      v_rec := custom.anon_clear(v_f.organization_id, v_id);
    else
      -- No Rule: the invitation already said who this is. It lands now.
      v_rec := custom.record_write(
                 v_f.organization_id, v_f.table_id,
                 v_doc
                   || jsonb_build_object('_actor', 'system')
                   || jsonb_build_object('_source', jsonb_build_object(
                        'via',           'portal',
                        'form_id',       v_f.id,
                        'form_version',  v_f.version,
                        'submission_id', v_id,
                        'portal_id',     v_p.id,
                        'principal_id',  v_pp.id,
                        'at',            to_char(now() at time zone 'utc',
                                                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
      update custom.anon_submission
         set state = 'cleared', record_id = v_rec, cleared_at = now()
       where organization_id = v_f.organization_id and id = v_id;
    end if;
  exception when others then
    if v_stood then
      perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    end if;
    raise;
  end;
  if v_stood then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  end if;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, record_id, captured_at)
    values (v_f.organization_id, p_client_key, v_f.table_id, v_id, v_rec, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  if v_rec is not null then
    perform custom.form_notify(v_f.organization_id, v_f.id, v_rec, v_id);
    return jsonb_build_object('submission_id', v_id, 'record_id', v_rec, 'state', 'accepted',
             'message', null);
  end if;
  select s.rejection_reason, s.state into v_msg, v_key from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.id = v_id;
  return jsonb_build_object('submission_id', v_id, 'record_id', null,
           'state', case when v_key = 'rejected' then 'rejected' else 'held' end,
           'message', coalesce(v_msg, 'It arrived and is waiting for someone to look at it.'));
end $function$;

CREATE OR REPLACE FUNCTION custom.booking_hold(p_form_id uuid, p_slot_key text, p_origin text, p_bucket text, p_client_key text DEFAULT NULL::text)
 RETURNS TABLE(hold_id uuid, slot_key text, expires_at timestamp with time zone, member_user_id uuid, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_who   uuid;
  v_found boolean := false;
  v_held  text;
  v_stood boolean := false;
  v_out   jsonb;
  v_ttl   interval;
begin
  perform custom._write_via_mark('booking');  -- CHAIR-DOORS-4: the change event says it came through a booking door
  if p_form_id is null then
    raise exception 'This booking page is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This booking page is not available.'
      using errcode = '23503',
            hint = 'The link names no booking page. It may have been mistyped, or it may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.booking_hold');
  if v_f.published_at is null then
    raise exception 'This booking page is not taking appointments.'
      using errcode = '42501',
            hint = 'It exists but has never been published. Whoever owns it publishes it; until then nothing can be booked, which is the point of the default.';
  end if;
  if v_f.closed_at is not null then
    hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := null;
    state := 'closed';
    message := 'This booking page is closed, so it is not taking any more appointments.';
    return next; return;
  end if;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'This link is a form, not a booking page, so there is no time to hold.'
      using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;
  v_ttl := make_interval(mins => coalesce((v_b ->> 'hold_minutes')::integer, 15));

  -- THE SLOT HAS TO BE ONE THIS PAGE ACTUALLY OFFERS. The same generator the picker was
  -- drawn from, asked again here — so a key typed into a console, a time inside the lead
  -- time, and a time past the daily cap are all refused in exactly the same sentence.
  select true, s.member_user_id into v_found, v_who
    from custom._booking_slots(v_b, null) s
   where s.slot_key = p_slot_key
   limit 1;
  if not coalesce(v_found, false) then
    hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := null;
    state := 'not_offered';
    message := 'That time is not one this page offers. Pick one of the times shown — the list is the offer, and it moves as appointments are taken.';
    return next; return;
  end if;

  -- THE RATE LIMIT, on the bucket the SERVER chose. Holding is a write, and a hold is
  -- what takes a slot away from everybody else, so it is budgeted like a submission.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := null;
    state := 'too_many';
    message := 'That is more times than this page holds in one go. Try again in a little while.';
    return next; return;
  end;

  -- ── AGT-N-5: the principal of an unattended run is the person who set it up ───────
  -- custom.work_slot_hold asks custom.assert_client_may_change, which reads auth.uid().
  -- A stranger has no principal, so this door stands in as the publisher — whom
  -- custom.anon_publish already required to hold ADMIN on the Table — for that one call,
  -- and puts the session back on every path including the exception one.
  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;

  begin
    -- THE HOLDER IS THE BUCKET, AND THE BUCKET IS THE SERVER'S. See this file's header.
    v_out := custom.work_slot_hold(v_f.organization_id, v_slots, p_slot_key,
                                   coalesce(nullif(btrim(p_bucket), ''), 'visitor'),
                                   v_ttl);
  exception
    when unique_violation then
      -- THE LOSING HALF OF A RACE, AND THE DATABASE DECIDED IT. REC-71's unique index
      -- refused the second hold; this is that refusal translated into a sentence a person
      -- can act on. It is NOT a spinner, NOT the next slot chosen for them, and NOT a
      -- booking they believe they have.
      if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
      hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := v_who;
      state := 'taken';
      message := 'Somebody took that time a moment before you did, so it is no longer free. Nothing was booked — pick another time and the rest of your details are still here.';
      return next; return;
    when others then
      if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
      raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  hold_id := (v_out ->> 'hold_id')::uuid;
  slot_key := p_slot_key;
  expires_at := (v_out ->> 'expires_at')::timestamptz;
  member_user_id := v_who;
  state := 'held';
  message := null;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.booking_confirm(p_form_id uuid, p_hold_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text DEFAULT NULL::text, p_client_key text DEFAULT NULL::text)
 RETURNS TABLE(booking_ref text, record_id uuid, submission_id uuid, slot_key text, slot_at timestamp with time zone, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_hold  custom.record;
  v_key   text;
  v_who   uuid;
  v_ref   text;
  v_sub   record;
  v_held  text;
  v_stood boolean := false;
  v_end   timestamptz;
  v_at    timestamptz;
  v_dup   text;
begin
  perform custom._write_via_mark('booking');  -- CHAIR-DOORS-4: the change event says it came through a booking door
  if p_form_id is null then
    raise exception 'This booking page is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This booking page is not available.' using errcode = '23503';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.booking_confirm');
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'This link is a form, not a booking page.' using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  -- THE THREE THE STORE FILLS IN ARE REFUSED FROM THE BROWSER, by name. Otherwise the
  -- time on the record and the time that was held could be two different times.
  for v_dup in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if v_dup in ('slot', 'status', 'booked_with') then
      raise exception 'A booking never sends "%": it comes from the time that was held.', v_dup
        using errcode = '42501',
              hint = 'slot, status and booked_with are the store''s. Send only the answers to the questions the page asked.';
    end if;
  end loop;

  -- THE HOLD IS THE RIGHT TO THIS SLOT, and it has to be live and it has to be this
  -- caller's. A confirm with somebody else's hold id would book their slot in your name.
  select * into v_hold from custom.record r
   where r.organization_id = v_f.organization_id
     and r.table_id = v_slots
     and r.id = p_hold_id
     and r.deleted_at is null;
  if not found then
    booking_ref := null; record_id := null; submission_id := null; slot_key := null;
    slot_at := null; state := 'hold_lost';
    message := 'The time you were holding was let go before you sent your details, so nothing was booked. Pick a time again — it takes a moment and your answers are still here.';
    return next; return;
  end if;
  if coalesce((v_hold.data ->> 'expires_at')::timestamptz, now()) <= now() then
    booking_ref := null; record_id := null; submission_id := null;
    slot_key := v_hold.data ->> 'slot_key'; slot_at := null; state := 'hold_expired';
    message := 'The time you were holding ran out before you sent your details, so nothing was booked. Pick a time again.';
    return next; return;
  end if;
  -- THE BUCKET, NOT THE CLIENT KEY. See this file's header: the client key is a
  -- per-submission replay key and is a DIFFERENT string on the confirm than it was on the
  -- hold, so comparing it refused every real browser its own hold.
  if coalesce(v_hold.data ->> 'holder', '') <> coalesce(nullif(btrim(p_bucket), ''), 'visitor') then
    raise exception 'That time is being held by somebody else, so it cannot be booked from here.'
      using errcode = '42501',
            hint = 'A hold belongs to whoever took it. Pick a time on this page and it will be held for you.';
  end if;

  v_key := v_hold.data ->> 'slot_key';
  v_at := v_key::timestamptz;
  select s.member_user_id into v_who from custom._booking_slots(v_b, null) s
   where s.slot_key = v_key limit 1;

  -- THE ANSWERS GO THROUGH THE FORM DOOR — the honeypot, the idempotency, the cap, the
  -- rate limit, the scope check, the required check, the quarantine, the accept Rule and
  -- the notify Rule are DOOR-17's and are not rebuilt here. The slot travels WITH the
  -- answers, so the record is complete the first time anybody sees it.
  select * into v_sub from custom.form_submit(
    p_form_id, p_origin,
    coalesce(p_payload, '{}'::jsonb)
      || jsonb_build_object('slot', v_key, 'status', 'booked',
                            'booked_with', coalesce(v_who::text, '')),
    p_bucket, p_honeypot, p_client_key);

  if v_sub.record_id is null then
    -- HELD, REJECTED, CLOSED OR FULL — the store's own sentence, and the slot is let go
    -- rather than kept by somebody who does not have a booking.
    if v_sub.state in ('closed', 'full', 'too_many') then
      perform custom._booking_release(v_f.organization_id, v_f.published_by, p_hold_id);
    end if;
    booking_ref := null; record_id := null; submission_id := v_sub.submission_id;
    slot_key := v_key; slot_at := v_at; state := v_sub.state;
    message := coalesce(v_sub.message,
      'Your details were sent and are waiting for someone to confirm them, so this time is not yours yet. Whoever owns this page will be in touch.');
    return next; return;
  end if;

  -- ── THE CALENDAR HOLD. The same hold, kept until the appointment is OVER ───────────
  -- REC-71's sweep frees a hold when its expiry passes, so a booking's hold simply
  -- expires at the end of its own appointment. There is no second calendar to disagree
  -- with the bookings table.
  v_end := v_at + make_interval(mins => (v_b ->> 'slot_minutes')::integer);
  v_ref := encode(extensions.gen_random_bytes(16), 'hex');

  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;
  begin
    perform custom.record_update(v_f.organization_id, p_hold_id, jsonb_build_object(
      'expires_at', to_char(v_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      '_actor', 'system'));
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  update custom.anon_submission
     set booking_ref = v_ref
   where organization_id = v_f.organization_id and id = v_sub.submission_id;

  booking_ref := v_ref; record_id := v_sub.record_id; submission_id := v_sub.submission_id;
  slot_key := v_key; slot_at := v_at; state := 'booked'; message := null;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.booking_reschedule(p_booking_ref text, p_slot_key text, p_origin text, p_bucket text DEFAULT NULL::text)
 RETURNS TABLE(booking_ref text, record_id uuid, slot_key text, slot_at timestamp with time zone, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_s      custom.anon_submission;
  v_f      custom.anon_form;
  v_b      jsonb;
  v_slots  uuid;
  v_doc    jsonb;
  v_old    text;
  v_oldrow custom.record;
  v_found  boolean := false;
  v_who    uuid;
  v_new    uuid;
  v_end    timestamptz;
  v_at     timestamptz;
  v_held   text;
  v_stood  boolean := false;
begin
  perform custom._write_via_mark('booking');  -- CHAIR-DOORS-4: the change event says it came through a booking door
  if p_booking_ref is null then
    raise exception 'That link does not name an appointment.' using errcode = '23503';
  end if;
  select * into v_s from custom.anon_submission sub where sub.booking_ref = p_booking_ref;
  if not found then
    raise exception 'That link does not name an appointment.'
      using errcode = '23503',
            hint = 'It may have been mistyped, or the appointment may have been removed.';
  end if;
  perform custom.assert_store_door(v_s.organization_id, 'custom.booking_reschedule');
  select * into v_f from custom.anon_form
   where organization_id = v_s.organization_id and id = v_s.form_id and deleted_at is null;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'That link is a form response, not an appointment.' using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  select r.data into v_doc from custom.record r
   where r.organization_id = v_s.organization_id and r.id = v_s.record_id and r.deleted_at is null;
  if v_doc is null then
    booking_ref := p_booking_ref; record_id := null; slot_key := null; slot_at := null;
    state := 'held';
    message := 'Your details are still waiting for someone to confirm them, so there is nothing to move yet.';
    return next; return;
  end if;
  if coalesce(v_doc ->> 'status', 'booked') = 'cancelled' then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := null; slot_at := null;
    state := 'cancelled';
    message := 'This appointment was cancelled, so there is nothing to move. Book a new time on the booking page.';
    return next; return;
  end if;
  v_old := v_doc ->> 'slot';

  if p_slot_key = v_old then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
    slot_at := v_old::timestamptz; state := 'unchanged';
    message := 'That is the time you already have, so nothing was moved.';
    return next; return;
  end if;

  select true, s.member_user_id into v_found, v_who
    from custom._booking_slots(v_b, null) s where s.slot_key = p_slot_key limit 1;
  if not coalesce(v_found, false) then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
    slot_at := v_old::timestamptz; state := 'not_offered';
    message := 'That time is not one this page offers, so your appointment was not moved. Pick one of the times shown.';
    return next; return;
  end if;

  v_at := p_slot_key::timestamptz;
  v_end := v_at + make_interval(mins => (v_b ->> 'slot_minutes')::integer);

  -- THE NEW HOLD IS TAKEN BEFORE THE OLD ONE IS LET GO. The other order frees a slot,
  -- loses the race for the new one, and leaves a booking with no time at all.
  select * into v_oldrow from custom.record r
   where r.organization_id = v_s.organization_id and r.table_id = v_slots
     and r.deleted_at is null and r.data ->> 'slot_key' = coalesce(v_old, '')
   limit 1;

  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;

  begin
    begin
      v_new := (custom.work_slot_hold(v_s.organization_id, v_slots, p_slot_key,
                                      coalesce(v_oldrow.data ->> 'holder', 'visitor'),
                                      make_interval(mins => 15)) ->> 'hold_id')::uuid;
    exception when unique_violation then
      if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
      booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
      slot_at := v_old::timestamptz; state := 'taken';
      message := 'Somebody took that time a moment before you did, so your appointment was not moved and you still have the time you had. Pick another.';
      return next; return;
    end;

    -- BOTH HALVES, IN ONE TRANSACTION. The record's time and the calendar hold are the
    -- same fact said twice, and a move that changed one of them would be a booking the
    -- calendar disagrees with.
    perform custom.record_update(v_s.organization_id, v_new, jsonb_build_object(
      'expires_at', to_char(v_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      '_actor', 'system'));
    if v_oldrow.id is not null then
      perform custom.work_slot_release(v_s.organization_id, v_oldrow.id);
    end if;
    perform custom.record_update(v_s.organization_id, v_s.record_id, jsonb_build_object(
      'slot', p_slot_key, 'status', 'booked',
      'booked_with', coalesce(v_who::text, ''), '_actor', 'system'));
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  perform custom.booking_notify(v_s.organization_id, v_f.id, v_s.record_id, v_s.id,
                                'moved', to_char(v_at at time zone (v_b ->> 'timezone'),
                                                 'FMDay FMDD FMMonth at FMHH12:MIam'));

  booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := p_slot_key;
  slot_at := v_at; state := 'moved'; message := null;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.booking_cancel(p_booking_ref text, p_origin text DEFAULT NULL::text)
 RETURNS TABLE(booking_ref text, record_id uuid, slot_key text, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_s     custom.anon_submission;
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_doc   jsonb;
  v_old   text;
  v_row   custom.record;
  v_held  text;
  v_stood boolean := false;
begin
  perform custom._write_via_mark('booking');  -- CHAIR-DOORS-4: the change event says it came through a booking door
  if p_booking_ref is null then
    raise exception 'That link does not name an appointment.' using errcode = '23503';
  end if;
  select * into v_s from custom.anon_submission sub where sub.booking_ref = p_booking_ref;
  if not found then
    raise exception 'That link does not name an appointment.' using errcode = '23503';
  end if;
  perform custom.assert_store_door(v_s.organization_id, 'custom.booking_cancel');
  select * into v_f from custom.anon_form
   where organization_id = v_s.organization_id and id = v_s.form_id and deleted_at is null;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'That link is a form response, not an appointment.' using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  select r.data into v_doc from custom.record r
   where r.organization_id = v_s.organization_id and r.id = v_s.record_id and r.deleted_at is null;
  if v_doc is null then
    booking_ref := p_booking_ref; record_id := null; slot_key := null; state := 'held';
    message := 'Your details are still waiting for someone to confirm them, so there is no appointment to cancel.';
    return next; return;
  end if;
  if coalesce(v_doc ->> 'status', 'booked') = 'cancelled' then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_doc ->> 'slot';
    state := 'cancelled';
    message := 'This appointment was already cancelled, so nothing changed.';
    return next; return;
  end if;
  v_old := v_doc ->> 'slot';

  select * into v_row from custom.record r
   where r.organization_id = v_s.organization_id and r.table_id = v_slots
     and r.deleted_at is null and r.data ->> 'slot_key' = coalesce(v_old, '')
   limit 1;

  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;
  begin
    -- THE BOOKING IS KEPT AND MARKED, NEVER DELETED. A cancelled appointment is something
    -- the owner has to be able to see, count and chase; deleting it would make an hour
    -- that was lost look like an hour nobody asked for.
    perform custom.record_update(v_s.organization_id, v_s.record_id,
                                 jsonb_build_object('status', 'cancelled', '_actor', 'system'));
    if v_row.id is not null then
      perform custom.work_slot_release(v_s.organization_id, v_row.id);
    end if;
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  perform custom.booking_notify(
    v_s.organization_id, v_f.id, v_s.record_id, v_s.id, 'cancelled',
    coalesce(to_char(v_old::timestamptz at time zone (v_b ->> 'timezone'),
                     'FMDay FMDD FMMonth at FMHH12:MIam'), 'an unknown time'));

  booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
  state := 'cancelled'; message := 'This appointment is cancelled and that time is free again.';
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_keep    constant integer := 500;   -- the cap on kept refusals / duplicates, said out loud
  v_run     custom.io_import;
  v_map     jsonb;
  v_fields  jsonb := '{}'::jsonb;      -- field key -> the Field document
  v_f       record;
  v_row     jsonb;
  v_doc     jsonb;
  v_values  jsonb;
  v_src     jsonb;
  v_key     text;
  v_val     jsonb;
  v_word    text;
  v_mapped  text;
  v_cell    jsonb;
  v_order   text;
  v_dk      text;
  v_dkvals  text[];
  v_exist   jsonb := '{}'::jsonb;      -- duplicate-key value -> the record already holding it
  v_seen    integer := 0;
  v_landed  integer := 0;
  v_dupes   integer := 0;
  v_bad     integer := 0;
  v_out     jsonb := '[]'::jsonb;      -- this batch's per-row outcomes
  v_ref     jsonb := '[]'::jsonb;
  v_dup     jsonb := '[]'::jsonb;
  v_unmap   jsonb := '{}'::jsonb;
  v_props   jsonb := '[]'::jsonb;
  v_patch   jsonb;
  v_reason  text;
  v_index   integer;
  v_mode    text;
  v_made    jsonb := '[]'::jsonb;      -- the columns this call had to declare after all
  v_decl    jsonb;
  -- THE PLAN. One entry per row of this batch, in file order, decided before anything is
  -- written; `ord` is a row's place in the batched statement, which is also where its id is.
  v_plan    jsonb := '[]'::jsonb;
  v_entry   jsonb;
  v_ord     integer := 0;
  v_docs    jsonb[] := array[]::jsonb[];
  v_ids     uuid[] := array[]::uuid[];
  v_id      uuid;
  v_fell    text := null;              -- why the batched statement was refused, if it was
  v_failed  jsonb := '{}'::jsonb;      -- ord -> why THAT row could not be written on its own
  -- THE UNIQUE RULE, HELD INSIDE THE BATCH (see the migration header, (c)).
  v_uq      text[] := array[]::text[]; -- the keys of the columns carrying a unique rule
  v_uqlab   jsonb := '{}'::jsonb;      -- key -> the word a person reads
  v_uqseen  jsonb := '{}'::jsonb;      -- "key|lowered value" -> the row that took it
  v_u       text;
  -- IMPORT-2: how long the WRITING phase of this call took, and what that makes a comfortable
  -- number of rows for the next one. Measured, never assumed.
  c_comfort numeric;                   -- the milliseconds of MEASURED writing work a call aims at:
                                       -- HALF of knob copy/max_auth_lock_ms (lane FOLLOW-BATCH-2;
                                       -- it was a fixed 2000). Every call locks the sign-in table
                                       -- from its first insert to its COMMIT (each row names who
                                       -- created it), so a call is a step of a copy; half leaves
                                       -- room for the outcome phase after the writes and for a
                                       -- database that gets twice as busy between two calls.
  v_t0      timestamptz;
  v_wrote   numeric;
  v_perrow  numeric;
  v_next    integer;
  -- B4-03 (2026-09-30): THE VALUES OF A COLUMN THAT WAITS FOR APPROVAL WAIT WITH IT. This batch's
  -- record id -> {header: the pasted word} for every landed row; merged below into each waiting
  -- proposal as `values` (record id -> word), at most `c_hold_max` per column, and a column that
  -- had more says so (`values_cut`).
  c_hold_max constant integer := 20000;
  v_hold    jsonb := '{}'::jsonb;
  v_rest    jsonb;
begin
  perform custom._write_via_mark('import');  -- CHAIR-DOORS-4: the change event says it came through a import door
  c_comfort := greatest(100, 0.5 * (platform.knob_resolve('copy', 'max_auth_lock_ms', p_organization_id) #>> '{}')::numeric);
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_rows');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');

  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here to add rows to.'
      using errcode = '23503',
            hint = 'Open one with custom.io_import_begin first. Nothing was written.';
  end if;
  if v_run.state = 'finished' then
    raise exception 'That import is finished, so no more rows go into it.' using errcode = '23514',
            hint = 'Start a new import for the rest of the file. Nothing was written.',
            detail = jsonb_build_object('finished_at', coalesce(v_run.finished_at, v_run.updated_at))::text;
  end if;
  -- THE RUNG, ON THE TABLE THIS RUN BELONGS TO, on every batch.
  -- KINDS-GLUE N-C6 (CHAIR-DOORS-2): ADDING a record is the editor rung on the Table, except on a
  -- Table the app keeps for agent outputs, where every member who may see it may add (viewer);
  -- changing a record already there is still decided on that record, so a member edits only her own.
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_rows',
                                          custom.table_add_rung(p_organization_id, v_run.table_id), 'table');

  v_map   := coalesce(v_run.mapping, '{}'::jsonb) || coalesce(p_mapping, '{}'::jsonb);
  v_order := lower(coalesce(nullif(v_run.policy ->> 'date_order', ''), 'mdy'));
  v_dk    := nullif(btrim(coalesce(v_run.dedupe_key, '')), '');
  v_mode  := lower(coalesce(nullif(v_run.policy ->> 'unmapped', ''), 'propose'));

  -- ── THE COLUMNS. A run whose wizard took the `io_import_declare_columns` step finds every
  --    column already here and declares NOTHING; a caller that skipped it still lands its
  --    rows, because FIX-10B's pre-pass is the safety net rather than the normal path.
  if v_mode = 'create' then
    v_decl := custom._io_declare_unmapped(p_organization_id, v_run.table_id, p_rows, v_map);
    v_map  := v_decl -> 'mapping';
    v_made := (select coalesce(jsonb_agg(c || jsonb_build_object('import_id', p_import_id::text)), '[]'::jsonb)
                 from jsonb_array_elements(v_decl -> 'columns_added') c);
  end if;

  -- THE TABLE'S OWN COLUMNS, READ ONCE FOR THE WHOLE BATCH — after any declaration above, so
  -- the batch is written against what the table actually has.
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
    if exists (select 1 from jsonb_array_elements(coalesce(v_f.data -> 'rules', '[]'::jsonb)) x
                where x ->> 'kind' = 'unique') then
      v_uq    := v_uq || (v_f.data ->> 'key');
      v_uqlab := v_uqlab || jsonb_build_object(v_f.data ->> 'key',
                              coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key'));
    end if;
  end loop;

  -- WHAT IS ALREADY HERE, for exactly the key values this batch carries.
  if v_dk is not null then
    select array_agg(distinct w) into v_dkvals
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r,
           lateral (select btrim(coalesce(
                      r.value ->> coalesce((select k from jsonb_each_text(v_map) m(k, val) where val = v_dk limit 1), v_dk),
                      r.value ->> v_dk, '')) as w) s
     where s.w <> '';
    if v_dkvals is not null and cardinality(v_dkvals) > 0 then
      select coalesce(jsonb_object_agg(t.w, t.id), '{}'::jsonb) into v_exist
        from (select r.data ->> v_dk as w, min(r.id::text) as id
                from custom.record r
               where r.organization_id = p_organization_id
                 and r.table_id = v_run.table_id
                 and r.data_class = 'record'
                 and r.deleted_at is null
                 and r.data ->> v_dk = any (v_dkvals)
               group by 1) t;
    end if;
  end if;

  -- THE SOURCE EVERY VALUE OF THIS RUN POINTS AT.
  v_src := jsonb_strip_nulls(jsonb_build_object(
             'kind',      'import',
             'import_id', p_import_id::text,
             'file',      v_run.source_name,
             'hash',      v_run.file_hash,
             'format',    v_run.format));

  -- ══ PHASE ONE — THE PLAN. Nothing is written here. ═══════════════════════════════════════
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen  := v_seen + 1;
    v_index := coalesce(v_run.rows_seen, 0) + v_seen;
    v_doc   := '{}'::jsonb;
    v_values:= '{}'::jsonb;
    v_reason:= null;

    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      v_mapped := coalesce(v_map ->> v_key,
                           case when v_fields ? v_key then v_key else null end);
      if v_mapped is null then
        -- SCR-N-7: not an error, an OFFER.
        v_unmap := v_unmap || jsonb_build_object(
          v_key, coalesce(v_unmap -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmap -> v_key, '[]'::jsonb)) < 12
                        and coalesce(v_val #>> '{}', '') <> ''
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
        continue;
      end if;
      if not (v_fields ? v_mapped) then
        v_reason := format('This table has no column called "%s", so "%s" has nowhere to go.', v_mapped, v_key);
        exit;
      end if;
      v_word := v_val #>> '{}';
      -- LANE 4 N2: A TYPED VALUE STAYS TYPED. Records that arrive as `rows` carry numbers, booleans,
      -- lists and objects as themselves; reading them back through words would turn a list into its
      -- JSON text. Words (strings) still go through io_cell, so a choice label, an email in a person
      -- column and a relation's title resolve exactly as a file's do, and a worked-out or file column
      -- is refused by io_cell's own sentence whatever the value's type. The write path validates.
      if v_run.format = 'rows' and jsonb_typeof(v_val) in ('number', 'boolean', 'array', 'object')
         and coalesce(custom.parity_type(v_fields -> v_mapped), v_fields -> v_mapped ->> 'type')
             not in ('formula', 'lookup', 'rollup', 'attachment') then
        v_cell := jsonb_build_object('ok', true, 'value', v_val);
      else
        v_cell := custom.io_cell(p_organization_id, v_fields -> v_mapped,
                                 case when v_run.format = 'rows' and jsonb_typeof(v_val) <> 'string'
                                      then coalesce(v_word, '') else v_word end, v_order);
      end if;
      if not (v_cell ->> 'ok')::boolean then
        v_reason := v_cell ->> 'reason';
        exit;
      end if;
      if coalesce((v_cell ->> 'skip')::boolean, false) then
        continue;
      end if;
      v_doc    := v_doc    || jsonb_build_object(v_mapped, v_cell -> 'value');
      v_values := v_values || jsonb_build_object(v_mapped, jsonb_build_object('src', v_src));
    end loop;

    -- LIMITS-FIX 2026-09-21: A ROW WITH NOTHING IN IT IS NOT A RECORD.
    if v_reason is null and v_doc = '{}'::jsonb then
      v_reason := case
        when jsonb_typeof(v_row) = 'object' and (select count(*) from jsonb_object_keys(v_row)) = 0
          then 'This row is empty, so there is nothing to save.'
        when v_unmap = '{}'::jsonb
          then 'Every column in this row was blank, so there is nothing to save.'
        else format('None of this row''s columns go anywhere in this table, so there is nothing to save. Unmatched: %s.',
                    (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_unmap) k))
      end;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    -- ALREADY HERE? The duplicate key decides, and the policy decides what that means.
    -- A key this batch has already PLANNED counts, exactly as a key it had already written
    -- counted before — `v_exist` carries `pending:<ord>` for those, because the id is minted
    -- in the plan and `custom.record_write_many` gives the rows back in input order.
    if v_dk is not null then
      v_word := v_doc ->> v_dk;
      if v_word is not null and v_exist ? v_word then
        v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                    'kind', 'duplicate', 'row', v_index, 'key', v_word,
                    'hit', v_exist ->> v_word, 'doc', v_doc, 'values', v_values, 'source', v_row));
        continue;
      end if;
    end if;

    -- THE UNIQUE RULE, INSIDE THIS BATCH. custom._unique_rule_holds asks custom.record, and a
    -- row written earlier in the SAME statement is not there to be found, so the door holds
    -- the line for the batch with that trigger's own sentence and SQLSTATE. Anything this
    -- batch cannot see — another session, an earlier batch, a record already here — is still
    -- the trigger's to refuse.
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u = '' then continue; end if;
        if v_uqseen ? (v_key || '|' || v_u) then
          v_reason := format('Another record here already has %s "%s", and %s has to be different on every record.',
                             v_uqlab ->> v_key, btrim(v_word), v_uqlab ->> v_key);
          exit;
        end if;
      end loop;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    v_ord  := v_ord + 1;
    v_id   := gen_random_uuid();
    v_ids  := v_ids  || v_id;
    v_docs := v_docs || (
                v_doc
                || case when v_values = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_values', v_values) end
                || jsonb_build_object('_actor', 'system',
                                      '_source', jsonb_strip_nulls(jsonb_build_object(
                                        'via', 'import', 'import_id', p_import_id::text,
                                        'file', v_run.source_name, 'row', v_index))));
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                'kind', 'write', 'row', v_index, 'ord', v_ord, 'source', v_row));
    if v_dk is not null and v_doc ->> v_dk is not null then
      v_exist := v_exist || jsonb_build_object(v_doc ->> v_dk, 'pending:' || v_ord::text);
    end if;
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u <> '' then v_uqseen := v_uqseen || jsonb_build_object(v_key || '|' || v_u, v_ord); end if;
      end loop;
    end if;
  end loop;

  -- ══ PHASE TWO — ONE STATEMENT. ═══════════════════════════════════════════════════════════
  v_t0 := clock_timestamp();
  if cardinality(v_ids) > 0 then
    begin
      perform custom.record_write_many(p_organization_id, v_run.table_id, v_docs, v_ids);
    exception when others then
      -- A BAD ROW REFUSES THE WHOLE STATEMENT, WHICH IS RIGHT FOR A PASTE AND WRONG FOR AN
      -- IMPORT. The plan is replayed through the single-row door so every row carries its own
      -- outcome and the good rows still land. Only a refused batch pays for this.
      v_fell := sqlerrm;
    end;
  end if;

  if v_fell is not null then
    v_ids := array_fill(null::uuid, array[cardinality(v_ids)]);
    for v_entry in select value from jsonb_array_elements(v_plan) where value ->> 'kind' = 'write' loop
      v_ord := (v_entry ->> 'ord')::integer;
      begin
        v_ids[v_ord] := custom.record_write(p_organization_id, v_run.table_id, v_docs[v_ord]);
      exception when others then
        v_ids[v_ord] := null;
        v_failed := v_failed || jsonb_build_object(v_ord::text,
                      jsonb_build_object('reason', sqlerrm, 'sqlstate', sqlstate));
      end;
    end loop;
  end if;

  -- HOW MANY ROWS THIS DATABASE CAN COMFORTABLY TAKE IN ONE CALL, from what it just did.
  -- Only the writing phase is measured, because that is the part that scales with the batch.
  v_wrote  := extract(epoch from clock_timestamp() - v_t0) * 1000;
  v_perrow := case when cardinality(v_ids) > 0 then v_wrote / cardinality(v_ids) else null end;
  v_next   := case when coalesce(v_perrow, 0) <= 0 then null
                   else greatest(25, least(1000, floor(c_comfort / v_perrow)::integer)) end;

  -- ══ PHASE THREE — WHAT HAPPENED TO EVERY ROW, IN FILE ORDER. ═════════════════════════════
  for v_entry in select value from jsonb_array_elements(v_plan) loop
    v_index := (v_entry ->> 'row')::integer;

    if v_entry ->> 'kind' = 'refused' then
      v_bad := v_bad + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'refused', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      if jsonb_array_length(v_ref) < c_keep then
        v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'sqlstate', '22023', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      end if;

    elsif v_entry ->> 'kind' = 'write' then
      v_ord := (v_entry ->> 'ord')::integer;
      if v_ids[v_ord] is null then
        v_bad := v_bad + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'refused',
                   'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        if jsonb_array_length(v_ref) < c_keep then
          v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'sqlstate', coalesce(v_entry ->> 'sqlstate', '22023'),
                     'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        end if;
      else
        v_landed := v_landed + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'landed', 'record_id', v_ids[v_ord]));
        if v_mode = 'propose' then
          select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into v_rest
            from jsonb_each(v_entry -> 'source') s
           where not (v_map ? s.key) and not (v_fields ? s.key)
             and coalesce(s.value #>> '{}', '') <> '';
          if v_rest <> '{}'::jsonb then
            v_hold := v_hold || jsonb_build_object((v_ids[v_ord])::text, v_rest);
          end if;
        end if;
      end if;

    else  -- a duplicate of something already here, or of a row this very batch planned
      v_word := v_entry ->> 'hit';
      if left(v_word, 8) = 'pending:' then
        v_ord := substr(v_word, 9)::integer;
        if v_ids[v_ord] is null then
          -- The row this one repeats was refused after all, so this copy is not a repeat of
          -- anything that exists. It is written on its own, exactly as it would have been.
          begin
            v_id := custom.record_write(p_organization_id, v_run.table_id,
                      (v_entry -> 'doc')
                      || case when (v_entry -> 'values') = '{}'::jsonb then '{}'::jsonb
                              else jsonb_build_object('_values', v_entry -> 'values') end
                      || jsonb_build_object('_actor', 'system',
                                            '_source', jsonb_strip_nulls(jsonb_build_object(
                                              'via', 'import', 'import_id', p_import_id::text,
                                              'file', v_run.source_name, 'row', v_index))));
            v_landed := v_landed + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'landed', 'record_id', v_id));
            if v_mode = 'propose' then
              select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into v_rest
                from jsonb_each(v_entry -> 'source') s
               where not (v_map ? s.key) and not (v_fields ? s.key)
                 and coalesce(s.value #>> '{}', '') <> '';
              if v_rest <> '{}'::jsonb then
                v_hold := v_hold || jsonb_build_object((v_id)::text, v_rest);
              end if;
            end if;
          exception when others then
            v_bad := v_bad + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
            if jsonb_array_length(v_ref) < c_keep then
              v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                         'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
            end if;
          end;
          continue;
        end if;
        v_word := v_ids[v_ord]::text;
      end if;

      v_dupes := v_dupes + 1;
      v_patch := (v_entry -> 'doc') - v_dk;
      if lower(coalesce(v_run.policy ->> 'on_duplicate', 'skip')) = 'update' then
        begin
          if v_patch <> '{}'::jsonb then
            perform custom.record_update(p_organization_id, v_word::uuid,
                      v_patch || jsonb_build_object('_values', (v_entry -> 'values') - v_dk, '_actor', 'system'), null);
          end if;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid,
                     'updated', v_patch <> '{}'::jsonb,
                     'reason', format('A record with %s = "%s" was already here, and it was brought up to date.', v_dk, v_entry ->> 'key')));
        exception when others then
          v_bad := v_bad + 1; v_dupes := v_dupes - 1;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
          if jsonb_array_length(v_ref) < c_keep then
            v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
          end if;
          continue;
        end;
      else
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid, 'updated', false,
                   'reason', format('A record with %s = "%s" was already here, and it was left alone.', v_dk, v_entry ->> 'key')));
      end if;
      if jsonb_array_length(v_dup) < c_keep then
        v_dup := v_dup || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'key', v_dk, 'value', v_entry ->> 'key',
                   'record_id', v_word::uuid, 'source', v_entry -> 'source'));
      end if;
    end if;
  end loop;

  -- THE PROPOSALS, built from everything this batch saw and MERGED with what earlier batches saw.
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_props
    from (
      select jsonb_build_object('column', u.key,
                                'samples', u.value,
                                'import_id', p_import_id::text)
             || (custom.io_infer_column(p_organization_id, v_run.table_id, u.key, u.value)
                   - 'header' - 'matched')
             || jsonb_build_object('state', 'proposed') as p
        from jsonb_each(v_unmap) u
       where not exists (select 1 from jsonb_array_elements(v_run.proposals) q
                          where q ->> 'column' = u.key)
    ) s;

  update custom.io_import
     set rows_seen      = rows_seen + v_seen,
         rows_written   = rows_written + v_landed,
         rows_duplicate = rows_duplicate + v_dupes,
         refusals       = refusals || v_ref,
         duplicates     = duplicates || v_dup,
         proposals      = case when v_hold = '{}'::jsonb then proposals || v_made || v_props else (
           select coalesce(jsonb_agg(case when coalesce(p ->> 'state', 'proposed') <> 'proposed' then p else p || (
                    select case when count(*) = 0 then '{}'::jsonb else
                             jsonb_build_object('values', coalesce(p -> 'values', '{}'::jsonb) || jsonb_object_agg(k.key, k.word))
                             || case when count(*) < max(k.offered) then jsonb_build_object('values_cut', true) else '{}'::jsonb end
                           end
                      from (select h.key, h.word, count(*) over () as offered,
                                   row_number() over () as n
                              from (select h.key, h.value ->> (p ->> 'column') as word
                                      from jsonb_each(v_hold) h
                                     where coalesce(h.value ->> (p ->> 'column'), '') <> '') h) k
                     where k.n <= c_hold_max - (select count(*) from jsonb_object_keys(coalesce(p -> 'values', '{}'::jsonb))))
                  end order by ord), '[]'::jsonb)
             from jsonb_array_elements(proposals || v_made || v_props) with ordinality as e(p, ord)) end,
         mapping        = v_map,
         state          = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object(
    'import_id',      p_import_id,
    'rows_seen',      v_seen,
    'rows_written',   v_landed,
    'rows_duplicate', v_dupes,
    'rows_refused',   v_bad,
    'outcomes',       v_out,
    'proposals',      v_props,
    'columns_added',  v_made,
    -- Said out loud rather than hidden: this batch could not be written as one statement, so
    -- every row was written on its own and the refusals below name the rows that could not be.
    'one_statement',  v_fell is null,
    -- The measurement, said out loud: what the writing phase of THIS call cost a row, and how
    -- many rows that makes three seconds' worth. A caller that ignores them loses nothing.
    'write_ms',       round(v_wrote),
    'ms_per_row',     round(coalesce(v_perrow, 0), 2),
    'rows_per_call',  v_next,
    'refusals',       v_ref);
end;
$function$;

-- THE SERVER'S DRAIN SAYS IT TOO. A RETURNS TABLE cannot grow under CREATE OR REPLACE, so the door is
-- made again in this same transaction with one more column, `via`, last — the way a server-only
-- definer is reborn under the guards: its platform.client_callable_door row is taken off first
-- (otherwise the birth's implicit PUBLIC EXECUTE is refused as a client grant on a non-client door),
-- the function is dropped and created (the birth clears PUBLIC), and the SAME row is put back,
-- word for word (server_only, lane CHAIR-RECORD-CHANGED), before commit. Grants as before: postgres
-- only. aidream's matrx_records.record_changes reads the column by name and tolerates its absence.
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'record_changes_drain';
drop function custom.record_changes_drain(uuid, text, integer);
CREATE FUNCTION custom.record_changes_drain(p_organization_id uuid, p_consumer text, p_limit integer DEFAULT 100)
 RETURNS TABLE(event_id uuid, organization_id uuid, table_id uuid, record_id uuid, kind text, operation text, version integer, fields jsonb, changed_field_ids jsonb, actor jsonb, chain jsonb, op_id uuid, occurred_at timestamp with time zone, via text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom._io_outbox_server_only('custom.record_changes_drain');
  perform custom.assert_store_door(p_organization_id, 'custom.record_changes_drain');
  return query
  select o.id, o.organization_id, o.table_id, o.record_id,
         coalesce(o.metadata #>> '{change,kind}',
                  case o.operation when 'created' then 'create' when 'deleted' then 'archive' else 'update' end),
         o.operation,
         (o.metadata #>> '{change,version}')::integer,
         coalesce(o.metadata #> '{change,fields}', '{}'::jsonb),
         o.changed_field_ids, o.actor, o.actor -> 'chain', o.op_id, o.created_at,
         -- THE DOOR IT CAME THROUGH (CHAIR-DOORS-4); null on a row written before the store said.
         o.metadata #>> '{change,via}'
    from custom.io_outbox o
   where o.id in (select c from custom._io_outbox_claim(p_organization_id, p_consumer, 'records.changed', p_limit) c)
   order by o.created_at, o.id;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, declared_at,
   non_client_lane, signed_in_callers, anonymous_callers, anonymous_purpose, gate_predicate,
   argument_rules, probe_args, contract_probe, refusal_only)
values
  ('custom', 'record_changes_drain', 'p_organization_id uuid, p_consumer text, p_limit integer', array[2950::oid, 25::oid, 23::oid]::oid[],
   'The record-changed event''s consumer doors: each named server consumer subscribes, drains, hands back and counts its own backlog.',
   'CHAIR-RECORD-CHANGED', '2026-10-02T18:28:08.644472+00:00'::timestamptz,
   'server_only: queue plumbing for the server''s consumers; a browser has no consumer name and must never take events from one.',
   false, false, null, null,
   null, null, null, false);
