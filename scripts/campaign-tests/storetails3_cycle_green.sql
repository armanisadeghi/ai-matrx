-- LANE STORE-TAILS-3 — A WORKED-OUT COLUMN NEVER READS ITSELF.
--
-- THE USE CASE. The Birchwood owner rolls up each room's quotes (Quoted so far) and, on each
-- quote, looks up the name of the room it is for (Room (name)) so the quotes list reads
-- "Voltway Electric — Kitchen". The two tables point at each other; neither column reads the
-- other. Later she tries to show, on each quote, the room's running total — and then to make the
-- room's total add up THAT looked-up total, which would be a room adding up itself.
--
-- WHAT MAKES IT FAIL (RED on the bodies before storetails3_a_worked_out_column_never_reads_itself.sql):
-- reading Kitchen overflows the stack or times out instead of answering 17,350 (C1); a formula or
-- rollup that would read itself round a circle is SAVED (C2); a circle already stored recurses
-- instead of being refused with a sentence (C3).
--
-- SEAT: every door is called as `authenticated` with admin@admin.com's claims.

\set ON_ERROR_STOP on
\timing off
\set suite 'storetails3_cycle_green.sql'
\set requires 'function:custom.lookup_value|function:custom.rollup_value|function:custom.field_inputs_of'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

\i scripts/campaign-tests/_storetails3_fixture.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_quotes uuid; v_kitchen uuid; v_doc jsonb; v_docs jsonb; v_msg text; v_state text;
  v_a uuid; v_qt uuid; v_t0 timestamptz; v_ms numeric;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_quotes from st3 where k = 'quotes';
  select v into v_kitchen from st3 where k = 'Kitchen';
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  -- ══ C1. two tables that point at each other answer, in both directions ══
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'room_seen', 'label', 'Room (name)',
    'type', 'lookup', 'via', 'room', 'pick', 'room_name', 'sort', 40));
  v_t0 := clock_timestamp();
  select d.document into v_doc from custom.read_records(v_org, v_rooms, false, 50, 0) d where d.document ->> 'room_name' = 'Kitchen';
  select jsonb_agg(d.document ->> 'room_seen' order by d.document ->> 'contractor') into v_docs from custom.read_records(v_org, v_quotes, false, 50, 0) d;
  v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
  if (v_doc ->> 'quoted_total')::numeric is distinct from 17350 or (v_doc ->> 'budget_with_contingency')::numeric is distinct from 19800 then
    raise exception 'C1: with Quotes looking up its room, Kitchen reads quoted % / contingency % (want 17,350 / 19,800)',
      v_doc ->> 'quoted_total', v_doc ->> 'budget_with_contingency';
  end if;
  if v_docs is distinct from '["Kitchen", "Kitchen"]'::jsonb then
    raise exception 'C1: the quotes look up their room as % (want Kitchen, Kitchen)', v_docs;
  end if;
  raise notice 'C1 PASS — Rooms rolls up Quotes and Quotes looks up Rooms: Kitchen quoted 17,350, both quotes read "Kitchen" (% ms for both reads)', round(v_ms);

  -- ══ C2. a declaration that would close a circle is refused, by name ══
  -- (a) two formulas on one table
  v_a := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'allowance', 'label', 'Allowance',
    'type', 'formula', 'formula_text', '{Budget} * 0.05', 'sort', 80));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'allowance_plus', 'label', 'Allowance plus fees',
    'type', 'formula', 'formula_text', '{Allowance} + 250', 'sort', 81));
  begin
    perform custom.field_update(v_org, v_a, jsonb_build_object('formula_text', '{Allowance plus fees} * 0.05'));
    raise exception 'C2a: Allowance was saved reading Allowance plus fees, which reads Allowance';
  exception when sqlstate '42P17' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Allowance%' or v_msg not like '%Allowance plus fees%' or v_msg not like '%would be worked out from itself%' then
      raise exception 'C2a: refused without naming the circle: %', v_msg;
    end if;
  end;
  raise notice 'C2a PASS — refused: "%"', v_msg;

  -- (b) across tables: each quote shows its room's running total; the room then tries to add THAT up
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'room_total_seen', 'label', 'Room''s quoted total',
    'type', 'lookup', 'via', 'room', 'pick', 'quoted_total', 'sort', 50));
  perform set_config('role', 'postgres', true);
  select f.id into v_qt from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'quoted_total';
  perform set_config('role', 'authenticated', true);
  v_msg := null;
  begin
    perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'quoted_total_seen', 'label', 'Quoted total, as the quotes see it',
      'type', 'rollup', 'via', 'quotes_here', 'agg', 'sum', 'of', 'room_total_seen', 'sort', 71));
    -- That one reads Quotes › Room's quoted total › Rooms › Quoted so far › Quotes › Amount: no circle.
    perform custom.field_update(v_org, v_qt, jsonb_build_object('config', jsonb_build_object('via', 'quotes_here', 'agg', 'sum', 'of', 'room_total_seen')));
    raise exception 'C2b: Quoted so far was saved adding up Room''s quoted total, which looks up Quoted so far';
  exception when sqlstate '42P17' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Quoted so far%' or v_msg not like '%Room''s quoted total%' then
      raise exception 'C2b: refused without naming the circle across the two tables: %', v_msg;
    end if;
  end;
  raise notice 'C2b PASS — refused across tables: "%"', v_msg;
end
$t$;

-- ══ C3. a circle stored before the rule is refused on read with a sentence, never recursed ══
-- Written straight into the store with the triggers off, as a row written before this rule
-- existed would be; rolled back with everything else.
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_kitchen uuid; v_qt record; v_msg text; v_doc jsonb; v_t0 timestamptz;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_kitchen from st3 where k = 'Kitchen';
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'postgres', true);
  select f.* into v_qt from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'quoted_total';
  set local session_replication_role = replica;
  update custom.record f
     set data = jsonb_set(f.data, '{config,of}', '"room_total_seen"')
   where f.organization_id = v_org and f.id = v_qt.id;
  set local session_replication_role = origin;
  if custom.field_cycle(v_org, v_qt.id) is null then
    raise exception 'C3: the stored circle is not seen by custom.field_cycle';
  end if;
  perform platform.memo_clear();   -- the triggers that forget a changed Field were off for that write

  v_t0 := clock_timestamp();
  begin
    perform custom.rollup_value(v_org, v_kitchen, (select f.data from custom.record f where f.organization_id = v_org and f.id = v_qt.id));
    raise exception 'C3: working out the stored circle answered instead of refusing';
  exception when sqlstate '42P17' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%is worked out from itself round a circle%' then
      raise exception 'C3: the stored circle was refused without the sentence: %', v_msg;
    end if;
  end;
  perform set_config('role', 'authenticated', true);
  select d.document into v_doc from custom.read_records(v_org, v_rooms, false, 50, 0) d where d.document ->> 'room_name' = 'Kitchen';
  if v_doc ->> 'room_name' is distinct from 'Kitchen' or v_doc ? 'quoted_total' and v_doc ->> 'quoted_total' is not null then
    raise exception 'C3: the grid read of Kitchen did not come back whole with Quoted so far empty: %', v_doc;
  end if;
  raise notice 'C3 PASS — a stored circle is refused on read in % ms with "%"; the grid still reads Kitchen, Quoted so far empty',
    round(extract(epoch from clock_timestamp() - v_t0) * 1000), v_msg;
  raise notice 'storetails3_cycle_green.sql: ALL PASS (C1-C3)';
end
$t$;

rollback;
