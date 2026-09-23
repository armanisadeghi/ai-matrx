-- scripts/campaign-tests/capture_red.sql — the RED twin of capture_green.sql.
--
-- It puts lane CAPTURE's four defects BACK, inside a transaction it rolls back, and asserts
-- that each one returns. A guard nobody has watched fail is not a guard.
--
-- Every body planted below is the REAL bytes of one of this lane's own applied migrations,
-- copied out of the file, not a paraphrase: the first write of custom.capture_submit (the
-- metadata blob the Data Doctrine guard refuses), the second (a Field that holds one value
-- given every photograph sent for it), the third (the OUT parameter that makes the last statement of the
-- write path ambiguous at RUN time). The fourth is the wall itself: the CHECK constraint
-- dropped, so a crew sheet can be published to the world.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'capture_red.sql'
\set requires 'type:custom.anon_form'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';


create or replace function custom.capture_submit(p_organization_id uuid,
                                                  p_sheet_id uuid,
                                                  p_client_key text,
                                                  p_payload jsonb,
                                                  p_files jsonb default '[]'::jsonb,
                                                  p_device text default null,
                                                  p_captured_at timestamptz default null,
                                                  p_location jsonb default null)
returns table (record_id uuid, state text, message text, replay boolean, file_ids uuid[])
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f        custom.anon_form;
  v_me       uuid := custom.query_principal();
  v_exposed  text[];
  v_required text[];
  v_answered text[] := array[]::text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_att      jsonb;
  v_files    uuid[] := array[]::uuid[];
  v_of_key   uuid[];
  v_file     uuid;
  v_at       timestamptz := coalesce(p_captured_at, now());
  v_existing uuid;
  v_rec      uuid;
  v_source   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_submit');

  select * into v_f from custom.anon_form
   where anon_form.organization_id = p_organization_id
     and anon_form.id = p_sheet_id
     and anon_form.audience = 'crew'
     and anon_form.deleted_at is null;

  -- THE ACCESS DECISION, BEFORE EXISTENCE. Both arms raise the same sentence on purpose.
  if not found
     or not custom.has_visibility(v_me, 'record', v_f.table_id,
                                  'editor'::public.permission_level) then
    raise exception 'You cannot capture into this sheet.'
      using errcode = '42501',
            hint = 'A capture writes a record, so it needs the same editor level on the table that adding a record by hand needs. If you were given this link by mistake, ask whoever sent it; if you should have it, ask an owner of this organization for editor on that table.';
  end if;

  if coalesce(btrim(coalesce(p_client_key, '')), '') = '' then
    raise exception 'This capture has no key of its own, so a retry could not be told from a second capture.'
      using errcode = '22004',
            hint = 'The phone mints the key when the capture is taken, offline, before the first attempt — never when it reconnects. Without it a lost acknowledgement would write the same bin twice.';
  end if;

  if v_f.closed_at is not null then
    record_id := null; state := 'closed'; replay := false; file_ids := null;
    message := 'This capture sheet is closed, so it is not taking anything new. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;
  if v_f.capture_opened_at is null then
    record_id := null; state := 'not open yet'; replay := false; file_ids := null;
    message := 'Whoever set this sheet up has not opened it to the crew yet. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;

  -- SCOPE. A key this sheet does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This capture sheet does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
    if coalesce(p_payload -> v_key, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb) then
      v_answered := v_answered || v_key;
    end if;
  end loop;

  -- THE FILES. A photo and a voice note are answers like any other, so a field answered by
  -- a file counts as answered — checked BEFORE the required list, or a sheet whose only
  -- required question is the photograph would refuse every capture that had one.
  if jsonb_typeof(p_files) = 'array' then
    for v_att in select value from jsonb_array_elements(p_files) loop
      v_key := nullif(btrim(coalesce(v_att ->> 'field', '')), '');
      if v_key is null or not (v_key = any (v_exposed)) then
        raise exception 'This capture sheet does not have a field called "%" for a file.',
                        coalesce(v_key, '(unnamed)')
          using errcode = '42501',
                hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
      end if;
      if not (v_key = any (v_answered)) then
        v_answered := v_answered || v_key;
      end if;
    end loop;
  end if;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k where not (k = any (v_answered));
  if array_length(v_missing, 1) > 0 then
    raise exception 'This capture still needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each one is named so the phone can point at it and keep the capture in its queue. Nothing was written and nothing was lost.';
  end if;

  -- THE LEDGER IS THE MECHANISM, and it is taken FOR UPDATE so two replays of one key
  -- cannot both believe they are the first.
  insert into custom.anon_replay (organization_id, client_key, table_id, device, captured_at,
                                  metadata)
  values (p_organization_id, p_client_key, v_f.table_id, p_device, v_at,
          jsonb_build_object('sheet_id', p_sheet_id::text, 'via', 'capture'))
  on conflict (organization_id, client_key) where deleted_at is null do nothing;

  select r.record_id into v_existing from custom.anon_replay r
   where r.organization_id = p_organization_id and r.client_key = p_client_key
     for update;

  if v_existing is not null then
    update custom.anon_replay set replays = replays + 1
     where organization_id = p_organization_id and client_key = p_client_key;
    record_id := v_existing; state := 'captured'; replay := true; file_ids := null;
    message := 'This capture had already arrived, so it was not written twice.';
    return next; return;
  end if;

  -- REC-31: a picture is a File record reached through a relation. The bytes were put in
  -- the platform's ONE byte store by the app before this call; what lands here is the
  -- reference, and it becomes a File record exactly as custom.inbound_mail_land writes an
  -- attachment. A File record carries its own provenance, because a photograph separated
  -- from when and where it was taken is not evidence of anything.
  if jsonb_typeof(p_files) = 'array' then
    for v_key in select distinct nullif(btrim(coalesce(value ->> 'field', '')), '')
                   from jsonb_array_elements(p_files) loop
      v_of_key := array[]::uuid[];
      for v_att in select value from jsonb_array_elements(p_files)
                    where nullif(btrim(coalesce(value ->> 'field', '')), '') = v_key loop
        v_file := custom.record_write(p_organization_id, custom.file_kernel_id(),
                    jsonb_strip_nulls(jsonb_build_object(
                      'name',       coalesce(nullif(v_att ->> 'name', ''), 'capture'),
                      'mime_type',  nullif(v_att ->> 'mime_type', ''),
                      'size_bytes', nullif(v_att ->> 'size_bytes', '')::bigint,
                      'url',        nullif(v_att ->> 'url', ''),
                      'file_id',    nullif(v_att ->> 'file_id', ''),
                      'duration_ms', nullif(v_att ->> 'duration_ms', '')::bigint,
                      '_actor',     'user',
                      '_source',    jsonb_build_object('via', 'capture',
                                                       'sheet_id', p_sheet_id::text,
                                                       'client_key', p_client_key,
                                                       'device', p_device,
                                                       'captured_at', v_at,
                                                       'at_place', p_location))));
        v_of_key := v_of_key || v_file;
        v_files  := v_files || v_file;
      end loop;
      v_doc := v_doc || jsonb_build_object(v_key,
                 to_jsonb(array(select x::text from unnest(v_of_key) x)));
    end loop;
  end if;

  -- THE PROVENANCE IS ON THE RECORD (VAL-1, VAL-7). `captured_at` is the moment the phone
  -- took it; `arrived_at` is the moment the network came back. A queue that collapsed the
  -- two would make every capture in a day look like it happened at five o'clock.
  v_source := jsonb_strip_nulls(jsonb_build_object(
                'via',         'capture',
                'sheet_id',    p_sheet_id::text,
                'sheet_title', v_f.title,
                'client_key',  p_client_key,
                'device',      p_device,
                'captured_at', v_at,
                'arrived_at',  now(),
                'at_place',    p_location));

  v_rec := custom.record_write(p_organization_id, v_f.table_id,
             v_doc || jsonb_build_object('_actor', 'user', '_source', v_source));

  update custom.anon_replay set record_id = v_rec
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;

  if v_f.notify_rule_id is not null then
    perform custom.form_notify(p_organization_id, v_f.id, v_rec, null);
  end if;

  record_id := v_rec; state := 'captured'; replay := false;
  file_ids := case when cardinality(v_files) > 0 then v_files else null end;
  message := null;
  return next;
end;
$fn$;

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_sheet   uuid;
  v_rec     uuid;
  v_txt     text;
  v_fired   integer := 0;
  v_pub     boolean;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Hands & Hope Alliance Red ' || left(v_org::text, 8), 'hands-hope-red-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'capture_red.sql', c_admin);
  perform set_config('app.actor_system', 'campaign-test/capture_red.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Yard', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Bins', 'slug', 'bins', 'description', 'the red twin''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'bin_id', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Bin', 'label_plural', 'Bins',
      'title_field', 'bin_id',
      'fields', jsonb_build_array(jsonb_build_object('name', 'bin_id')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'bin', 'key', 'bin_id', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'photo', 'key', 'photo', 'type', 'relation',
                                                                  'relation_target', custom.file_kernel_id()));
  v_sheet := custom.capture_sheet_declare(v_org, v_table, 'Bin round', jsonb_build_array(
      jsonb_build_object('field', 'bin_id', 'ask', 'Which bin is this?', 'required', true),
      jsonb_build_object('field', 'photo',  'ask', 'Photograph the bin', 'required', true)));
  perform custom.capture_publish(v_org, v_sheet, true);

  -- ══ RED 1 — the metadata blob: every capture refused before it reached the record ══
  begin
    select record_id into v_rec from custom.capture_submit(v_org, v_sheet, 'red-1',
             jsonb_build_object('bin_id', 'B-1'),
             jsonb_build_array(jsonb_build_object('field', 'photo', 'name', 'b1.jpg')));
    raise exception 'RED 1 DID NOT FIRE — a capture landed (%) while the ledger write put an unregistered key in metadata', v_rec;
  exception when sqlstate '23514' or sqlstate '42501' or sqlstate '22004' then
    get stacked diagnostics v_txt = message_text;
    v_fired := v_fired + 1;
    raise notice 'RED 1 FIRED — "%"', v_txt;
  end;

  perform set_config('role', v_boss, true);
  create or replace function custom.capture_submit(p_organization_id uuid,
                                                  p_sheet_id uuid,
                                                  p_client_key text,
                                                  p_payload jsonb,
                                                  p_files jsonb default '[]'::jsonb,
                                                  p_device text default null,
                                                  p_captured_at timestamptz default null,
                                                  p_location jsonb default null)
returns table (record_id uuid, state text, message text, replay boolean, file_ids uuid[])
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f        custom.anon_form;
  v_me       uuid := custom.query_principal();
  v_exposed  text[];
  v_required text[];
  v_answered text[] := array[]::text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_att      jsonb;
  v_files    uuid[] := array[]::uuid[];
  v_of_key   uuid[];
  v_file     uuid;
  v_at       timestamptz := coalesce(p_captured_at, now());
  v_existing uuid;
  v_rec      uuid;
  v_source   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_submit');

  select * into v_f from custom.anon_form
   where anon_form.organization_id = p_organization_id
     and anon_form.id = p_sheet_id
     and anon_form.audience = 'crew'
     and anon_form.deleted_at is null;

  -- THE ACCESS DECISION, BEFORE EXISTENCE. Both arms raise the same sentence on purpose.
  if not found
     or not custom.has_visibility(v_me, 'record', v_f.table_id,
                                  'editor'::public.permission_level) then
    raise exception 'You cannot capture into this sheet.'
      using errcode = '42501',
            hint = 'A capture writes a record, so it needs the same editor level on the table that adding a record by hand needs. If you were given this link by mistake, ask whoever sent it; if you should have it, ask an owner of this organization for editor on that table.';
  end if;

  if coalesce(btrim(coalesce(p_client_key, '')), '') = '' then
    raise exception 'This capture has no key of its own, so a retry could not be told from a second capture.'
      using errcode = '22004',
            hint = 'The phone mints the key when the capture is taken, offline, before the first attempt — never when it reconnects. Without it a lost acknowledgement would write the same bin twice.';
  end if;

  if v_f.closed_at is not null then
    record_id := null; state := 'closed'; replay := false; file_ids := null;
    message := 'This capture sheet is closed, so it is not taking anything new. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;
  if v_f.capture_opened_at is null then
    record_id := null; state := 'not open yet'; replay := false; file_ids := null;
    message := 'Whoever set this sheet up has not opened it to the crew yet. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;

  -- SCOPE. A key this sheet does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This capture sheet does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
    if coalesce(p_payload -> v_key, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb) then
      v_answered := v_answered || v_key;
    end if;
  end loop;

  -- THE FILES. A photo and a voice note are answers like any other, so a field answered by
  -- a file counts as answered — checked BEFORE the required list, or a sheet whose only
  -- required question is the photograph would refuse every capture that had one.
  if jsonb_typeof(p_files) = 'array' then
    for v_att in select value from jsonb_array_elements(p_files) loop
      v_key := nullif(btrim(coalesce(v_att ->> 'field', '')), '');
      if v_key is null or not (v_key = any (v_exposed)) then
        raise exception 'This capture sheet does not have a field called "%" for a file.',
                        coalesce(v_key, '(unnamed)')
          using errcode = '42501',
                hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
      end if;
      if not (v_key = any (v_answered)) then
        v_answered := v_answered || v_key;
      end if;
    end loop;
  end if;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k where not (k = any (v_answered));
  if array_length(v_missing, 1) > 0 then
    raise exception 'This capture still needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each one is named so the phone can point at it and keep the capture in its queue. Nothing was written and nothing was lost.';
  end if;

  -- THE LEDGER IS THE MECHANISM, and it is taken FOR UPDATE so two replays of one key
  -- cannot both believe they are the first.
  insert into custom.anon_replay (organization_id, client_key, table_id, device, captured_at,
                                  sheet_id)
  values (p_organization_id, p_client_key, v_f.table_id, p_device, v_at, p_sheet_id)
  on conflict (organization_id, client_key) where deleted_at is null do nothing;

  select r.record_id into v_existing from custom.anon_replay r
   where r.organization_id = p_organization_id and r.client_key = p_client_key
     for update;

  if v_existing is not null then
    update custom.anon_replay set replays = replays + 1
     where organization_id = p_organization_id and client_key = p_client_key;
    record_id := v_existing; state := 'captured'; replay := true; file_ids := null;
    message := 'This capture had already arrived, so it was not written twice.';
    return next; return;
  end if;

  -- REC-31: a picture is a File record reached through a relation. The bytes were put in
  -- the platform's ONE byte store by the app before this call; what lands here is the
  -- reference, and it becomes a File record exactly as custom.inbound_mail_land writes an
  -- attachment. A File record carries its own provenance, because a photograph separated
  -- from when and where it was taken is not evidence of anything.
  if jsonb_typeof(p_files) = 'array' then
    for v_key in select distinct nullif(btrim(coalesce(value ->> 'field', '')), '')
                   from jsonb_array_elements(p_files) loop
      v_of_key := array[]::uuid[];
      for v_att in select value from jsonb_array_elements(p_files)
                    where nullif(btrim(coalesce(value ->> 'field', '')), '') = v_key loop
        v_file := custom.record_write(p_organization_id, custom.file_kernel_id(),
                    jsonb_strip_nulls(jsonb_build_object(
                      'name',       coalesce(nullif(v_att ->> 'name', ''), 'capture'),
                      'mime_type',  nullif(v_att ->> 'mime_type', ''),
                      'size_bytes', nullif(v_att ->> 'size_bytes', '')::bigint,
                      'url',        nullif(v_att ->> 'url', ''),
                      'file_id',    nullif(v_att ->> 'file_id', ''),
                      'duration_ms', nullif(v_att ->> 'duration_ms', '')::bigint,
                      '_actor',     'user',
                      '_source',    jsonb_build_object('via', 'capture',
                                                       'sheet_id', p_sheet_id::text,
                                                       'client_key', p_client_key,
                                                       'device', p_device,
                                                       'captured_at', v_at,
                                                       'at_place', p_location))));
        v_of_key := v_of_key || v_file;
        v_files  := v_files || v_file;
      end loop;
      v_doc := v_doc || jsonb_build_object(v_key,
                 to_jsonb(array(select x::text from unnest(v_of_key) x)));
    end loop;
  end if;

  -- THE PROVENANCE IS ON THE RECORD (VAL-1, VAL-7). `captured_at` is the moment the phone
  -- took it; `arrived_at` is the moment the network came back. A queue that collapsed the
  -- two would make every capture in a day look like it happened at five o'clock.
  v_source := jsonb_strip_nulls(jsonb_build_object(
                'via',         'capture',
                'sheet_id',    p_sheet_id::text,
                'sheet_title', v_f.title,
                'client_key',  p_client_key,
                'device',      p_device,
                'captured_at', v_at,
                'arrived_at',  now(),
                'at_place',    p_location));

  v_rec := custom.record_write(p_organization_id, v_f.table_id,
             v_doc || jsonb_build_object('_actor', 'user', '_source', v_source));

  update custom.anon_replay set record_id = v_rec
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;

  if v_f.notify_rule_id is not null then
    perform custom.form_notify(p_organization_id, v_f.id, v_rec, null);
  end if;

  record_id := v_rec; state := 'captured'; replay := false;
  file_ids := case when cardinality(v_files) > 0 then v_files else null end;
  message := null;
  return next;
end;
$fn$;

  perform set_config('role', 'authenticated', true);

  -- ══ RED 2 — two photographs for a question that holds ONE, refused only at the last step ══
  -- REL-7 (lane STORE-TXN-3, 2026-09-22, reltargets_a_relation_across_organizations_holds_
  -- its_value.sql) made ONE target written as a list of one legal for every relation, so a
  -- single photograph sent as `["<id>"]` is no longer the defect: the store accepts it, the
  -- planted body walks on into its OTHER defect (RED 3's ambiguous `record_id`) and this red
  -- used to die of the wrong cause (measured on the clone 2026-09-23, lane STORE-SMALLS). What
  -- the pre-fix body still does wrong is the case the fix names: it writes BOTH photographs
  -- into the one-photo Field, and the store refuses that at custom.record_write — after the
  -- walk to the bin and the upload — instead of the door refusing it up front, by name.
  -- The green twin's PART 10 asserts the up-front refusal on the real body.
  begin
    select record_id into v_rec from custom.capture_submit(v_org, v_sheet, 'red-2',
             jsonb_build_object('bin_id', 'B-2'),
             jsonb_build_array(jsonb_build_object('field', 'photo', 'name', 'b2-front.jpg'),
                               jsonb_build_object('field', 'photo', 'name', 'b2-lid.jpg')));
    raise exception 'RED 2 DID NOT FIRE — two photographs were accepted into a single-valued photo field (%)', v_rec;
  exception when others then
    get stacked diagnostics v_txt = message_text;
    -- the refusal must be the STORE's, at the last step — never the door's up-front one,
    -- which is the fix and would mean the plant did not take.
    if v_txt like '%more than one file%' then raise; end if;
    if v_txt not like '%one value%' and v_txt not like '%at most%' then raise; end if;
    v_fired := v_fired + 1;
    raise notice 'RED 2 FIRED — "%"', v_txt;
  end;

  perform set_config('role', v_boss, true);
  create or replace function custom.capture_submit(p_organization_id uuid,
                                                  p_sheet_id uuid,
                                                  p_client_key text,
                                                  p_payload jsonb,
                                                  p_files jsonb default '[]'::jsonb,
                                                  p_device text default null,
                                                  p_captured_at timestamptz default null,
                                                  p_location jsonb default null)
returns table (record_id uuid, state text, message text, replay boolean, file_ids uuid[])
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f        custom.anon_form;
  v_me       uuid := custom.query_principal();
  v_exposed  text[];
  v_required text[];
  v_answered text[] := array[]::text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_att      jsonb;
  v_files    uuid[] := array[]::uuid[];
  v_of_key   uuid[];
  v_multi    boolean;
  v_file     uuid;
  v_at       timestamptz := coalesce(p_captured_at, now());
  v_existing uuid;
  v_rec      uuid;
  v_source   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_submit');

  select * into v_f from custom.anon_form
   where anon_form.organization_id = p_organization_id
     and anon_form.id = p_sheet_id
     and anon_form.audience = 'crew'
     and anon_form.deleted_at is null;

  -- THE ACCESS DECISION, BEFORE EXISTENCE. Both arms raise the same sentence on purpose.
  if not found
     or not custom.has_visibility(v_me, 'record', v_f.table_id,
                                  'editor'::public.permission_level) then
    raise exception 'You cannot capture into this sheet.'
      using errcode = '42501',
            hint = 'A capture writes a record, so it needs the same editor level on the table that adding a record by hand needs. If you were given this link by mistake, ask whoever sent it; if you should have it, ask an owner of this organization for editor on that table.';
  end if;

  if coalesce(btrim(coalesce(p_client_key, '')), '') = '' then
    raise exception 'This capture has no key of its own, so a retry could not be told from a second capture.'
      using errcode = '22004',
            hint = 'The phone mints the key when the capture is taken, offline, before the first attempt — never when it reconnects. Without it a lost acknowledgement would write the same bin twice.';
  end if;

  if v_f.closed_at is not null then
    record_id := null; state := 'closed'; replay := false; file_ids := null;
    message := 'This capture sheet is closed, so it is not taking anything new. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;
  if v_f.capture_opened_at is null then
    record_id := null; state := 'not open yet'; replay := false; file_ids := null;
    message := 'Whoever set this sheet up has not opened it to the crew yet. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;

  -- SCOPE. A key this sheet does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This capture sheet does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
    if coalesce(p_payload -> v_key, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb) then
      v_answered := v_answered || v_key;
    end if;
  end loop;

  -- THE FILES. A photo and a voice note are answers like any other, so a field answered by
  -- a file counts as answered — checked BEFORE the required list, or a sheet whose only
  -- required question is the photograph would refuse every capture that had one.
  if jsonb_typeof(p_files) = 'array' then
    for v_att in select value from jsonb_array_elements(p_files) loop
      v_key := nullif(btrim(coalesce(v_att ->> 'field', '')), '');
      if v_key is null or not (v_key = any (v_exposed)) then
        raise exception 'This capture sheet does not have a field called "%" for a file.',
                        coalesce(v_key, '(unnamed)')
          using errcode = '42501',
                hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
      end if;
      if not (v_key = any (v_answered)) then
        v_answered := v_answered || v_key;
      end if;
    end loop;
  end if;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k where not (k = any (v_answered));
  if array_length(v_missing, 1) > 0 then
    raise exception 'This capture still needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each one is named so the phone can point at it and keep the capture in its queue. Nothing was written and nothing was lost.';
  end if;

  -- THE LEDGER IS THE MECHANISM, and it is taken FOR UPDATE so two replays of one key
  -- cannot both believe they are the first.
  insert into custom.anon_replay (organization_id, client_key, table_id, device, captured_at,
                                  sheet_id)
  values (p_organization_id, p_client_key, v_f.table_id, p_device, v_at, p_sheet_id)
  on conflict (organization_id, client_key) where deleted_at is null do nothing;

  select r.record_id into v_existing from custom.anon_replay r
   where r.organization_id = p_organization_id and r.client_key = p_client_key
     for update;

  if v_existing is not null then
    update custom.anon_replay set replays = replays + 1
     where organization_id = p_organization_id and client_key = p_client_key;
    record_id := v_existing; state := 'captured'; replay := true; file_ids := null;
    message := 'This capture had already arrived, so it was not written twice.';
    return next; return;
  end if;

  -- REC-31: a picture is a File record reached through a relation. The bytes were put in
  -- the platform's ONE byte store by the app before this call; what lands here is the
  -- reference, and it becomes a File record exactly as custom.inbound_mail_land writes an
  -- attachment. A File record carries its own provenance, because a photograph separated
  -- from when and where it was taken is not evidence of anything.
  if jsonb_typeof(p_files) = 'array' then
    for v_key in select distinct nullif(btrim(coalesce(value ->> 'field', '')), '')
                   from jsonb_array_elements(p_files) loop
      v_of_key := array[]::uuid[];

      -- A FIELD SAYS HOW MANY ANSWERS IT HOLDS, and the door obeys it. `photo` on a bin is
      -- one photograph; writing `["<id>"]` into it raises *photo holds one value, and it was
      -- given a list* (FLD-2) and the whole capture dies at the last step, after the walk to
      -- the bin and the upload. Measured in capture_green.sql PART 4 before this arm existed.
      -- A second file for a single-valued field is refused BY NAME, up front.
      select coalesce((f.data ->> 'multi')::boolean, false) into v_multi
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
         and f.data ->> 'key' = v_key;

      if not coalesce(v_multi, false)
         and (select count(*) from jsonb_array_elements(p_files) x
               where nullif(btrim(coalesce(x.value ->> 'field', '')), '') = v_key) > 1 then
        raise exception 'This capture has more than one file for "%", which holds one.', v_key
          using errcode = '22004',
                hint = 'Send one file for that question, or ask whoever set the sheet up to let that field hold several.';
      end if;

      for v_att in select value from jsonb_array_elements(p_files)
                    where nullif(btrim(coalesce(value ->> 'field', '')), '') = v_key loop
        v_file := custom.record_write(p_organization_id, custom.file_kernel_id(),
                    jsonb_strip_nulls(jsonb_build_object(
                      'name',       coalesce(nullif(v_att ->> 'name', ''), 'capture'),
                      'mime_type',  nullif(v_att ->> 'mime_type', ''),
                      'size_bytes', nullif(v_att ->> 'size_bytes', '')::bigint,
                      'url',        nullif(v_att ->> 'url', ''),
                      'file_id',    nullif(v_att ->> 'file_id', ''),
                      'duration_ms', nullif(v_att ->> 'duration_ms', '')::bigint,
                      '_actor',     'user',
                      '_source',    jsonb_build_object('via', 'capture',
                                                       'sheet_id', p_sheet_id::text,
                                                       'client_key', p_client_key,
                                                       'device', p_device,
                                                       'captured_at', v_at,
                                                       'at_place', p_location))));
        v_of_key := v_of_key || v_file;
        v_files  := v_files || v_file;
      end loop;
      v_doc := v_doc || jsonb_build_object(v_key,
                 case when coalesce(v_multi, false)
                      then to_jsonb(array(select x::text from unnest(v_of_key) x))
                      else to_jsonb(v_of_key[1]::text) end);
    end loop;
  end if;

  -- THE PROVENANCE IS ON THE RECORD (VAL-1, VAL-7). `captured_at` is the moment the phone
  -- took it; `arrived_at` is the moment the network came back. A queue that collapsed the
  -- two would make every capture in a day look like it happened at five o'clock.
  v_source := jsonb_strip_nulls(jsonb_build_object(
                'via',         'capture',
                'sheet_id',    p_sheet_id::text,
                'sheet_title', v_f.title,
                'client_key',  p_client_key,
                'device',      p_device,
                'captured_at', v_at,
                'arrived_at',  now(),
                'at_place',    p_location));

  v_rec := custom.record_write(p_organization_id, v_f.table_id,
             v_doc || jsonb_build_object('_actor', 'user', '_source', v_source));

  update custom.anon_replay set record_id = v_rec
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;

  if v_f.notify_rule_id is not null then
    perform custom.form_notify(p_organization_id, v_f.id, v_rec, null);
  end if;

  record_id := v_rec; state := 'captured'; replay := false;
  file_ids := case when cardinality(v_files) > 0 then v_files else null end;
  message := null;
  return next;
end;
$fn$;

  perform set_config('role', 'authenticated', true);

  -- ══ RED 3 — the OUT parameter that makes the last statement ambiguous at RUN time ══
  begin
    select record_id into v_rec from custom.capture_submit(v_org, v_sheet, 'red-3',
             jsonb_build_object('bin_id', 'B-3'),
             jsonb_build_array(jsonb_build_object('field', 'photo', 'name', 'b3.jpg')));
    raise exception 'RED 3 DID NOT FIRE — the ambiguous reference did not raise (%)', v_rec;
  exception when others then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%ambiguous%' then raise; end if;
    v_fired := v_fired + 1;
    raise notice 'RED 3 FIRED — "%"', v_txt;
  end;

  -- ══ RED 4 — without the CHECK, a crew sheet becomes an anonymous write door ════════
  perform set_config('role', v_boss, true);
  -- custom.anon_form is a live shared table and this takes ACCESS EXCLUSIVE on it for the
  -- few milliseconds before the rollback; under campaign load the 30 s default is not
  -- always enough to even get the lock, and a red twin that cannot take its lock has proven
  -- nothing rather than proven something.
  perform set_config('lock_timeout', '180s', true);
  alter table custom.anon_form drop constraint anon_form_crew_is_never_public;
  update custom.anon_form set published_at = now() where organization_id = v_org and id = v_sheet;
  select (published_at is not null) into v_pub from custom.anon_form
   where organization_id = v_org and id = v_sheet;
  perform set_config('role', 'authenticated', true);
  if not v_pub then
    raise exception 'RED 4 DID NOT FIRE — the row refused to publish even with the constraint gone';
  end if;
  v_fired := v_fired + 1;
  raise notice 'RED 4 FIRED — with the constraint dropped, a PRIVATE crew sheet is published to the world and custom.form_public would hand it to a stranger';

  if v_fired <> 4 then
    raise exception 'only % of 4 reds fired', v_fired;
  end if;
  raise notice '=== ALL FOUR REDS FIRED ===';
end;
$suite$;

rollback;
