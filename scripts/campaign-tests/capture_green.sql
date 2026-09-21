-- scripts/campaign-tests/capture_green.sql — lane CAPTURE, from the seat.
--
-- PRODUCTS row 15, SCR-30: *"Let my crew photograph each bin and log the weight on site."*
-- Every asserted clause below PART 0 runs as `authenticated` — the role PostgREST serves a
-- signed-in person — through the doors that person reaches. There is no server-lane door in
-- this lane: a capture sheet is private and the crew member calls it as themselves, so this
-- suite never steps out except for the two fixture statements that no client door covers,
-- and it says so at each one.
--
-- The two seats: `admin@admin.com` is the foreman who owns the organization, the Table and
-- the sheet; `test@test.com` is a crew member who was shared the Table at VIEWER, which is
-- one rung below what capturing needs.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
set local statement_timeout = '600s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f_bin   uuid;
  v_f_wt    uuid;
  v_f_photo uuid;
  v_f_voice uuid;
  v_sheet   uuid;
  v_open    timestamptz;
  v_rec     uuid;
  v_rec2    uuid;
  v_key     text := 'cap-' || left(gen_random_uuid()::text, 13);
  v_key2    text := 'cap-' || left(gen_random_uuid()::text, 13);
  v_doc     jsonb;
  v_src     jsonb;
  v_files   uuid[];
  v_txt     text;
  v_n       bigint;
  v_row     record;
  v_fired   boolean;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Hands & Hope Alliance Green ' || left(v_org::text, 8), 'hands-hope-green-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'capture_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/capture_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 1 — the Table a crew fills: a reading, a photo and a voice note ═══════
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Yard', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Bins', 'slug', 'bins', 'description', 'one row per bin, filled on site',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'bin_id', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Bin', 'label_plural', 'Bins',
      'title_field', 'bin_id',
      'fields', jsonb_build_array(jsonb_build_object('name', 'bin_id')),
      'parent_id', v_home));
  v_f_bin   := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'bin', 'key', 'bin_id', 'type', 'text', 'required', true));
  v_f_wt    := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'weight', 'key', 'weight_kg', 'type', 'range', 'unit', 'kg'));
  v_f_photo := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'photo', 'key', 'photo', 'type', 'relation',
                                                                       'relation_target', custom.file_kernel_id()));
  v_f_voice := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'voice note', 'key', 'voice_note', 'type', 'relation',
                                                                       'relation_target', custom.file_kernel_id()));

  -- The photo field must be a relation onto the File kernel — REC-31's shape — or the file
  -- arm of the write door is pointed at nothing and this suite would be proving a
  -- coincidence. Asked of custom.applicable_fields, the door a screen uses to read columns.
  -- (custom.parity_type itself is NOT client-callable, which is right: it is a helper the
  -- doors use, and custom.capture_open hands its answer out in PART 2.)
  select f.data ->> 'key' into v_txt
    from custom.applicable_fields(v_org, v_table, null) f
   where f.data ->> 'key' = 'photo'
     and f.data ->> 'type' = 'relation'
     and (f.data ->> 'relation_target')::uuid = '11111111-0000-4000-8000-000000000006'::uuid;
  if v_txt is null then
    raise exception '1: the photo field is not a relation onto the File kernel, so REC-31 is not being tested';
  end if;
  raise notice 'PART 1 PASSED — Bins has bin_id, weight_kg and two File-kernel relations';

  -- ══ PART 2 — CLOSED BY DEFAULT: a sheet nobody opened takes nothing ════════════
  v_sheet := custom.capture_sheet_declare(v_org, v_table, 'Bin round', jsonb_build_array(
      jsonb_build_object('field', 'bin_id',     'ask', 'Which bin is this?', 'required', true),
      jsonb_build_object('field', 'weight_kg',  'ask', 'What does it weigh?', 'help', 'kilograms, off the scale', 'required', true),
      jsonb_build_object('field', 'photo',      'ask', 'Photograph the bin', 'required', true),
      jsonb_build_object('field', 'voice_note', 'ask', 'Anything worth saying?')),
      jsonb_build_object('intro', 'One bin at a time.', 'thank_you',
                         jsonb_build_object('title', 'Logged', 'body', 'Next bin.')));

  select state, may_capture, message, fields into v_row from custom.capture_open(v_org, v_sheet);
  if v_row.state <> 'not open yet' or v_row.may_capture then
    raise exception '2: a sheet nobody opened says % / may_capture %', v_row.state, v_row.may_capture;
  end if;

  -- The phone loads the sheet ONCE and then runs with no network, so everything it needs to
  -- render and validate has to be in this one answer: the field's id, its type, whether it
  -- is required, and the parity type that decides whether the control is a camera.
  if jsonb_array_length(v_row.fields) <> 4 then
    raise exception '2: the phone was handed % fields, not 4', jsonb_array_length(v_row.fields);
  end if;
  select value ->> 'parity_type' into v_txt
    from jsonb_array_elements(v_row.fields) where value ->> 'key' = 'photo';
  if v_txt <> 'attachment' then
    raise exception '2: the phone is told the photo field is a %, so it would not open a camera', v_txt;
  end if;
  select (value ->> 'required')::boolean::text into v_txt
    from jsonb_array_elements(v_row.fields) where value ->> 'key' = 'voice_note';
  if v_txt <> 'false' then
    raise exception '2: the optional voice note came back required';
  end if;
  raise notice '2: the phone is told: "%"', v_row.message;

  select state, message into v_row
    from custom.capture_submit(v_org, v_sheet, v_key, jsonb_build_object('bin_id', 'B-1'));
  if v_row.state <> 'not open yet' then
    raise exception '2: an unopened sheet accepted a capture (%)', v_row.state;
  end if;
  if v_row.message not like '%Nothing was lost%' then
    raise exception '2: the refusal does not tell the phone its capture is safe: %', v_row.message;
  end if;
  raise notice 'PART 2 PASSED — closed by default, and the refusal says the capture is not lost';

  -- ══ PART 3 — the publish act, and the wall that keeps a crew sheet private ══════
  v_open := custom.capture_publish(v_org, v_sheet, true);
  if v_open is null then
    raise exception '3: capture_publish returned no moment';
  end if;

  -- THE CONSTRAINT, not a habit: this sheet cannot be turned into an anonymous door.
  v_fired := false;
  begin
    perform set_config('role', v_boss, true);  -- steps out: no client door publishes a form
                                               -- to the world by writing the column directly,
                                               -- which is exactly why the CHECK exists.
    update custom.anon_form set published_at = now() where organization_id = v_org and id = v_sheet;
  exception when check_violation then v_fired := true;
  end;
  perform set_config('role', 'authenticated', true);
  if not v_fired then
    raise exception '3: a crew sheet was published to the world — anon_form_crew_is_never_public did not fire';
  end if;

  select state into v_txt from custom.capture_open(v_org, v_sheet);
  if v_txt <> 'open' then
    raise exception '3: after publishing, the sheet reads %', v_txt;
  end if;
  raise notice 'PART 3 PASSED — opened to the crew, and the database itself refuses to publish it to the world';

  -- ══ PART 4 — ONE TAKE: a reading, a photograph and a voice note ════════════════
  select record_id, state, replay, file_ids into v_row
    from custom.capture_submit(v_org, v_sheet, v_key,
           jsonb_build_object('bin_id', 'B-1', 'weight_kg', 412),
           jsonb_build_array(
             jsonb_build_object('field', 'photo', 'name', 'bin-b1.jpg', 'mime_type', 'image/jpeg',
                                'size_bytes', '284913', 'file_id', gen_random_uuid()::text,
                                'url', 'https://files.handsandhopealliance.org/bin-b1.jpg'),
             jsonb_build_object('field', 'voice_note', 'name', 'note.webm', 'mime_type', 'audio/webm',
                                'size_bytes', '19204', 'duration_ms', '4100',
                                'file_id', gen_random_uuid()::text)),
           'Pixel 9 · Chrome 141', now() - interval '3 hours',
           jsonb_build_object('lat', 32.7767, 'lon', -96.7970, 'accuracy_m', 8));
  v_rec := v_row.record_id; v_files := v_row.file_ids;
  if v_rec is null or v_row.state <> 'captured' or v_row.replay then
    raise exception '4: the capture did not land (state %, replay %)', v_row.state, v_row.replay;
  end if;
  if cardinality(v_files) <> 2 then
    raise exception '4: % File records, expected 2', cardinality(v_files);
  end if;

  v_doc := custom.read_record(v_org, v_rec, true);
  if v_doc ->> 'bin_id' <> 'B-1' then
    raise exception '4: the door reads bin_id %', v_doc ->> 'bin_id';
  end if;
  if (v_doc ->> 'photo')::uuid is null then
    raise exception '4: the photo field does not point at a File record: %', v_doc -> 'photo';
  end if;
  raise notice '4: the record reads bin %, weight %, photo %, voice note %',
    v_doc ->> 'bin_id', v_doc ->> 'weight_kg', v_doc -> 'photo', v_doc -> 'voice_note';

  -- ══ PART 5 — THE PROVENANCE IS ON THE RECORD, not only in the ledger ═══════════
  v_src := v_doc -> '_source';
  if v_src ->> 'via' <> 'capture' then
    raise exception '5: _source.via is %', coalesce(v_src ->> 'via', '(absent)');
  end if;
  if (v_src ->> 'sheet_id')::uuid <> v_sheet then
    raise exception '5: _source does not name the sheet';
  end if;
  if v_src ->> 'device' <> 'Pixel 9 · Chrome 141' then
    raise exception '5: _source does not name the device: %', v_src ->> 'device';
  end if;
  if (v_src ->> 'captured_at')::timestamptz >= (v_src ->> 'arrived_at')::timestamptz then
    raise exception '5: the moment the phone took it is not before the moment it arrived — a queue that collapses the two makes a whole day look like five o''clock';
  end if;
  if (v_src -> 'at_place' ->> 'lat')::numeric is null then
    raise exception '5: _source carries no place';
  end if;
  -- VAL-7: the VALUE carries who wrote it and when, asked of the door that reads one
  -- value's envelope. The moment on the VALUE is the moment it was WRITTEN; the moment the
  -- phone took the capture is on _source, which is why both are kept.
  declare v_env record; begin
    select actor, written_at, source into v_env from custom.value_read(v_org, v_rec, 'bin_id');
    if v_env.actor is distinct from 'user' then
      raise exception '5: the bin was not recorded as a person''s act, but as %', v_env.actor;
    end if;
    raise notice '5: the value says actor %, written %', v_env.actor, v_env.written_at;
  end;
  raise notice '5: taken % on %, arrived %, at %,%',
    v_src ->> 'captured_at', v_src ->> 'device', v_src ->> 'arrived_at',
    v_src -> 'at_place' ->> 'lat', v_src -> 'at_place' ->> 'lon';

  -- and the File record carries its own, because a photograph separated from when and
  -- where it was taken is not evidence of anything.
  v_doc := custom.read_record(v_org, v_files[1], true);
  if v_doc -> '_source' ->> 'via' <> 'capture' or v_doc -> '_source' ->> 'device' is null then
    raise exception '5: the File record has no provenance of its own: %', v_doc -> '_source';
  end if;
  raise notice 'PART 5 PASSED — the record and the photograph both say where they came from';

  -- ══ PART 6 — A RETRIED UPLOAD DOUBLES NOTHING ══════════════════════════════════
  select record_id, state, replay, message into v_row
    from custom.capture_submit(v_org, v_sheet, v_key,
           jsonb_build_object('bin_id', 'B-1', 'weight_kg', 412),
           jsonb_build_array(jsonb_build_object('field', 'photo', 'name', 'bin-b1.jpg',
                                                'mime_type', 'image/jpeg', 'size_bytes', '284913')),
           'Pixel 9 · Chrome 141', now() - interval '3 hours', null);
  if v_row.record_id <> v_rec then
    raise exception '6: the replay wrote a different record (% vs %)', v_row.record_id, v_rec;
  end if;
  if not v_row.replay then
    raise exception '6: the replay did not say it was one';
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_table, true, 200, 0);
  if v_n <> 1 then
    raise exception '6: % rows in the table after one capture and one retry', v_n;
  end if;
  raise notice 'PART 6 PASSED — "%" · still % row', v_row.message, v_n;

  -- ══ PART 7 — A REFUSED CAPTURE SAYS WHY AND LOSES NOTHING ══════════════════════
  v_fired := false;
  begin
    perform custom.capture_submit(v_org, v_sheet, v_key2,
              jsonb_build_object('bin_id', 'B-2'));   -- no weight, no photograph
  exception when sqlstate '22004' then
    v_fired := true; get stacked diagnostics v_txt = message_text;
  end;
  if not v_fired then
    raise exception '7: a capture missing two required answers was accepted';
  end if;
  if v_txt not like '%weight_kg%' or v_txt not like '%photo%' then
    raise exception '7: the refusal does not name what is missing: %', v_txt;
  end if;
  raise notice '7: "%"', v_txt;

  -- and it is still the phone''s to retry: no ledger row, no record, no half-written row.
  select count(*) into v_n from custom.read_records(v_org, v_table, true, 200, 0);
  if v_n <> 1 then
    raise exception '7: the refused capture left % rows behind', v_n;
  end if;

  v_fired := false;
  begin
    perform custom.capture_submit(v_org, v_sheet, v_key2,
              jsonb_build_object('bin_id', 'B-2', 'weight_kg', 10, 'salary', 90000),
              jsonb_build_array(jsonb_build_object('field', 'photo', 'name', 'x.jpg')));
  exception when sqlstate '42501' then
    v_fired := true; get stacked diagnostics v_txt = message_text;
  end;
  if not v_fired or v_txt not like '%salary%' then
    raise exception '7: a key the sheet does not ask for was not refused by name (%)', v_txt;
  end if;
  raise notice 'PART 7 PASSED — "%"', v_txt;

  -- ══ PART 8 — THE FOREMAN'S LIST ════════════════════════════════════════════════
  select sheet_id, title, state, captures, replays into v_row
    from custom.capture_sheets(v_org, v_table);
  if v_row.sheet_id <> v_sheet or v_row.state <> 'open' then
    raise exception '8: the list does not show the open sheet';
  end if;
  if v_row.captures <> 1 or v_row.replays < 1 then
    raise exception '8: the list counts % captures and % replays', v_row.captures, v_row.replays;
  end if;
  raise notice 'PART 8 PASSED — % · % · % capture, % retry', v_row.title, v_row.state, v_row.captures, v_row.replays;

  -- ══ PART 9 — THE MEMBER AT VIEWER CANNOT CAPTURE, AND IS TOLD SO ═══════════════
  perform custom.share_grant(v_org, v_table, 'person', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- the control: she CAN see the sheet, because she can open the table.
  select state, may_capture, message into v_row from custom.capture_open(v_org, v_sheet);
  if v_row.state is null then
    raise exception '9: a member shared the table at viewer cannot even see the sheet';
  end if;
  if v_row.may_capture then
    raise exception '9: a viewer was told she may capture';
  end if;
  if v_row.message not like '%editor%' then
    raise exception '9: the screen is not told what she is missing: %', v_row.message;
  end if;
  raise notice '9: she is told, in words: "%"', v_row.message;

  v_fired := false;
  begin
    perform custom.capture_submit(v_org, v_sheet, 'cap-dana-' || left(gen_random_uuid()::text, 8),
              jsonb_build_object('bin_id', 'B-9', 'weight_kg', 1),
              jsonb_build_array(jsonb_build_object('field', 'photo', 'name', 'x.jpg')));
  exception when insufficient_privilege then
    v_fired := true; get stacked diagnostics v_txt = message_text;
  end;
  if not v_fired then
    raise exception '9: a viewer captured into a table she may only look at';
  end if;

  -- AND THE SAME SENTENCE for a sheet that is not there at all, so the door is not an
  -- existence oracle: a sheet she may not reach and a sheet that does not exist read alike.
  declare v_txt2 text; begin
    begin
      perform custom.capture_submit(v_org, gen_random_uuid(), 'cap-ghost', jsonb_build_object('bin_id', 'x'));
    exception when insufficient_privilege then get stacked diagnostics v_txt2 = message_text;
    end;
    if v_txt2 is distinct from v_txt then
      raise exception '9: an unreachable sheet and an absent sheet answer differently: "%" vs "%"', v_txt, v_txt2;
    end if;
  end;
  raise notice 'PART 9 PASSED — "%", and a sheet that does not exist says exactly the same', v_txt;

  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '=== ALL PARTS PASSED ===';
end;
$suite$;

rollback;
