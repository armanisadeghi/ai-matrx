-- WRITE-PERF-3 — IMPORT'S FIVE-THOUSAND-ROW PROOF, RUN TWICE IN ONE TRANSACTION.
--
-- Lane IMPORT measured 5,000 rows through `custom.io_import_rows` at 54.6 ms/row on 2026-09-20
-- 15:23Z, WRITE-PERF at 45.6 ms/row at 21:1xZ and WRITE-PERF-2 at 21.84 ms/row at 22:3xZ. Run
-- on its own, the same file measured 12.93 ms/row at 23:24Z and 18.59 ms/row at 23:36Z with
-- NOTHING CHANGED UNDERNEATH IT — this database is shared with eight other lanes landing
-- migrations, and a number from one run at one time is not evidence of anything.
--
-- So this file runs IMPORT's proof TWICE, minutes apart, in ONE transaction that rolls back:
-- once with this lane's bodies live, then — after the store has been put back inside the same
-- transaction, exactly as the block below describes — once with the bodies it had before
-- WRITE-PERF-3. Both halves see the same contention, the same caches and the same
-- connection. The difference between them is this lane and nothing else.
--
-- `custom.io_import_rows` still calls `custom.record_write` ONCE PER ROW — pointing it at
-- `custom.record_write_many` is lane IMPORT's object and remains undone — so what this measures
-- is the single-row door, which is what every bulk import in the platform uses today.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data). Five thousand rows of a REFRIGERATED
-- SHIPMENT MANIFEST imported from the dispatcher's CSV: a consignment reference, the declared
-- value of the load and the delivery window. A hundred of them are already in the system
-- because the file was uploaded twice; fifty carry a delivery window somebody typed as a
-- sentence instead of a date, which is the mistake that actually arrives in these files.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3_five_thousand.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10min';

create temp table wp3_5k (half text, what text, value text) on commit drop;
grant all on wp3_5k to authenticated;

create or replace function pg_temp.five_thousand(p_half text) returns void
language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_home uuid; v_tbl uuid; v_run uuid; v_rows jsonb; v_res jsonb;
  b int; i int; t0 timestamptz; t1 timestamptz;
  v_seen int := 0; v_landed int := 0; v_dupe int := 0; v_bad int := 0; n int;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Cascade Cold Chain — WRITE-PERF-3 import ' || p_half,
          'ccc-wp3-5k-' || lower(left(p_half, 1)) || '-' || substr(md5(random()::text),1,8), 'CCC', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf3_five_thousand', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: half % did not take the seat — current_user is %', p_half, current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Dispatch desk'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Shipment','slug','shipments_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Shipment','label_plural','Shipments','title_field','reference','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','reference')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Consignment reference','key','reference','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Declared value','key','declared_value','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Delivery window','key','delivery_window','type','datetime'));

  -- THE HUNDRED CONSIGNMENTS THAT ARE ALREADY HERE, because the file was uploaded twice.
  for i in 1..100 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object(
      'reference', 'CC-2026-' || lpad(i::text, 5, '0'), 'declared_value', 1250));
  end loop;

  v_run := (custom.io_import_begin(v_org, v_tbl,
             p_format => 'csv',
             p_source_name => 'manifest-2026-w03.csv',
             p_policy => jsonb_build_object('on_duplicate','skip'),
             p_dedupe_key => 'reference') ->> 'import_id')::uuid;

  t0 := clock_timestamp();
  for b in 0..9 loop
    -- FIFTY REFUSED IN ALL: every hundredth line has a delivery window typed as a sentence.
    select jsonb_agg(jsonb_build_object(
             'reference',       'CC-2026-' || lpad(g.i::text, 5, '0'),
             'declared_value',  round((1250 + (g.i * 137.55)::numeric % 48000)::numeric, 2)::text,
             'delivery_window', case when g.i % 100 = 0 then 'when the yard opens'
                                     else to_char(timestamp '2026-01-05 06:00' + ((g.i % 300) || ' days')::interval,
                                                  'YYYY-MM-DD"T"HH24:MI') end)
             order by g.i)
      into v_rows from generate_series(b * 500 + 1, b * 500 + 500) g(i);
    v_res := custom.io_import_rows(v_org, v_run, v_rows);
    v_seen   := v_seen   + (v_res ->> 'rows_seen')::int;
    v_landed := v_landed + (v_res ->> 'rows_written')::int;
    v_dupe   := v_dupe   + (v_res ->> 'rows_duplicate')::int;
    v_bad    := v_bad    + (v_res ->> 'rows_refused')::int;
  end loop;
  t1 := clock_timestamp();

  select count(*) into n from custom.read_records(v_org, v_tbl, true, 1000, 0);

  insert into wp3_5k values
    (p_half, 'total ms',  round(extract(epoch from (t1-t0))*1000)::text),
    (p_half, 'ms per row', round((extract(epoch from (t1-t0))*1000/5000)::numeric, 2)::text),
    (p_half, 'outcome',   v_seen || ' seen · ' || v_landed || ' landed · ' || v_dupe ||
                          ' already here · ' || v_bad || ' refused'),
    (p_half, 'read back, first page of the ceiling', n::text);
end;
$$;

select pg_temp.five_thousand('A — this lane''s bodies');

\echo ''
\echo '=== putting the store back the way it was, inside this transaction ==='
reset role;

-- THE REAL BYTES OF TWO OF THIS LANE'S INVERSES, then the third one's BODIES, then by hand the
-- four memo-clearing triggers this workload can actually fire.
--
-- WHY NOT ALL FOUR WHOLE FILES, WHICH IS WHAT writeperf3_parity.sql DOES. The full inverse of
-- writeperf3_the_write_path_asks_the_ladder_once.sql drops three triggers on each of fourteen
-- tables. Asked from a transaction that has already written five thousand records, that is a
-- lock upgrade to ACCESS EXCLUSIVE on fourteen tables, and against the other lanes landing
-- migrations on this database tonight it DEADLOCKED on four consecutive attempts — every time
-- with a peer holding `platform.entity_grants` or `platform.entity_relationships` and waiting
-- on `platform.associations`, which this harness already held.
--
-- So this file drops only what its own workload can fire: the three triggers on `custom.record`
-- and the one on `platform.associations`. The other twelve tables are not written by an import
-- of five thousand records, so their triggers never fire and leaving them changes no number
-- here. The inverse of writeperf3_an_edge_arriving_forgets_nothing.sql is skipped for the same
-- reason and with the same effect: its only live act is to put blunt triggers BACK on
-- `platform.associations`, and half B wants none there at all.
\i migrations/inverse/writeperf3_a_small_answer_is_not_read_out_of_a_big_blob_down.sql
\i migrations/inverse/writeperf3_the_table_is_read_once_per_statement_down.sql
drop trigger if exists zz_memo_clear_i on custom.record;
drop trigger if exists zz_memo_clear_u on custom.record;
drop trigger if exists zz_memo_clear_d on custom.record;
drop trigger if exists zz_memo_clear_i on platform.associations;
drop trigger if exists zz_memo_clear_u on platform.associations;
drop trigger if exists zz_memo_clear_d on platform.associations;
\i migrations/inverse/writeperf3_the_write_path_asks_the_ladder_once_bodies_down.sql

select pg_temp.five_thousand('B — the bodies before this lane');

\echo ''
do $t$
declare a text; b text; o_a text; o_b text;
begin
  select value into a from wp3_5k where what = 'ms per row' and half like 'A%';
  select value into b from wp3_5k where what = 'ms per row' and half like 'B%';
  select value into o_a from wp3_5k where what = 'outcome' and half like 'A%';
  select value into o_b from wp3_5k where what = 'outcome' and half like 'B%';
  if o_a is distinct from o_b then
    raise exception 'THE TWO HALVES DID NOT DO THE SAME WORK: A said "%", B said "%"', o_a, o_b;
  end if;
  raise notice 'FIVE THOUSAND ROWS through custom.io_import_rows, one custom.record_write per row:';
  raise notice '    with this lane   % ms/row', a;
  raise notice '    without it       % ms/row', b;
  raise notice '    both halves      %', o_a;
end;
$t$;

select half, what, value from wp3_5k order by what, half;
rollback;
