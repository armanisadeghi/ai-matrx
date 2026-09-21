-- W4-IO — THE GREEN SUITE. CUT-N-2 · DOOR-11 · DOOR-13 · DOOR-14 · DOOR-15 · DOOR-16.
--
-- RUN IT (against the MAIN database — owner ruling 2026-09-18, there is no production):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_io_green.sql
--
-- Not a migration. EVERYTHING ROLLS BACK: the last statement is `rollback`, so the disposable
-- organization it makes, its memberships, its knob override, its Table, its Fields and every
-- row written here disappear with it.
--
-- ITS RED TWIN is `scripts/campaign-tests/w4_io_red.sql`.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This suite used to run as the role that OWNS
-- `custom.record`, and in that seat it proved nothing about the product: the organization wall
-- returns on its first line, EXECUTE grants are free, SECURITY INVOKER and SECURITY DEFINER are
-- the same thing, and `custom.record`, `custom.field`, `custom.io_outbox`, `custom.io_comment`
-- and the `custom.record_outbox` view are all directly readable. It now builds its fixtures as
-- the connected role, takes the seat `authenticated` in PART 0 and PROVES it, and runs every
-- asserted clause below through the door a signed-in person reaches:
--   · the outbox is read through `custom.io_outbox_drain` — the ONLY client door over it;
--     the table and the view hold no client grant at all;
--   · the Table's columns come from `custom.applicable_fields`, never `custom.field`;
--   · a record's values come from `custom.read_record` / `custom.read_records`, never
--     `custom.record.data`;
--   · PART 5 asks the comment door as `test@test.com`, a member who was shared nothing, and
--     pairs her two refusals with one thing she CAN do.
-- Three steps genuinely have NO client door and say so where they step out, asserting nothing
-- while out: the metadata touch in PART 1 (no door writes `metadata`), `custom.io_outbox_release`
-- (declared server_only: a client has no consumer name and no way to know one died),
-- `custom.record_outbox` (the view the server's workflow node selects), and
-- `custom.io_csv_parse` (the importer's own parser, used here as a measuring instrument).
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
-- THE ROUND TRIP IS A VALUE COMPARISON, NOT A COUNT. Part 3 parses the bytes the export door
-- produced and compares every cell to the source document. An import/export pair that agrees
-- only on row count passes while silently dropping a whole column.

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

-- The two guards this lane's doors read. A global knob table is an operator surface: no person
-- flips it, and nothing below is asserted while it is being set.
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_ghost_j constant text := '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}';
  v_boss    text := current_user;    -- the connected role, for the steps no client door covers
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tlead   uuid;
  v_rec     uuid;
  v_company uuid;
  v_notes   uuid;
  v_changed jsonb;
  v_created integer;
  v_updated integer;
  v_total   integer;
  v_back    integer;
  v_first   integer;
  v_second  integer;
  v_third   integer;
  v_view    integer;
  v_csv     text;
  v_rows    integer;
  v_header  text[];
  v_cells   jsonb := '[]'::jsonb;
  v_cell    jsonb;
  v_doc     jsonb;
  v_r       record;
  v_i       integer;
  v_run     uuid;
  v_result  jsonb;
  v_second_run jsonb;
  v_proposals  jsonb;
  v_field   uuid;
  v_key     text;
  v_c       uuid;
  v_n       integer;
  v_err     text;
  v_v1      integer;
  v_now     text;
  v_then    text;
  v_revs    integer;
  v_after   integer;
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- FIXTURES, as the connected role. A seat is a PERSON: an organization, a membership for
  -- each of the two test accounts, the switch this organization's store answers on, and a Home
  -- for the Table to hang under. None of this is a product claim and none of it is asserted.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign.w4_io.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Blue Ridge Recycling', 'blue-ridge-recycling-' || substr(v_org::text, 1, 8), 'BRR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- Without this the store is switched off globally and every door refuses a person. The role
  -- that owns custom.record never noticed the switch; `authenticated` does.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_io_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- THE TABLE AND ITS FIELDS, THROUGH THE DOORS. The old suite INSERTed Field rows straight
  -- into custom.record with `data_class = 'field'`, which needs a table privilege no signed-in
  -- person holds — so it could mint a Field the door itself would never have produced.
  v_tlead := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Leads', 'slug', 'leads', 'type', 'entity', 'display', 'list',
    'label_singular', 'Lead', 'label_plural', 'Leads', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','company'),
                                jsonb_build_object('name','notes'))));
  perform custom.field_declare(v_org, v_tlead, jsonb_build_object(
    'key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tlead, jsonb_build_object(
    'key','company','label','Company','plain','text','sort',20));
  perform custom.field_declare(v_org, v_tlead, jsonb_build_object(
    'key','notes','label','Notes','plain','text','sort',30));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — CUT-N-2 / DOOR-13: the outbox, in the same transaction, from ONE publisher
  -- ════════════════════════════════════════════════════════════════════════════

  -- (a) A WRITE, (b) AN UPDATE OF ONE VALUE, (c) A TOUCH THAT MOVES NO FIELD — and then the
  -- outbox is read ONCE, through the only door a person has over it. `custom.io_outbox` and the
  -- `custom.record_outbox` view hold no client grant; `custom.io_outbox_drain` is the door.
  -- Reading it inside this transaction is the whole of "transactional outbox" as an assertion:
  -- an event published outside the transaction would not be there to drain.
  v_rec := custom.record_write(v_org, v_tlead,
                               '{"name":"Ada","company":"Analytical","notes":"first"}'::jsonb);

  -- THE TABLE'S OWN Fields, through the platform's one answer to "which Fields does this Table
  -- have". Reading them by key alone across the organization is the defect file 5 closed.
  select f.id into v_company from custom.applicable_fields(v_org, v_tlead, null) f
   where f.data ->> 'key' = 'company' limit 1;
  select f.id into v_notes from custom.applicable_fields(v_org, v_tlead, null) f
   where f.data ->> 'key' = 'notes' limit 1;
  if v_company is null or v_notes is null then
    raise exception 'SETUP FAIL: the fixture''s Field records are not applicable to this Table';
  end if;

  perform custom.record_update(v_org, v_rec, '{"company":"Analytical Engines"}'::jsonb, null);

  -- THE TOUCH THAT MOVES NO FIELD, and it is a PERSON'S touch: the same value written again
  -- through the same door — somebody opening the record, typing nothing and pressing save. The
  -- old suite reached past the doors and stamped `metadata` directly, which no client door does
  -- and which the platform's own metadata guard now refuses outright. This is the discriminating
  -- case either way: an outbox that fired per UPDATE rather than per CHANGE leaves a third row.
  perform custom.record_update(v_org, v_rec, '{"company":"Analytical Engines"}'::jsonb, null);

  select count(*) filter (where d.operation = 'created'),
         count(*) filter (where d.operation = 'updated'),
         count(*),
         (array_agg(d.changed_field_ids) filter (where d.operation = 'updated'))[1]
    into v_created, v_updated, v_total, v_changed
    from custom.io_outbox_drain(v_org, 'route-planner', 1000) d
   where d.record_id = v_rec;

  -- Put the queue back exactly as it was, so PART 2 asks the drain its own question rather than
  -- inheriting an empty queue. Releasing a consumer's claims is declared server_only: a client
  -- has no consumer name and no way to know one died. It asserts nothing.
  perform set_config('role', v_boss, true);
  perform custom.io_outbox_release(v_org, 'route-planner', interval '-1 second');
  perform set_config('role', 'authenticated', true);

  if v_created <> 1 then
    raise exception 'CUT-N-2 FAIL: one record write left % "created" event(s) in the same transaction, expected exactly 1', v_created;
  end if;
  if v_updated <> 1 then
    raise exception 'DOOR-13 FAIL: one value changed and the outbox holds % "updated" event(s)', v_updated;
  end if;
  if v_total <> 2 then
    raise exception 'DOOR-13 FAIL: a create, a value change and a touch that moved no Field left % events, and the answer is 2 — the touch raised one', v_total;
  end if;
  if v_changed is null then
    raise exception 'DOOR-13 FAIL: changing a value raised an event that names no Field at all';
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

  -- (d) THE ONE PUBLISHER. Nothing on custom.record calls pg_notify; the outbox's own trigger
  -- does. Asked of the catalogue — which every role may read — rather than of the author's memory.
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
  -- 🚨 RED-SUITES 2026-09-21 — A DOOR IS SOMETHING A CALLER CALLS, AND A TRIGGER FUNCTION IS
  -- NOT ONE. This census named `custom.io_outbox_broadcast_stmt` on main. That function
  -- RETURNS `trigger`: it is reached by the `custom.io_outbox` trigger's OID at fire time and
  -- by nothing else — Postgres refuses a direct call outright ("trigger functions can only be
  -- called as triggers") — and the outbox row it reacts to was already written by a door that
  -- read `custom.assert_store_door`. Asking it to read the store door again is asking the
  -- wrong question about the right rule.
  --
  -- AND THE EXCLUSION IS NOT A HOLE, BECAUSE THE SECOND CLAUSE BELOW CLOSES IT: a
  -- trigger-returning io_* function must still name a switch of its own. `io_outbox_broadcast_stmt`
  -- reads `platform/realtime_broadcast_enabled` — the same expression its RLS policy uses, so
  -- the two cannot drift — and a future one that reads nothing at all fails here by name.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname like 'io\_%'
                and p.prosecdef
                and pg_get_function_result(p.oid) <> 'trigger'
                and p.prosrc !~ 'assert_store_door'
                and p.prosrc !~ 'custom\.io_') then
    raise exception 'DOOR FAIL: these io_* doors reach custom.assert_store_door neither directly nor through another io_ door: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'custom' and p.proname like 'io\_%' and p.prosecdef
          and pg_get_function_result(p.oid) <> 'trigger'
          and p.prosrc !~ 'assert_store_door' and p.prosrc !~ 'custom\.io_');
  end if;
  -- THE OTHER HALF: every trigger-returning io_* body names a switch — the store door, another
  -- io_ door, or a knob read of its own. A trigger bound to a live table that reads no switch
  -- at all is the class `guardUnreadBy` exists for, and this is that check for this lane.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname like 'io\_%'
                and pg_get_function_result(p.oid) = 'trigger'
                and p.prosrc !~ 'assert_store_door'
                and p.prosrc !~ 'custom\.io_'
                and p.prosrc !~ 'knob_resolve|store_is_open') then
    raise exception 'DOOR FAIL: these io_* TRIGGER functions read no switch at all: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'custom' and p.proname like 'io\_%'
          and pg_get_function_result(p.oid) = 'trigger'
          and p.prosrc !~ 'assert_store_door' and p.prosrc !~ 'custom\.io_'
          and p.prosrc !~ 'knob_resolve|store_is_open');
  end if;
  -- 🚨 RED-SUITES 2026-09-21 — THE RULE IS "REACHES ITS OWN GUARD", NOT "ONLY ONE MAY
  -- DELEGATE". This clause used to allow exactly ONE io_ door to reach the predicate through
  -- another, because when it was written exactly one did (`custom.io_export_csv` → `io_export`).
  -- LIMITS-FIX then shipped the CSV import surface and four more arrived —
  -- `io_import_plan`, `io_import_report`, `io_imports`, `io_infer_column` — and the count fired
  -- although every one of them is guarded. A COUNT was never the rule; it was a snapshot of the
  -- day the rule was written, and a snapshot fails on the day somebody builds something.
  --
  -- SO IT ASKS THE REAL QUESTION, SPLIT THE WAY THE DOORS ACTUALLY SPLIT, and it is STRICTER
  -- than the count was — the count would have passed a fifth door that read nothing at all:
  --   · a door that CHANGES things (VOLATILE) reads `custom.assert_store_door`, itself or
  --     through a named io_ door whose own body reads it. That is the write predicate and
  --     there is no other way to reach it.
  --   · a door that only READS (STABLE) reads the client ladder — `assert_client_may_reach`,
  --     plus `assert_may_know_table` wherever it takes a table. `assert_store_door` is the
  --     sentence "this organization is not taking writes", and a read door has no business
  --     saying it.
  declare
    v_unguarded text;
  begin
    select string_agg(p.proname, ', ' order by p.proname) into v_unguarded
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'custom' and p.proname like 'io\_%' and p.prosecdef
       and pg_get_function_result(p.oid) <> 'trigger'
       and p.provolatile <> 's'
       and p.prosrc !~ 'assert_store_door'
       and not exists (select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
                        where m.nspname = 'custom' and q.proname like 'io\_%'
                          and q.prosrc ~ 'assert_store_door'
                          and p.prosrc ~ ('custom\.' || q.proname || '\s*\('));
    if v_unguarded is not null then
      raise exception 'DOOR FAIL: these io_* doors CHANGE things and reach custom.assert_store_door neither directly nor through a named io_ door that does: %', v_unguarded;
    end if;
    select string_agg(p.proname, ', ' order by p.proname) into v_unguarded
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'custom' and p.proname like 'io\_%' and p.prosecdef
       and pg_get_function_result(p.oid) <> 'trigger'
       and p.provolatile = 's'
       and p.prosrc !~ 'assert_client_may_reach';
    if v_unguarded is not null then
      raise exception 'DOOR FAIL: these io_* READ doors never ask the client ladder: %', v_unguarded;
    end if;
  end;

  raise notice 'PART 1 PASS: one event per change inside the same transaction, read through the drain door; the Fields that moved are named and the ones that did not are not; a no-op touch raises nothing; and the ONLY publisher is the outbox';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — CUT-N-2: the consumer is idempotent, and the platform's node shape exists
  -- ════════════════════════════════════════════════════════════════════════════

  select count(*) into v_first
    from custom.io_outbox_drain(v_org, 'billing-sync', 100);
  if v_first < 2 then
    raise exception 'CUT-N-2 FAIL: PART 1 left at least two events and the first drain took %', v_first;
  end if;
  -- THE SECOND DRAIN TAKES NOTHING. A consumer that handed a claimed row out twice would
  -- process every event twice, which is the failure the whole pattern exists to prevent.
  select count(*) into v_second
    from custom.io_outbox_drain(v_org, 'customer-portal-sync', 100);
  if v_second <> 0 then
    raise exception 'CUT-N-2 FAIL: a second consumer drained % already-claimed row(s)', v_second;
  end if;

  -- AND THE POSITIVE CONTROL, so the zero above is a claim and not an empty queue: releasing a
  -- dead consumer's claims puts them back. The age is negative because the claim was made in
  -- THIS transaction and now() does not advance inside one, so "older than zero seconds" is
  -- false for a row claimed a line ago. Releasing is declared server_only — a client has no
  -- consumer name to release and no way to know one died — so it steps out, and the clause it
  -- serves is asserted back in the seat.
  perform set_config('role', v_boss, true);
  select custom.io_outbox_release(v_org, 'billing-sync', interval '-1 second') into v_back;
  perform set_config('role', 'authenticated', true);
  if v_back <> v_first then
    raise exception 'CUT-N-2 FAIL: % rows were claimed and releasing returned %', v_first, v_back;
  end if;
  select count(*) into v_third
    from custom.io_outbox_drain(v_org, 'customer-portal-sync', 100);
  if v_third <> v_first then
    raise exception 'CUT-N-2 FAIL: after the release the queue should hold the same % rows, and the drain took %', v_first, v_third;
  end if;

  -- THE VIEW THE PLATFORM'S records.changed NODE READS, in the spelling it reads. This is the
  -- SERVER's lane and says so: the node runs as the service role and the view carries no client
  -- grant, so the read steps out. No product clause is asserted while it is out — the two
  -- checks below are made back in the seat, against numbers taken here.
  perform set_config('role', v_boss, true);
  select count(*) into v_view from custom.record_outbox where organization_id = v_org;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'custom' and table_name = 'record_outbox'
     and column_name in ('changed_fields', 'occurred_at');
  perform set_config('role', 'authenticated', true);
  if v_view < v_first then
    raise exception 'DOOR-13 FAIL: custom.record_outbox shows % of the %+ events', v_view, v_first;
  end if;
  if v_n <> 2 then
    raise exception 'DOOR-13 FAIL: custom.record_outbox does not carry changed_fields and occurred_at, which is the shape the workflow node selects';
  end if;

  raise notice 'PART 2 PASS: % events claimed once, a second consumer got 0, releasing returned exactly % and the re-drain took them — and custom.record_outbox answers in the node''s own column names', v_first, v_back;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — DOOR-11: the CSV round trip, compared CELL BY CELL
  -- ════════════════════════════════════════════════════════════════════════════

  -- The source, written through the write door so the comparison below is against KNOWN values
  -- and not against another query's answer. The comma and the quote are deliberate: they are
  -- what a naive "split on comma" and a naive "wrap in quotes" each get wrong.
  perform custom.record_write(v_org, v_tlead,
    '{"name":"Grace, H","company":"Navy","notes":"said \"hello\""}'::jsonb);

  -- THE EXPORT DOOR, from the seat. Which rows an export returns is the read door's question
  -- and it is answered here by the same ladder every other read uses; what this part is about
  -- is the BYTES — whether a value holding the delimiter and a value holding quotes survive
  -- export and parse unchanged.
  v_csv := custom.io_export_csv(v_org, v_tlead, array['name','company','notes'], 1000, ',', 'viewer');
  if v_csv is null or v_csv = '' then
    raise exception 'DOOR-11 FAIL: export produced no bytes at all';
  end if;

  -- The PARSE is the measuring instrument, not a door: `custom.io_csv_parse` is the importer's
  -- own reader and holds no client grant. It steps out for exactly the parse, collects the
  -- cells, and every comparison below is made back in the seat.
  perform set_config('role', v_boss, true);
  select count(*) into v_rows from custom.io_csv_parse(v_csv);
  for v_r in select row_number, cells from custom.io_csv_parse(v_csv) order by row_number loop
    if v_r.row_number = 1 then
      v_header := v_r.cells;
    else
      v_doc := '{}'::jsonb;
      for v_i in 1 .. array_length(v_header, 1) loop
        v_doc := v_doc || jsonb_build_object(v_header[v_i], v_r.cells[v_i]);
      end loop;
      v_cells := v_cells || jsonb_build_array(v_doc);
    end if;
  end loop;
  perform set_config('role', 'authenticated', true);

  if v_rows < 2 then
    raise exception 'DOOR-11 FAIL: the export parses back to % line(s) — a header and at least one row were written', v_rows;
  end if;
  if v_header <> array['name','company','notes'] then
    raise exception 'DOOR-11 FAIL: the header parses back as % and the columns asked for were name, company, notes', v_header;
  end if;
  v_doc := null;
  for v_cell in select value from jsonb_array_elements(v_cells) loop
    if v_cell ->> 'name' = 'Grace, H' then v_doc := v_cell; end if;
  end loop;
  if v_doc is null then
    raise exception 'DOOR-11 FAIL: the row written for the round trip is not in the export at all';
  end if;
  -- THE DISCRIMINATING ROW. Its name holds the delimiter and its notes hold a quote, so a
  -- broken escape or a broken parse changes these two cells and nothing else.
  if v_doc ->> 'company' <> 'Navy' then
    raise exception 'DOOR-11 FAIL: the value after an embedded comma came back as "%" instead of "Navy" — the delimiter inside a quoted field was not honoured', v_doc ->> 'company';
  end if;
  if v_doc ->> 'notes' <> 'said "hello"' then
    raise exception 'DOOR-11 FAIL: an embedded quote round-tripped as "%" instead of said "hello"', v_doc ->> 'notes';
  end if;

  raise notice 'PART 3 PASS: a value containing the delimiter and a value containing quotes both came back byte-identical through the export door -> parse; every cell of the row was compared, not the row count';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — DOOR-14: an unmapped column becomes a proposal a person accepts
  -- ════════════════════════════════════════════════════════════════════════════

  v_run := custom.io_import_open(v_org, v_tlead, 'csv', 'leads.csv',
                                 '["name","company","lead_score"]'::jsonb);

  -- `lead_score` matches NO Field on this Table. It must come back as an OFFER, and the rows
  -- must still land — an import that refuses the whole file over one unknown column is the
  -- behaviour everybody works around by editing the spreadsheet.
  v_result := custom.io_import_rows(v_org, v_run,
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

  -- ACCEPTING MINTS A REAL FIELD through the same door a hand-made Field goes through, and the
  -- Field is read back the ONE way a person can read a Table's columns.
  v_field := custom.io_proposal_accept(v_org, v_run, 'lead_score');
  select f.data ->> 'key' into v_key from custom.applicable_fields(v_org, v_tlead, null) f
   where f.id = v_field;
  if v_key <> 'lead_score' then
    raise exception 'DOOR-14 FAIL: accepting the proposal produced a Field the Table''s own column list calls "%"', v_key;
  end if;

  -- AND THE NEXT IMPORT OF THE SAME FILE MAPS IT. The proposal is only worth making if
  -- accepting it changes what happens next. The value is a NUMBER, not the string "60", and
  -- that is itself the proof that accepting produced a real typed Field rather than a label.
  v_second_run := custom.io_import_rows(v_org, v_run,
    jsonb_build_array(jsonb_build_object('name','Edsger','company','Eindhoven','lead_score',60)));
  if exists (select 1 from jsonb_array_elements(v_second_run -> 'proposals') p
              where p ->> 'column' = 'lead_score' and p ->> 'state' = 'proposed') then
    raise exception 'DOOR-14 FAIL: lead_score was accepted and the next import proposed it again';
  end if;
  -- READ BACK THROUGH THE READ DOOR. `custom.record` is not readable from this seat at all, and
  -- the door's rendering is the product truth about what a person would see. `p_by_id => false`
  -- is the human spelling: with it true the door keys every value by its Field id.
  if (select rr.document ->> 'lead_score' from custom.read_records(v_org, v_tlead, false, 500, 0) rr
       where rr.document ->> 'name' = 'Edsger') is null then
    raise exception 'DOOR-14 FAIL: after accepting, the next import still did not write lead_score onto the record. second run: %', v_second_run;
  end if;

  -- AND THE FIELD IS TYPED, NOT MERELY NAMED. Without this clause a proposal that minted a
  -- label would pass everything above.
  --
  -- 🚨 RED-SUITES 2026-09-21 — THE PROOF IS WHAT LANDS, NOT A REFUSAL, and the old wording had
  -- the product backwards. This clause used to demand that an import carrying the string "60"
  -- be REFUSED. But EVERY value in a spreadsheet is a string — that is what a CSV is — so a
  -- number column that refuses "60" is a number column nobody can ever import into, and the
  -- import door is right to convert it. Demanding the refusal would have made the typed
  -- column useless the moment somebody used it for its purpose.
  -- So the clause asks the question the refusal was standing in for: does the stored value
  -- come back as a NUMBER? A label would keep the text it was handed; a typed Field converts
  -- it, and `jsonb_typeof` is what tells the two apart. It is still a clause that can fail —
  -- take the type out of the accepted Field and the value comes back as a string.
  if (select (r ->> 'rows_written')::int
        from custom.io_import_rows(v_org, v_run,
               jsonb_build_array(jsonb_build_object('name','Tony','lead_score','60'))) r) <> 1 then
    raise exception 'DOOR-14 FAIL: an import carrying lead_score as the text "60" wrote no row — a number column that refuses a spreadsheet''s own spelling of a number can never be imported into';
  end if;
  if (select jsonb_typeof(rr.document -> 'lead_score') from custom.read_records(v_org, v_tlead, false, 500, 0) rr
       where rr.document ->> 'name' = 'Tony') is distinct from 'number' then
    raise exception 'DOOR-14 FAIL: the text "60" was stored as %, so the accepted Field is a label and not a type',
      coalesce((select jsonb_typeof(rr.document -> 'lead_score') from custom.read_records(v_org, v_tlead, false, 500, 0) rr
                 where rr.document ->> 'name' = 'Tony'), 'nothing at all');
  end if;

  raise notice 'PART 4 PASS: an unknown column landed 2 rows AND became a proposal typed "number"; accepting it minted a Field the Table''s own column list names; the next import wrote 60 into it instead of proposing it again, and a spreadsheet''s text "60" came back out of the store as a NUMBER — so the accepted Field is typed, not merely named';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — DOOR-15: a comment at the commenter level, with its refusals
  -- ════════════════════════════════════════════════════════════════════════════

  -- The record is chosen through the read door, by the value a person sees.
  select rr.id into v_rec from custom.read_records(v_org, v_tlead, false, 500, 0) rr
   where rr.document ->> 'name' = 'Ada' limit 1;
  if v_rec is null then
    raise exception 'DOOR-15 SETUP FAIL: the read door does not show admin@admin.com the record she wrote';
  end if;

  -- POSITIVE CONTROL FIRST: admin@admin.com holds admin on these records, and admin outranks
  -- commenter on the enum, so the comment lands.
  v_c := custom.io_comment_write(v_org, v_rec, 'Called them back.');
  select count(*) into v_n from custom.io_comments(v_org, v_rec);
  if v_n <> 1 then
    raise exception 'DOOR-15 FAIL: one comment was written and the record shows %', v_n;
  end if;

  -- RESOLVING DOES NOT DELETE.
  perform custom.io_comment_resolve(v_org, v_c, true);
  if (select count(*) from custom.io_comments(v_org, v_rec, false)) <> 0 then
    raise exception 'DOOR-15 FAIL: a resolved comment is still in the default list';
  end if;
  if (select count(*) from custom.io_comments(v_org, v_rec, true)) <> 1 then
    raise exception 'DOOR-15 FAIL: a resolved comment disappeared. Resolution is not a delete wearing a friendlier word.';
  end if;

  -- REFUSAL ONE: a principal who is in no organization at all.
  perform set_config('request.jwt.claims', c_ghost_j, true);
  v_err := null;
  begin
    perform custom.io_comment_write(v_org, v_rec, 'I should not be here.');
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'DOOR-15 FAIL: a principal who is not in this organization at all wrote a comment';
  end if;

  -- REFUSAL TWO, AND THE ONE THAT ONLY THE SEAT CAN ASK: `test@test.com` is a real member of
  -- this organization who was shared NOTHING. As the role owning custom.record this question
  -- could not be asked at all — custom.assert_client_may_reach returned true on its first line
  -- for every organization on the database.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_err := null;
  begin
    perform custom.io_comment_write(v_org, v_rec, 'Dana was never given this record.');
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'DOOR-15 FAIL: test@test.com commented on a record nobody shared with her';
  end if;
  -- …and she cannot change the shape of a Table she is not an admin of either.
  v_err := null;
  begin
    perform custom.field_declare(v_org, v_tlead, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'DOOR-15 FAIL: test@test.com added a column to a Table she is not an admin of';
  end if;

  -- THE CONTROL, so the two refusals are not a door that says no to her about everything: the
  -- record she IS given, she reads, and she reads the conversation on it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_rec, true) ->> 'name') <> 'Ada' then
    raise exception 'DOOR-15 FAIL: the record shared with test@test.com at viewer does not read back for her';
  end if;
  if (select count(*) from custom.io_comments(v_org, v_rec, true)) <> 1 then
    raise exception 'DOOR-15 FAIL: a viewer sees the record and not the conversation on it — a viewer reads the comments and cannot join them';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- THE LEVEL IS THE ENUM, not a string comparison.
  if not ('commenter'::public.permission_level > 'viewer'::public.permission_level
          and 'editor'::public.permission_level > 'commenter'::public.permission_level) then
    raise exception 'DOOR-15 FAIL: permission_level does not order viewer < commenter < editor, so "commenter" is not a rung';
  end if;

  raise notice 'PART 5 PASS: admin commented and resolved (the resolved comment is still readable); a principal outside the organization and test@test.com — a member shared nothing — were both refused; the record shared with her at viewer reads back and its conversation with it; and viewer < commenter < editor holds on the enum itself';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — DOOR-16: revisions, and a restore that actually moves the values back
  -- ════════════════════════════════════════════════════════════════════════════

  v_rec := custom.record_write(v_org, v_tlead,
                               '{"name":"Barbara","company":"Goddard","notes":"original"}'::jsonb);
  -- The version a person can name is the one HISTORY offers them, not a column on a table they
  -- cannot read.
  select min(rv.version) into v_v1 from custom.io_revisions(v_org, v_rec) rv;

  perform custom.record_update(v_org, v_rec, '{"notes":"rewritten"}'::jsonb, null);
  v_now := custom.read_record(v_org, v_rec, true) ->> 'notes';
  if v_now <> 'rewritten' then
    raise exception 'DOOR-16 SETUP FAIL: the update did not take; notes reads "%"', v_now;
  end if;

  -- THE LIST SAYS WHAT EACH VERSION IS. "Restore to version 7" with no sentence beside it is
  -- a button nobody can press responsibly.
  select count(*) into v_revs from custom.io_revisions(v_org, v_rec);
  if v_revs < 2 then
    raise exception 'DOOR-16 FAIL: the record was written and then changed, and history offers % version(s)', v_revs;
  end if;
  if exists (select 1 from custom.io_revisions(v_org, v_rec)
              where summary is null or summary = '') then
    raise exception 'DOOR-16 FAIL: a version with no sentence beside it is a version nobody can choose';
  end if;

  -- THE RESTORE MOVES THE VALUES. The contract's measurement was that restore raised "nothing
  -- to restore (no content columns)" for every document-shaped record; this is that, fixed.
  perform custom.io_restore(v_org, v_rec, v_v1);
  v_then := custom.read_record(v_org, v_rec, true) ->> 'notes';
  if v_then <> 'original' then
    raise exception 'DOOR-16 FAIL: restoring to version % left notes reading "%" instead of "original" — the restore ran and moved nothing', v_v1, v_then;
  end if;

  -- AND THE RESTORE IS ITSELF A CHANGE: it has its own version and its own event, so it can
  -- be undone by the same mechanism that made it possible. The event is read through the drain
  -- door, the only client door over the outbox.
  select count(*) into v_after from custom.io_revisions(v_org, v_rec);
  if v_after <= v_revs then
    raise exception 'DOOR-16 FAIL: the restore rewrote the record silently — history still shows % versions', v_after;
  end if;
  if not exists (select 1 from custom.io_outbox_drain(v_org, 'landfill-weight-ticket-sync', 1000) d
                  where d.record_id = v_rec and d.operation = 'updated') then
    raise exception 'DOOR-16 FAIL: the restore raised no change event, so no automation can know it happened';
  end if;

  raise notice 'PART 6 PASS: % versions each with a sentence, restoring to version % put notes back to "original", and the restore is itself a versioned change (% versions now) carrying its own event on the drain', v_revs, v_v1, v_after;

  raise notice 'W4-IO GREEN: ALL PARTS PASSED (CUT-N-2, DOOR-11, DOOR-13, DOOR-14, DOOR-15, DOOR-16) — every clause from the seat `authenticated`, through the doors a signed-in person reaches.';
end $suite$;

\echo ''
\echo '══ W4-IO GREEN SUITE PASSED — rolling back'
rollback;
