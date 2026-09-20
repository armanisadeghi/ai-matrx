-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.capture_submit(uuid, uuid, text, jsonb, jsonb, text, timestamp with time zone, jsonb) 869caf7dea3b7b284ce9a43c393bdded3e4404f46ffc4770ef0eb378f2c1d7c7
--
-- LANE CAPTURE — THE THIRD DEFECT THE SUITE FOUND: the door could never finish a capture.
--
-- `custom.capture_submit` RETURNS TABLE(record_id uuid, ...), so `record_id` is an OUT
-- parameter inside the body — and the last statement of the write path said
-- `where ... and record_id is null` against `custom.anon_replay`, which has a column of that
-- name too. Postgres refuses the whole statement (`column reference "record_id" is
-- ambiguous`) at RUN time, not at CREATE time, so the function existed, was granted,
-- declared and reviewed, and raised on every single call. It is the class the campaign's own
-- door census exists for: a door that parses is not a door that works. Measured in
-- capture_green.sql PART 4.
--
-- THE INVERSE: `migrations/inverse/capture_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

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
   where anon_replay.organization_id = p_organization_id
     and anon_replay.client_key = p_client_key
     and anon_replay.record_id is null;

  if v_f.notify_rule_id is not null then
    perform custom.form_notify(p_organization_id, v_f.id, v_rec, null);
  end if;

  record_id := v_rec; state := 'captured'; replay := false;
  file_ids := case when cardinality(v_files) > 0 then v_files else null end;
  message := null;
  return next;
end;
$fn$;
