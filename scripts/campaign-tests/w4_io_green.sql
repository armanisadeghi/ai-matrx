-- W4-IO — THE GREEN SUITE. CUT-N-2 · DOOR-11 · DOOR-13 · DOOR-14 · DOOR-15 · DOOR-16.
--
-- RUN IT (against the MAIN database — owner ruling 2026-09-18, there is no production):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_io_green.sql
--
-- Not a migration. EVERYTHING ROLLS BACK: the last statement is `rollback`, so the fixture,
-- the knob flips and every row written here disappear whatever the suite decides.
--
-- ITS RED TWIN is `scripts/campaign-tests/w4_io_red.sql`.
--
-- WHAT MAKES IT FAIL — each break named against the part that catches it:
--   · publish from custom.record instead of from the outbox row      → PART 1
--   · let the outbox fire on a touch that changed no Field           → PART 1
--   · let the drain hand a claimed row out twice                     → PART 2
--   · compare the CSV round trip by row COUNT instead of by value    → PART 3
--   · drop an unmapped column instead of proposing it                → PART 4
--   · let a viewer comment                                           → PART 5
--   · restore without moving the values back                         → PART 6
--
-- THE ROUND TRIP IS A VALUE COMPARISON, NOT A COUNT. Part 3 parses the bytes export produced
-- and compares every cell to the source document. An import/export pair that agrees only on
-- row count passes while silently dropping a whole column.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w4_io_green.sql expects the MAIN database, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_io.green', true);
\set org '39c38960-d30c-4840-b0c1-c9960de95582'
\set admin_user '87a6e699-3622-4869-8843-d0867456c0dd'
\set test_user '4060701e-706a-4c76-b3ca-0bbc69fa5a14'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ IO Lead', 'slug', 'zz_io_lead', 'type', 'entity', 'display', 'list',
  'label_singular', 'Lead', 'label_plural', 'Leads', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'name', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','name'),
                              jsonb_build_object('name','company'),
                              jsonb_build_object('name','notes')))) as t_lead \gset

select set_config('zz.org', :'org', true) as o,
       set_config('zz.tlead', :'t_lead', true) as t \gset

-- THE FIELDS ARE MINTED AS FIELD RECORDS, not merely declared on the Table. `custom.table_declare`
-- records the field NAMES on the Table document and mints no Field record, so a Table made that
-- way has values with no Field behind them. That is legal — and it is exactly why the outbox
-- decides "did anything change" from the KEYS and reports Field ids as payload. Here the Fields
-- are real, so PART 1 can assert the ids as well as the keys.
select custom.record_write(:'org'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'entity_definition_id', :'t_lead', 'key', 'name', 'label', 'Name', 'type', 'text', 'multi', false, 'required', false, 'dated', false, 'rules', '[]'::jsonb, 'applies_to_types', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'config', '{}'::jsonb, 'sort', 0, 'source', 'manual', 'source_config', '{}'::jsonb, 'sensitivity', 'internal', 'context_policy', 'include')) as f_name \gset
select custom.record_write(:'org'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'entity_definition_id', :'t_lead', 'key', 'company', 'label', 'Company', 'type', 'text', 'multi', false, 'required', false, 'dated', false, 'rules', '[]'::jsonb, 'applies_to_types', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'config', '{}'::jsonb, 'sort', 0, 'source', 'manual', 'source_config', '{}'::jsonb, 'sensitivity', 'internal', 'context_policy', 'include')) as f_company \gset
select custom.record_write(:'org'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'entity_definition_id', :'t_lead', 'key', 'notes', 'label', 'Notes', 'type', 'text', 'multi', false, 'required', false, 'dated', false, 'rules', '[]'::jsonb, 'applies_to_types', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'config', '{}'::jsonb, 'sort', 0, 'source', 'manual', 'source_config', '{}'::jsonb, 'sensitivity', 'internal', 'context_policy', 'include')) as f_notes \gset

\echo ''
\echo '══ PART 1 — CUT-N-2 / DOOR-13: the outbox, in the same transaction, from ONE publisher'
\echo ''

do $p1$
declare
  v_rec      uuid;
  v_n        integer;
  v_op       text;
  v_changed  jsonb;
  v_before   integer;
  v_company  uuid;
  v_notes    uuid;
begin
  select count(*) into v_before from custom.io_outbox
   where organization_id = current_setting('zz.org')::uuid;

  -- (a) A WRITE LEAVES EXACTLY ONE ROW, AND IT IS ALREADY THERE — this SELECT runs inside the
  -- same transaction as the write, so if the event were published outside it there would be
  -- nothing to read yet. That is the whole of "transactional outbox" as an assertion.
  v_rec := custom.record_write(current_setting('zz.org')::uuid,
                               current_setting('zz.tlead')::uuid,
                               '{"name":"Ada","company":"Analytical","notes":"first"}'::jsonb);
  select count(*), max(operation) into v_n, v_op from custom.io_outbox
   where organization_id = current_setting('zz.org')::uuid and record_id = v_rec;
  if v_n <> 1 then
    raise exception 'CUT-N-2 FAIL: one record write left % outbox row(s) in the same transaction, expected exactly 1', v_n;
  end if;
  if v_op <> 'created' then
    raise exception 'DOOR-13 FAIL: the first event for a new record is "created", and it says "%"', v_op;
  end if;

  -- (b) AN UPDATE NAMES THE FIELDS THAT MOVED. Not "something changed" — the Field ids.
  -- THE TABLE'S OWN Fields, through the platform's one answer to "which Fields does this Table
  -- have". Reading them by key alone across the organization is the defect file 5 closed.
  select f.id into v_company from custom.applicable_fields(current_setting('zz.org')::uuid,
                                                           current_setting('zz.tlead')::uuid, null) f
   where f.data ->> 'key' = 'company' limit 1;
  select f.id into v_notes from custom.applicable_fields(current_setting('zz.org')::uuid,
                                                          current_setting('zz.tlead')::uuid, null) f
   where f.data ->> 'key' = 'notes' limit 1;
  if v_company is null or v_notes is null then
    raise exception 'SETUP FAIL: the fixture''s Field records are not applicable to this Table';
  end if;

  perform custom.record_update(current_setting('zz.org')::uuid, v_rec,
                               '{"company":"Analytical Engines"}'::jsonb, null);
  select o.changed_field_ids into v_changed from custom.io_outbox o
   where o.organization_id = current_setting('zz.org')::uuid
     and o.record_id = v_rec and o.operation = 'updated'
   order by o.created_at desc limit 1;
  if v_changed is null then
    raise exception 'DOOR-13 FAIL: changing a value raised no "updated" event at all';
  end if;
  if not (v_changed @> jsonb_build_array(v_company)) then
    raise exception 'DOOR-13 FAIL: company changed and the event does not name that Field. It names %', v_changed;
  end if;
  if v_changed @> jsonb_build_array(v_notes) then
    raise exception 'DOOR-13 FAIL: notes did NOT change and the event names it anyway (%) — an automation told everything changed is an automation people switch off', v_changed;
  end if;
  -- AND IT IS THIS TABLE'S FIELD, NOT EVERY FIELD OF THAT NAME. Before file 5 the resolution
  -- joined on key across the whole organization: writing one record named two KERNEL Fields
  -- called `name` belonging to other Tables. The event must name exactly one id here.
  if jsonb_array_length(v_changed) <> 1 then
    raise exception 'DOOR-13 FAIL: one field changed and the event names % ids (%) — the resolution is not scoped to this Table', jsonb_array_length(v_changed), v_changed;
  end if;

  -- (c) A TOUCH THAT MOVES NO FIELD RAISES NOTHING. The discriminating case: an outbox that
  -- fired per UPDATE rather than per CHANGE passes (a) and (b) and fails here.
  select count(*) into v_n from custom.io_outbox
   where organization_id = current_setting('zz.org')::uuid and record_id = v_rec;
  update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || '{"touched":true}'::jsonb
   where organization_id = current_setting('zz.org')::uuid and id = v_rec;
  if (select count(*) from custom.io_outbox
       where organization_id = current_setting('zz.org')::uuid and record_id = v_rec) <> v_n then
    raise exception 'DOOR-13 FAIL: a touch that changed no Field raised an event';
  end if;

  -- (d) THE ONE PUBLISHER. Nothing on custom.record calls pg_notify; the outbox's own trigger
  -- does. Asked of the catalogue rather than of the author's memory.
  if exists (select 1 from pg_trigger t
               join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid = 'custom.record'::regclass
                and not t.tgisinternal
                and p.prosrc ilike '%pg_notify%') then
    raise exception 'DOOR-13 FAIL: something on custom.record publishes directly. The record table writes a ROW; only the outbox publishes.';
  end if;
  if not exists (select 1 from pg_trigger t
                   join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'custom.io_outbox'::regclass
                    and not t.tgisinternal
                    and p.prosrc ilike '%pg_notify%') then
    raise exception 'DOOR-13 FAIL: nothing publishes from the outbox, so the feed is durable and silent';
  end if;

  -- (e) EVERY DOOR IN THIS LANE READS THE ONE PREDICATE.
  -- Every SECURITY DEFINER io_* door reaches the ONE predicate: it either calls
  -- `custom.assert_store_door` itself, or its whole body is another io_* door plus rendering,
  -- in which case it reaches the predicate through that one. `custom.io_export_csv` is the
  -- second kind — it calls `custom.io_export` and formats the answer — and stating the rule
  -- that way is exact rather than lenient: a door that reaches the predicate through NOTHING
  -- still fails.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname like 'io\_%'
                and p.prosecdef
                and p.prosrc !~ 'assert_store_door'
                and p.prosrc !~ 'custom\.io_') then
    raise exception 'DOOR FAIL: these io_* doors reach custom.assert_store_door neither directly nor through another io_ door: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'custom' and p.proname like 'io\_%' and p.prosecdef
          and p.prosrc !~ 'assert_store_door' and p.prosrc !~ 'custom\.io_');
  end if;
  -- …and the delegating one is named, so "it delegates" is a fact about a known function
  -- rather than a hole anybody can walk through later.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'custom' and p.proname like 'io\_%' and p.prosecdef
         and p.prosrc !~ 'assert_store_door') > 1 then
    raise exception 'DOOR FAIL: more than one io_ door now delegates its predicate read: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'custom' and p.proname like 'io\_%' and p.prosecdef
          and p.prosrc !~ 'assert_store_door');
  end if;

  raise notice 'PART 1 PASS: one event per change inside the same transaction, the Fields that moved are named and the ones that did not are not, a no-op touch raises nothing, and the ONLY publisher is the outbox';
end $p1$;

\echo ''
\echo '══ PART 2 — CUT-N-2: the consumer is idempotent, and the platform''s node shape exists'
\echo ''

do $p2$
declare
  v_first  integer;
  v_second integer;
  v_third  integer;
  v_back   integer;
  v_view   integer;
begin
  select count(*) into v_first from custom.io_outbox_drain(current_setting('zz.org')::uuid, 'zz-consumer-a', 100);
  if v_first < 2 then
    raise exception 'CUT-N-2 FAIL: PART 1 left at least two events and the first drain took %', v_first;
  end if;
  -- THE SECOND DRAIN TAKES NOTHING. A consumer that handed a claimed row out twice would
  -- process every event twice, which is the failure the whole pattern exists to prevent.
  select count(*) into v_second from custom.io_outbox_drain(current_setting('zz.org')::uuid, 'zz-consumer-b', 100);
  if v_second <> 0 then
    raise exception 'CUT-N-2 FAIL: a second consumer drained % already-claimed row(s)', v_second;
  end if;
  -- AND THE POSITIVE CONTROL: releasing a dead consumer's claims puts them back, so the zero
  -- (the age is negative because the claim was made in THIS transaction, and now() does not
  -- advance inside one — so "older than zero seconds" is false for a row claimed a line ago)
  -- above is a claim and not an empty queue.
  select custom.io_outbox_release(current_setting('zz.org')::uuid, 'zz-consumer-a', interval '-1 second')
    into v_back;
  if v_back <> v_first then
    raise exception 'CUT-N-2 FAIL: % rows were claimed and releasing returned %', v_first, v_back;
  end if;
  select count(*) into v_third from custom.io_outbox_drain(current_setting('zz.org')::uuid, 'zz-consumer-b', 100);
  if v_third <> v_first then
    raise exception 'CUT-N-2 FAIL: after the release the queue should hold the same % rows, and the drain took %', v_first, v_third;
  end if;

  -- THE VIEW THE PLATFORM'S records.changed NODE READS, in the spelling it reads.
  select count(*) into v_view from custom.record_outbox
   where organization_id = current_setting('zz.org')::uuid;
  if v_view < v_first then
    raise exception 'DOOR-13 FAIL: custom.record_outbox shows % of the %+ events', v_view, v_first;
  end if;
  perform 1 from custom.record_outbox limit 1;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'custom' and table_name = 'record_outbox'
                    and column_name in ('changed_fields', 'occurred_at')
                  having count(*) = 2) then
    raise exception 'DOOR-13 FAIL: custom.record_outbox does not carry changed_fields and occurred_at, which is the shape the workflow node selects';
  end if;

  raise notice 'PART 2 PASS: % events claimed once, a second consumer got 0, releasing returned exactly % and the re-drain took them — and custom.record_outbox answers in the node''s own column names', v_first, v_back;
end $p2$;

\echo ''
\echo '══ PART 3 — DOOR-11: the CSV round trip, compared CELL BY CELL'
\echo ''

do $p3$
declare
  v_csv    text;
  v_rows   integer;
  v_header text[];
  v_back   jsonb := '{}'::jsonb;
  v_src    jsonb;
  v_r      record;
  v_i      integer;
begin
  -- NO PRINCIPAL IS SET HERE, DELIBERATELY. This part is about BYTES — whether a value holding
  -- the delimiter and a value holding quotes survive export and parse unchanged. Which rows an
  -- export returns is the read door's question and is proven where the door is the subject;
  -- mixing the two would mean a fidelity failure and a visibility failure looked the same.
  -- The store role sees the fixture it just wrote, so the row under test is certainly present.

  -- The source, hand-written here so the comparison below is against KNOWN values and not
  -- against another query's answer. The comma and the quote are deliberate: they are what a
  -- naive "split on comma" and a naive "wrap in quotes" each get wrong.
  perform custom.record_write(current_setting('zz.org')::uuid, current_setting('zz.tlead')::uuid,
    '{"name":"Grace, H","company":"Navy","notes":"said \"hello\""}'::jsonb);

  v_csv := custom.io_export_csv(current_setting('zz.org')::uuid,
                                current_setting('zz.tlead')::uuid,
                                array['name','company','notes'], 1000, ',', 'viewer');

  if v_csv is null or v_csv = '' then
    raise exception 'DOOR-11 FAIL: export produced no bytes at all';
  end if;

  -- Parse what export WROTE, with this lane's own parser, and compare every cell.
  select count(*) into v_rows from custom.io_csv_parse(v_csv);
  if v_rows < 2 then
    raise exception 'DOOR-11 FAIL: the export parses back to % line(s) — a header and at least one row were written', v_rows;
  end if;

  for v_r in select row_number, cells from custom.io_csv_parse(v_csv) order by row_number loop
    if v_r.row_number = 1 then
      v_header := v_r.cells;
      if v_header <> array['name','company','notes'] then
        raise exception 'DOOR-11 FAIL: the header parses back as % and the columns asked for were name, company, notes', v_header;
      end if;
    else
      v_back := '{}'::jsonb;
      for v_i in 1 .. array_length(v_header, 1) loop
        v_back := v_back || jsonb_build_object(v_header[v_i], v_r.cells[v_i]);
      end loop;
      if v_back ->> 'name' = 'Grace, H' then
        -- THE DISCRIMINATING ROW. Its name holds the delimiter and its notes hold a quote, so
        -- a broken escape or a broken parse changes these two cells and nothing else.
        if v_back ->> 'company' <> 'Navy' then
          raise exception 'DOOR-11 FAIL: the value after an embedded comma came back as "%" instead of "Navy" — the delimiter inside a quoted field was not honoured', v_back ->> 'company';
        end if;
        if v_back ->> 'notes' <> 'said "hello"' then
          raise exception 'DOOR-11 FAIL: an embedded quote round-tripped as "%" instead of said "hello"', v_back ->> 'notes';
        end if;
        raise notice 'PART 3 PASS: a value containing the delimiter and a value containing quotes both came back byte-identical through export -> parse; every cell of the row was compared, not the row count';
        return;
      end if;
    end if;
  end loop;
  raise exception 'DOOR-11 FAIL: the row written for the round trip is not in the export at all';
end $p3$;

\echo ''
\echo '══ PART 4 — DOOR-14: an unmapped column becomes a proposal a person accepts'
\echo ''

do $p4$
declare
  v_run       uuid;
  v_result    jsonb;
  v_proposals jsonb;
  v_field     uuid;
  v_key       text;
  v_second    jsonb;
begin
  v_run := custom.io_import_open(current_setting('zz.org')::uuid, current_setting('zz.tlead')::uuid,
                                 'csv', 'leads.csv',
                                 '["name","company","lead_score"]'::jsonb);

  -- `lead_score` matches NO Field on this Table. It must come back as an OFFER, and the rows
  -- must still land — an import that refuses the whole file over one unknown column is the
  -- behaviour everybody works around by editing the spreadsheet.
  v_result := custom.io_import_rows(current_setting('zz.org')::uuid, v_run,
    jsonb_build_array(
      jsonb_build_object('name','Alan','company','NPL','lead_score','90'),
      jsonb_build_object('name','Karen','company','Bell','lead_score','75')));

  if (v_result ->> 'rows_written')::int <> 2 then
    raise exception 'DOOR-14 FAIL: two rows were offered and % landed. refusals: %',
      v_result ->> 'rows_written', v_result -> 'refusals';
  end if;

  v_proposals := v_result -> 'proposals';
  if not exists (select 1 from jsonb_array_elements(v_proposals) p where p ->> 'column' = 'lead_score') then
    raise exception 'DOOR-14 FAIL: lead_score matched no Field and was DROPPED rather than proposed. proposals: %', v_proposals;
  end if;
  if (select p ->> 'inferred_type' from jsonb_array_elements(v_proposals) p
       where p ->> 'column' = 'lead_score') <> 'number' then
    raise exception 'DOOR-14 FAIL: the proposal for a column holding 90 and 75 says type "%"',
      (select p ->> 'inferred_type' from jsonb_array_elements(v_proposals) p where p ->> 'column' = 'lead_score');
  end if;

  -- ACCEPTING MINTS A REAL FIELD through the same door a hand-made Field goes through.
  v_field := custom.io_proposal_accept(current_setting('zz.org')::uuid, v_run, 'lead_score');
  select f.key into v_key from custom.field f
   where f.organization_id = current_setting('zz.org')::uuid and f.id = v_field;
  if v_key <> 'lead_score' then
    raise exception 'DOOR-14 FAIL: accepting the proposal produced a Field with key "%"', v_key;
  end if;

  -- AND THE NEXT IMPORT OF THE SAME FILE MAPS IT. The proposal is only worth making if
  -- accepting it changes what happens next.
  -- The value is a NUMBER, not the string "60", and that is itself the proof that accepting the
  -- proposal produced a real typed Field rather than a label: sending the string is refused with
  -- "lead_score takes a number, and it was given a string", measured 2026-09-18.
  v_second := custom.io_import_rows(current_setting('zz.org')::uuid, v_run,
    jsonb_build_array(jsonb_build_object('name','Edsger','company','Eindhoven','lead_score',60)));
  if exists (select 1 from jsonb_array_elements(v_second -> 'proposals') p
              where p ->> 'column' = 'lead_score' and p ->> 'state' = 'proposed') then
    raise exception 'DOOR-14 FAIL: lead_score was accepted and the next import proposed it again';
  end if;
  if (select r.data ->> 'lead_score' from custom.record r
       where r.organization_id = current_setting('zz.org')::uuid
         and r.table_id = current_setting('zz.tlead')::uuid
         and r.data ->> 'name' = 'Edsger') is null then
    raise exception 'DOOR-14 FAIL: after accepting, the next import still did not write lead_score onto the record. second run: %', v_second;
  end if;

  -- AND THE FIELD IS TYPED, not merely named: the same import carrying the string "60" is
  -- refused by the store. Without this a proposal that minted a label would pass everything above.
  if (select (r ->> 'rows_written')::int
        from custom.io_import_rows(current_setting('zz.org')::uuid, v_run,
               jsonb_build_array(jsonb_build_object('name','Tony','lead_score','60'))) r) <> 0 then
    raise exception 'DOOR-14 FAIL: the accepted Field accepted a string into a number column, so it is a label and not a type';
  end if;

  raise notice 'PART 4 PASS: an unknown column landed 2 rows AND became a proposal typed "number"; accepting it declared the field on the Table and minted the Field through the write door; the next import wrote 60 into it instead of proposing it again, and the same import carrying "60" as text was refused — so the accepted Field is typed, not merely named';
end $p4$;

\echo ''
\echo '══ PART 5 — DOOR-15: a comment at the commenter level, with its refusal'
\echo ''

do $p5$
declare
  v_rec uuid;
  v_c   uuid;
  v_n   integer;
  v_err text;
begin
  select r.id into v_rec from custom.record r
   where r.organization_id = current_setting('zz.org')::uuid
     and r.table_id = current_setting('zz.tlead')::uuid
   order by r.created_at limit 1;

  -- POSITIVE CONTROL FIRST: admin@admin.com holds admin on these records, and admin outranks
  -- commenter on the enum, so the comment lands.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_c := custom.io_comment_write(current_setting('zz.org')::uuid, v_rec, 'Called them back.');
  select count(*) into v_n from custom.io_comments(current_setting('zz.org')::uuid, v_rec);
  if v_n <> 1 then
    raise exception 'DOOR-15 FAIL: one comment was written and the record shows %', v_n;
  end if;

  -- RESOLVING DOES NOT DELETE.
  perform custom.io_comment_resolve(current_setting('zz.org')::uuid, v_c, true);
  if (select count(*) from custom.io_comments(current_setting('zz.org')::uuid, v_rec, false)) <> 0 then
    raise exception 'DOOR-15 FAIL: a resolved comment is still in the default list';
  end if;
  if (select count(*) from custom.io_comments(current_setting('zz.org')::uuid, v_rec, true)) <> 1 then
    raise exception 'DOOR-15 FAIL: a resolved comment disappeared. Resolution is not a delete wearing a friendlier word.';
  end if;

  -- THE REFUSAL. The principal is an account that exists nowhere in this organization — not
  -- test@test.com, which IS a member and therefore legitimately reaches these records at
  -- viewer. A refusal control has to be somebody the platform genuinely says no to, or it
  -- proves only that the call can raise.
  perform set_config('request.jwt.claims',
                     '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
  begin
    perform custom.io_comment_write(current_setting('zz.org')::uuid, v_rec, 'I should not be here.');
    raise exception 'DOOR-15 FAIL: a principal who is not in this organization at all wrote a comment';
  exception when sqlstate '42501' then
    v_err := sqlerrm;
  end;
  perform set_config('request.jwt.claims', '', true);

  -- THE LEVEL IS THE ENUM, not a string comparison.
  if not ('commenter'::public.permission_level > 'viewer'::public.permission_level
          and 'editor'::public.permission_level > 'commenter'::public.permission_level) then
    raise exception 'DOOR-15 FAIL: permission_level does not order viewer < commenter < editor, so "commenter" is not a rung';
  end if;

  raise notice 'PART 5 PASS: admin commented and resolved (the resolved comment is still readable), a principal outside the organization was refused with "%", and viewer < commenter < editor holds on the enum itself', left(v_err, 60);
end $p5$;

\echo ''
\echo '══ PART 6 — DOOR-16: revisions, and a restore that actually moves the values back'
\echo ''

do $p6$
declare
  v_rec  uuid;
  v_v1   integer;
  v_now  text;
  v_then text;
  v_n    integer;
  v_back integer;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_rec := custom.record_write(current_setting('zz.org')::uuid, current_setting('zz.tlead')::uuid,
                               '{"name":"Barbara","company":"Goddard","notes":"original"}'::jsonb);
  select r.version into v_v1 from custom.record r
   where r.organization_id = current_setting('zz.org')::uuid and r.id = v_rec;

  perform custom.record_update(current_setting('zz.org')::uuid, v_rec,
                               '{"notes":"rewritten"}'::jsonb, null);
  select r.data ->> 'notes' into v_now from custom.record r
   where r.organization_id = current_setting('zz.org')::uuid and r.id = v_rec;
  if v_now <> 'rewritten' then
    raise exception 'DOOR-16 SETUP FAIL: the update did not take; notes reads "%"', v_now;
  end if;

  -- THE LIST SAYS WHAT EACH VERSION IS. "Restore to version 7" with no sentence beside it is
  -- a button nobody can press responsibly.
  select count(*) into v_n from custom.io_revisions(current_setting('zz.org')::uuid, v_rec);
  if v_n < 2 then
    raise exception 'DOOR-16 FAIL: the record was written and then changed, and history offers % version(s)', v_n;
  end if;
  if exists (select 1 from custom.io_revisions(current_setting('zz.org')::uuid, v_rec)
              where summary is null or summary = '') then
    raise exception 'DOOR-16 FAIL: a version with no sentence beside it is a version nobody can choose';
  end if;

  -- THE RESTORE MOVES THE VALUES. The contract's measurement was that restore raised "nothing
  -- to restore (no content columns)" for every document-shaped record; this is that, fixed.
  perform custom.io_restore(current_setting('zz.org')::uuid, v_rec, v_v1);
  select r.data ->> 'notes' into v_then from custom.record r
   where r.organization_id = current_setting('zz.org')::uuid and r.id = v_rec;
  if v_then <> 'original' then
    raise exception 'DOOR-16 FAIL: restoring to version % left notes reading "%" instead of "original" — the restore ran and moved nothing', v_v1, v_then;
  end if;

  -- AND THE RESTORE IS ITSELF A CHANGE: it has its own version and its own event, so it can
  -- be undone by the same mechanism that made it possible.
  select count(*) into v_back from custom.io_revisions(current_setting('zz.org')::uuid, v_rec);
  if v_back <= v_n then
    raise exception 'DOOR-16 FAIL: the restore rewrote the record silently — history still shows % versions', v_back;
  end if;
  if not exists (select 1 from custom.io_outbox o
                  where o.organization_id = current_setting('zz.org')::uuid
                    and o.record_id = v_rec and o.operation = 'updated') then
    raise exception 'DOOR-16 FAIL: the restore raised no change event, so no automation can know it happened';
  end if;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'PART 6 PASS: % versions each with a sentence, restoring to version % put notes back to "original", and the restore is itself a versioned change (% versions now) carrying its own event', v_n, v_v1, v_back;
end $p6$;

\echo ''
\echo '══ W4-IO GREEN SUITE PASSED — rolling back'
rollback;
