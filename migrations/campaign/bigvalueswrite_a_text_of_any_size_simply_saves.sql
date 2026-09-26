-- target: branch,production
-- additive: yes
--   It ADDS one table, custom.whole_value_parked (no client grant), four internal helpers
--   (whole_value_ceiling, whole_value_head, whole_value_source, whole_value_park) and ONE signed-in
--   door, custom.whole_value_complete (declared in platform.client_callable_door, EXECUTE to
--   authenticated). It REPLACES custom._value_envelope() with its existing signature, security and
--   search_path, keeping every existing line. No record is written; a value under the ceiling is
--   written exactly as before.
-- guard: custom/system_enabled
-- lane: BIG-VALUES-WRITE
-- lock: custom,platform
-- based-on: custom._value_envelope() 937ba0861232f2c6ab26a6d0220e1c34bc1da7d8344579b022d0b2cb0a22eb79
--
-- Inverse: migrations/inverse/bigvalueswrite_a_text_of_any_size_simply_saves_down.sql.
--
-- THE USE CASE. A compliance lead pastes her company's 200 KB data-retention policy into the
-- "Policy text" cell of a table, or an agent writes a 250 KB research compilation into a record, or
-- a CSV import carries a long transcript. Until now the store answered every one of them with
-- "one value in a record holds at most 100000. Put the big thing in a file record" - a size error a
-- person meets while doing the thing, which Notion and Airtable never show. The owner (Arman,
-- 2026-09-25): "Make sure that large data size is easy for users. If it is and we use files behind
-- the scenes or force it and manage it, then it's ok."
--
-- WHAT CHANGES. custom._value_envelope() - the ONE trigger every write door passes (record_write,
-- record_update, record_write_many, record_write_graph, imports, agent writes, the follower) - no
-- longer refuses a TEXT value over custom/value_max_bytes on a business record. It carries it by the
-- ONE rule the table mover already uses (matrx_records.big_values):
--   * the cell keeps the first 1000 characters (custom.whole_value_head);
--   * the value's envelope names a `whole_value_in_file` source (bytes, chars, sha256, shown_chars,
--     mime) marked `pending` until its file exists;
--   * the whole text waits in custom.whole_value_parked, in the same transaction, announced on
--     `records_changed` as `record.whole_value`.
-- The whole text becomes a file OUTSIDE the database (object storage), so the file is written by the
-- server: every Python write path (matrx_records RecordStore) does it in the SAME session before its
-- transaction commits and refuses the whole write in words if the upload fails (nothing waits, no
-- pointer); a browser's write is completed within seconds by the follower. Either way the pointer is
-- completed through custom.whole_value_complete, which checks the file (same organization, the
-- record owner's, same SHA-256), finds its kernel File record (custom.relation_kernel_record),
-- completes the source, writes the `references` edge the mover writes, and clears the parked row.
-- The SAME whole text re-saved (same SHA-256 as the cell's file) keeps its pointer and its version.
-- A definition row, a JSON value, and a value on a key that is not a Field keep the refusal.

set local lock_timeout = '30s';

-- ── 1. Where a whole text waits for its file ──────────────────────────────────────────────
create table if not exists custom.whole_value_parked (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  table_id        uuid,
  record_id       uuid not null,
  field_key       text not null,
  pointer         text not null,
  value_version   integer,
  whole_text      text not null,
  sha256          text not null,
  bytes           bigint not null,
  chars           bigint not null,
  owner_id        uuid,
  record_visibility platform.visibility,
  attempts        integer not null default 0,
  last_error      text,
  parked_at       timestamptz not null default now(),
  constraint whole_value_parked_one_per_cell unique (record_id, field_key)
);
comment on table custom.whole_value_parked is
  'BIG-VALUES-WRITE: a text value over custom/value_max_bytes, waiting for the server to write its file. The cell already holds the first 1000 characters and a pending whole_value_in_file source; custom.whole_value_complete completes the pointer and clears the row. Written only inside custom._value_envelope (a store door), read only by the server. No client grant.';
create index if not exists whole_value_parked_organization_idx on custom.whole_value_parked (organization_id, parked_at);
alter table custom.whole_value_parked enable row level security;
revoke all on custom.whole_value_parked from public, anon, authenticated;

-- ── 2. The helpers the trigger reads ───────────────────────────────────────────────────────
create or replace function custom.whole_value_ceiling(p_organization_id uuid)
 returns bigint
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  -- Read the way custom.size_refusal reads it, and never looser: a knob this writer cannot read
  -- falls back to the published default.
  return coalesce((platform.knob_resolve('custom', 'value_max_bytes', p_organization_id) #>> '{}')::bigint, 100000);
exception when others then
  return 100000;
end;
$function$;

create or replace function custom.whole_value_head(p_text text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  -- The first 1000 characters, exactly (matrx_records.big_values.DISPLAY_CHARS).
  select left(p_text, 1000);
$function$;

create or replace function custom.whole_value_source(p_text text, p_writer_src jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  -- The same entry matrx_records.big_values.pointer_source writes, marked pending until its file
  -- exists. The writer's own inline source rides along (its keys never override the pointer's).
  select coalesce(case when jsonb_typeof(p_writer_src) = 'object' then p_writer_src end, '{}'::jsonb)
         || jsonb_build_object(
              'kind', 'whole_value_in_file',
              'pending', true,
              'bytes', octet_length(convert_to(p_text, 'UTF8')),
              'chars', length(p_text),
              'sha256', encode(sha256(convert_to(p_text, 'UTF8')), 'hex'),
              'shown_chars', least(1000, length(p_text)),
              'mime', 'text/plain; charset=utf-8');
$function$;

create or replace function custom.whole_value_park(
  p_organization_id uuid, p_table_id uuid, p_record_id uuid, p_owner_id uuid, p_visibility platform.visibility,
  p_data jsonb, p_park jsonb)
 returns void
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_key  text;
  v_text text;
begin
  for v_key, v_text in select e.key, e.value #>> '{}' from jsonb_each(p_park) e loop
    insert into custom.whole_value_parked as p
           (organization_id, table_id, record_id, field_key, pointer, value_version, whole_text,
            sha256, bytes, chars, owner_id, record_visibility)
    values (p_organization_id, p_table_id, p_record_id, v_key,
            p_data -> '_values' -> v_key ->> 'src',
            nullif(p_data -> '_values' -> v_key ->> 'ver', '')::integer,
            v_text,
            encode(sha256(convert_to(v_text, 'UTF8')), 'hex'),
            octet_length(convert_to(v_text, 'UTF8')),
            length(v_text),
            p_owner_id, p_visibility)
    on conflict (record_id, field_key) do update
       set organization_id = excluded.organization_id, table_id = excluded.table_id,
           pointer = excluded.pointer, value_version = excluded.value_version,
           whole_text = excluded.whole_text, sha256 = excluded.sha256, bytes = excluded.bytes,
           chars = excluded.chars, owner_id = excluded.owner_id,
           record_visibility = excluded.record_visibility,
           attempts = 0, last_error = null, parked_at = now();
  end loop;
  -- Delivered at commit, so the follower never sees a write that was refused.
  perform pg_notify('records_changed', json_build_object(
    'event_key', 'record.whole_value', 'organization_id', p_organization_id,
    'record_id', p_record_id)::text);
end;
$function$;
revoke all on function custom.whole_value_ceiling(uuid) from public, anon, authenticated;
revoke all on function custom.whole_value_head(text) from public, anon, authenticated;
revoke all on function custom.whole_value_source(text, jsonb) from public, anon, authenticated;
revoke all on function custom.whole_value_park(uuid, uuid, uuid, uuid, platform.visibility, jsonb, jsonb) from public, anon, authenticated;

-- ── 3. The door that completes a pointer once its file exists ─────────────────────────────
create or replace function custom.whole_value_complete(
  p_organization_id uuid, p_record_id uuid, p_field_key text, p_file_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_p           custom.whole_value_parked%rowtype;
  v_file        record;
  v_file_record uuid;
  v_current     jsonb;
  v_source      jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.whole_value_complete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.whole_value_complete');

  if p_organization_id is null or p_record_id is null or p_file_id is null
     or nullif(btrim(coalesce(p_field_key, '')), '') is null then
    raise exception 'custom.whole_value_complete needs the organization, the record, the field and the file.'
      using errcode = '22004';
  end if;

  select * into v_p
    from custom.whole_value_parked
   where organization_id = p_organization_id and record_id = p_record_id and field_key = p_field_key
   for update;
  if v_p.id is null then
    raise exception 'Nothing of % on this record is waiting for its file, so there is nothing to complete.', p_field_key
      using errcode = 'P0002',
            hint = 'The whole text may already be in its file (the follower completes a browser''s write within seconds). Read the record again.';
  end if;

  select f.id, f.organization_id, f.created_by, f.checksum, f.deleted_at
    into v_file
    from files.files f
   where f.id = p_file_id;
  if v_file.id is null or v_file.deleted_at is not null then
    raise exception 'The file % is not there, so the whole text of % has nowhere to live. Nothing was changed.', p_file_id, p_field_key
      using errcode = '23503';
  end if;
  if v_file.organization_id is distinct from p_organization_id then
    raise exception 'The file % belongs to another organization, so % of this record may not point at it. Nothing was changed.', p_file_id, p_field_key
      using errcode = '42501';
  end if;
  if v_file.checksum is distinct from v_p.sha256 then
    raise exception 'The file % does not hold the text that was saved in % (its SHA-256 differs), so the cell was not pointed at it. Nothing was changed.', p_file_id, p_field_key
      using errcode = '23514';
  end if;
  if v_p.owner_id is not null and v_file.created_by is distinct from v_p.owner_id then
    raise exception 'The file % is not owned by the person who owns this record, so % may not point at it. Nothing was changed.', p_file_id, p_field_key
      using errcode = '42501';
  end if;

  v_current := (select r.data from custom.record r
                 where r.organization_id = p_organization_id and r.id = p_record_id);
  if v_current is null
     or v_current -> '_values' -> p_field_key ->> 'src' is distinct from v_p.pointer
     or v_current -> '_sources' -> v_p.pointer ->> 'sha256' is distinct from v_p.sha256 then
    raise exception 'The cell % of this record no longer points at the text that is waiting, so its file was not attached. Nothing was changed.', p_field_key
      using errcode = '40001';
  end if;

  v_file_record := custom.relation_kernel_record(p_organization_id, custom.file_kernel_id(), p_file_id);
  if v_file_record is null then
    raise exception 'The file % could not be given a File record in this organization. Nothing was changed.', p_file_id
      using errcode = '23503';
  end if;
  update custom.record
     set created_by = coalesce(created_by, v_p.owner_id),
         visibility = coalesce(v_p.record_visibility, visibility)
   where organization_id = p_organization_id and id = v_file_record
     and ((created_by is null and v_p.owner_id is not null)
          or (v_p.record_visibility is not null and visibility is distinct from v_p.record_visibility));

  v_source := ((v_current -> '_sources' -> v_p.pointer) - 'pending')
              || jsonb_build_object('file_id', p_file_id, 'file_record', v_file_record);
  update custom.record
     set data = jsonb_set(data, array['_sources', v_p.pointer], v_source) || '{"_actor": "system"}'::jsonb
   where organization_id = p_organization_id and id = p_record_id;

  perform set_config('app.actor_system', 'matrx_records.big_values', true);
  insert into platform.associations
         (source_type, source_id, target_type, target_id, organization_id, role, label,
          metadata, created_by, origin, updated_by_tier)
  values ('record', p_record_id, 'record', v_file_record, p_organization_id, 'references', p_field_key,
          jsonb_build_object('whole_value_of', p_field_key, 'version', v_p.value_version), v_p.owner_id,
          'matrx_records.big_values', 'code')
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  delete from custom.whole_value_parked where id = v_p.id;
  return v_source || jsonb_build_object('pointer', v_p.pointer, 'version', v_p.value_version, 'key', p_field_key);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'custom', 'whole_value_complete',
       pg_get_function_identity_arguments('custom.whole_value_complete(uuid, uuid, text, uuid)'::regprocedure),
       array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
       'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach on entry. p_record_id takes the EDITOR decision through custom.assert_client_may_change against THIS organization - the same question custom.record_update asks - so a record the caller may not change is refused before anything is read. p_field_key names the waiting cell (custom.whole_value_parked); nothing waiting is refused with P0002. p_file_id must be a live files.files row of the same organization, created by the record''s owner, whose checksum is the waiting text''s SHA-256, or nothing is changed. The write completes the pointer through an ordinary custom.record update (every guard runs) and writes the references edge the table mover writes.',
       'migrations/campaign/bigvalueswrite_a_text_of_any_size_simply_saves.sql (lane BIG-VALUES-WRITE)',
       true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'custom' and d.function_name = 'whole_value_complete');
grant execute on function custom.whole_value_complete(uuid, uuid, text, uuid) to authenticated;

-- ── 4. The ONE trigger, carrying instead of refusing ───────────────────────────────────────
create or replace function custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
  v_type_fld text;
  v_rtype    text;
  v_src      text;
  v_agent    text[] := '{}'::text[];   -- ENRICH: the keys of this Table a model owns
  -- BIG-VALUES-WRITE: the text values over the ceiling this write carries into files.
  v_whole    jsonb := '{}'::jsonb;     -- key -> the whole text the writer supplied
  v_park     jsonb := '{}'::jsonb;     -- key -> the whole text that still needs its file
  v_ceiling  bigint;
  v_text     text;
  v_prior    jsonb;
  v_carry    jsonb;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A WRITE THAT ASSERTS NO VALUE HAS NO AUTHOR TO JUDGE (lane AGENT, 2026-09-19).
  -- MEASURED: a real agent turn wrote twenty records and could not delete ONE of them.
  -- custom.record_delete does `update custom.record set deleted_at = now()`, which fires
  -- this trigger over the UNCHANGED document; the document names no `_actor`, so
  -- custom.actor_word falls back to the connection's declaration ('agent'), and the
  -- forward arm below then refuses because nothing names the person the agent acts for —
  -- and nothing CAN, because a delete carries no document to put `_on_behalf_of` in and
  -- there is no GUC for it. So every agent delete, restore and reparent of a business
  -- record was refused, by a check about authorship, on a statement that authors nothing.
  --
  -- The condition is exactly that: an UPDATE whose `data` is not distinct from the row's
  -- existing `data` asserts no Value, so there is no new authorship to record and the
  -- authorship already stored stays exactly as it was. Every check below still runs, in
  -- full, on every statement that DOES change the document. This cannot widen anything:
  -- a write that changes no data could not have carried a value to mis-author.
  if TG_OP = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  -- A TEXT VALUE OF ANY SIZE SIMPLY SAVES (lane BIG-VALUES-WRITE, 2026-09-25). The owner:
  -- "Make sure that large data size is easy for users." A business record's text value over
  -- this organization's ceiling for one value (custom/value_max_bytes) is no longer refused:
  -- the cell keeps its first 1000 characters, and the whole text is carried into a file by
  -- the ONE rule the table mover already uses (matrx_records.big_values) - here it waits in
  -- custom.whole_value_parked until its file is written (below, and custom.whole_value_complete).
  -- The ceiling below then judges what the cell really holds. A definition row, a JSON value
  -- and a value on a key that is not one of the Table's Fields keep the refusal.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_ceiling := custom.whole_value_ceiling(new.organization_id);
    for v_key, v_text in
      select e.key, e.value #>> '{}'
        from jsonb_each(v_data) e
       where left(e.key, 1) <> '_' and jsonb_typeof(e.value) = 'string'
         and octet_length(e.value::text) > v_ceiling
    loop
      v_whole := v_whole || jsonb_build_object(v_key, v_text);
      v_data := jsonb_set(v_data, array[v_key], to_jsonb(custom.whole_value_head(v_text)));
    end loop;
  end if;

  -- THE CEILING (finding 4), over what the WRITER supplied, before anything else touches
  -- the document.
  v_refusal := custom.size_refusal(new.organization_id, v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants. A value too big to live in the record lives as a record of this store''s File table, and the value points at it.';
  end if;

  v_declared := v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of';

  -- WHO OPENS THE ENVELOPE (finding 2). A business document always gets one, whether or not
  -- its writer opened it; a DEFINITION row (kernel, table, field, rule, merge_field,
  -- relation) is the shape of the store rather than a set of asserted Values, and keeps its
  -- prior behaviour exactly - nothing to do unless it declared something itself.
  if new.data_class is distinct from 'record' and not v_declared then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  -- THE FORWARD ARM (finding 3). The converse above was built; this one was not, so an agent
  -- write naming nobody landed unremarked.
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the record with that person''s id. Work the platform does for nobody in particular is written by "system" - that is what the third word in the vocabulary is for. The vocabulary is exactly user, agent, system.';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  -- A VALUE IS A FIELD'S VALUE. The envelope is opened over the APPLICABLE FIELDS of this
  -- record's Table - the same set custom._record_field_validation validates against, chosen
  -- by the record's own type field where the Table has one - and never over the document's
  -- other keys, which carry structure rather than assertions. custom.validate_value_envelope
  -- refuses an envelope on a key that is not a declared Field, and it is right to.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
    if v_type_fld is not null then
      v_rtype := v_data ->> v_type_fld;
    end if;
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses the malformed block by name
    end if;
    -- ENRICH, 2026-09-20: THE SAME LOOP NOW ALSO ANSWERS "WHO OWNS THIS COLUMN".
    -- A Field whose `source` is `agent` is a column an enrichment fills (AGT-6). Reading it
    -- here costs nothing - the Field rows are already being walked - and it is what lets the
    -- rule below pin a cell the moment a PERSON types over one of them.
    for v_key, v_src in select f.data ->> 'key', f.data ->> 'source'
                          from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
    loop
      if v_key is not null and v_data ? v_key and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
      if v_key is not null and v_src = 'agent' then
        v_agent := v_agent || v_key;
      end if;
    end loop;
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  -- BIG-VALUES-WRITE: each carried value's envelope names its whole text. The SAME whole text
  -- the cell's file already holds (same SHA-256) keeps that pointer, so re-saving it is not a
  -- new version; any other text gets a pending pointer and waits for its file.
  for v_key, v_text in select e.key, e.value #>> '{}' from jsonb_each(v_whole) e loop
    if coalesce(jsonb_typeof(v_data -> '_values' -> v_key), '') <> 'object' then
      raise exception '%', custom.size_refusal(new.organization_id,
                                               jsonb_build_object(v_key, v_whole -> v_key))
        using errcode = '23514',
              hint = 'Only a Field of this Table carries a big text into a file. Declare the Field, then write it again.';
    end if;
    v_prior := null;
    if tg_op = 'UPDATE' then
      v_prior := old.data -> '_sources' -> (old.data -> '_values' -> v_key ->> 'src');
    end if;
    v_carry := custom.whole_value_source(v_text, v_data -> '_values' -> v_key -> 'src');
    if v_prior is not null and v_prior ->> 'kind' = 'whole_value_in_file'
       and v_prior ->> 'sha256' = v_carry ->> 'sha256' then
      v_data := jsonb_set(v_data, array[v_key], old.data -> v_key);
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_prior);
    else
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_carry);
      v_park := v_park || jsonb_build_object(v_key, v_text);
    end if;
  end loop;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);
  -- ENRICH: A PERSON'S EDIT OF AN AGENT-OWNED CELL PINS IT, THROUGH EVERY DOOR AT ONCE —
  -- AND ONLY THE CELL THEY ACTUALLY EDITED. This runs AFTER custom.value_versions on
  -- purpose: `custom.stamp_value_envelopes` puts the writer's word on EVERY envelope in the
  -- document, so before the version is decided there is no way to tell the value a person
  -- just typed from the forty others the same write left alone. The version IS that
  -- distinction, already computed, and asking it a second way is how the two would drift.
  v_data := custom.pin_agent_cells(v_data,
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_agent);
  -- ENRICH: AND A VALUE NOBODY RE-ASSERTED KEEPS ITS OWN MOMENT AND ITS OWN AUTHOR.
  v_data := custom.carry_unchanged_value_stamps(
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;

  -- BIG-VALUES-WRITE: the whole texts that still need their file wait beside the record, in
  -- the same transaction - so a refused write leaves nothing waiting.
  if v_park <> '{}'::jsonb then
    perform custom.whole_value_park(new.organization_id, new.table_id, new.id,
                                    coalesce(new.created_by, custom.query_principal()),
                                    new.visibility, v_data, v_park);
  end if;
  return new;
end;
$function$

;
