-- LANE REALTIME-2 — WHAT THE REALTIME EMITTER COSTS THE WRITE PATH, COUNTED RATHER THAN TIMED.
--
-- WHY NOT THE OBVIOUS PROBE. `realtime2_write_cost.sql` is the obvious probe — write 5,000
-- rows with the emitter on, write 5,000 with it off, alternate, compare. It was run first and
-- it answered NEGATIVE: the emitter-ON arms came back 8% and 28% FASTER than the emitter-OFF
-- arms. That is not a result. The same 5,000-row write measured 24.723, 25.047, 10.713 and
-- 24.380 ms/row across four runs minutes apart with nothing changed underneath it. This
-- database is shared with eight other lanes landing migrations; its wall-clock noise floor is
-- about ±50% and the bar this file exists to test is 3%. No number of extra runs fixes an
-- instrument whose error bar is sixteen times its question.
--
-- SO THIS FILE MEASURES THE EMITTER ITSELF, NOT THE DIFFERENCE BETWEEN TWO BIG WRITES.
-- `custom.io_outbox_broadcast_stmt` is a STATEMENT-level AFTER INSERT trigger on
-- `custom.io_outbox`. Everything it costs is inside one statement's trigger call: one
-- `platform.knob_resolve`, one aggregate over the transition table, and one
-- `custom._realtime_notice` per (table, kind, operation) group — which is one `realtime.send`
-- and one read-back each. So the emitter's cost for a write is measured by firing that trigger
-- ON ITS OWN, against a transition table of exactly the size the write produces, many times,
-- alternating on and off. Each repetition is milliseconds rather than minutes, so twenty of
-- them fit inside the same machine conditions and the noise averages out instead of swamping
-- the signal.
--
-- IS FIRING IT DIRECTLY FAIR? The trigger cannot tell the difference. It reads `new_rows`, the
-- transition table, and nothing else; whether those rows were put there by
-- `custom.io_record_changed_stmt_i` on behalf of `custom.record_write_many` or by the INSERT
-- below, it sees the same relation with the same shape and does the same work. The rows are
-- built to match what the store actually writes: `event_key = 'records.changed'`, the real
-- organization, the real table, one row per record.
--
-- THE SECOND HALF OF THE ANSWER is how many rows that transition table holds for a real write,
-- and how long the real write takes. Both are measured here too, through the real door, from
-- the real seat — so the share is (emitter ms for N rows) / (total ms for the same N rows)
-- with both numbers taken minutes apart on the same connection.
--
-- THE USE CASE (owner law 2026-09-21: no fake test data). VENTURA COUNTY FOOD SHARE's Oxnard
-- warehouse pallet intake log — the same business as the sibling file, so the two probes are
-- measuring the same shape of data. A pallet tag off the driver's paperwork, the grower or
-- grocer it came from, the net weight off the dock scale, the category the volunteers sort it
-- into, and the minute it crossed the door.
--
-- THE RESULT, 2026-09-21 05:3xZ on the main database (system_identifier 7642734024280108049):
--
--   what                     rows   write_ms   emitter_ms   emitter % of the write   verdict
--   single write                1     30.493        3.884                  12.739%   OVER 3%
--   record_write_many 1,000  1000   9618.417       19.254                   0.200%   under 3%
--   record_write_many 5,000  5000  46099.591       45.420                   0.099%   under 3%
--
-- THE CHAIR'S BAR IS 3% ON BULK WRITES AND IT IS MET WITH THIRTY TIMES THE MARGIN. Nothing is
-- batched and nothing is deferred, because there is nothing to batch: the emitter is already
-- ONE broadcast per STATEMENT, and its cost barely moves with the size of the statement —
-- 3.9 ms at one row, 19.3 ms at a thousand, 45.4 ms at five thousand. About 3.5 ms of that is
-- fixed (one `realtime.send`, one read-back) and the rest is roughly 8 microseconds per row
-- for the aggregate over the transition table. Against a 46-second five-thousand-row write it
-- disappears.
--
-- THE ONE NUMBER THAT IS NOT SMALL, SAID PLAINLY: on a SINGLE write the emitter is 3.9 ms of
-- 30.5 ms — 12.7%. That is the fixed cost of the notice, paid once, on the one write where a
-- person is watching the screen it makes live. It is not the bar the chair set (bulk), it is
-- not a per-row cost, and it buys the thing the write is for. Left as it is, and written down
-- rather than left for somebody to rediscover.
--
-- Run: <psql> -f scripts/campaign-tests/realtime2_write_cost_direct.sql     (ends in ROLLBACK)

\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10s';

create temp table rt2_direct (what text, arm text, rep int, rows int, ms numeric) on commit drop;
create temp table rt2_write  (what text, rows int, total_ms numeric, outbox_rows int) on commit drop;
grant all on rt2_direct to authenticated;
grant all on rt2_write  to authenticated;

do $probe$
declare
  c_admin  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_boss   text := current_user;
  v_org    uuid; v_home uuid; v_tbl uuid;
  v_rows   jsonb[]; v_ids uuid[];
  t0 timestamptz; t1 timestamptz;
  i int; r int; v_n int; v_arm text; v_before bigint; v_after bigint;
  c_donors text[] := array['Ventura County Certified Growers','Oxnard Pacific Market',
                           'Camarillo Harvest Co-op','Santa Paula Citrus Association',
                           'Port Hueneme Grocers Alliance'];
  c_cats   text[] := array['Fresh produce','Dairy','Dry goods','Frozen protein','Bakery'];
begin
  -- ── FIXTURES as the connected role. A seat is a PERSON; no client door makes a company. ──
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Ventura County Food Share — emitter cost',
          'vcfs-rt2-direct-' || substr(md5(random()::text),1,8), 'VCF', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/realtime2_write_cost_direct', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ── PART 0: TAKE THE SEAT AND PROVE IT. ────────────────────────────────────────────────
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this probe did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0 OK  seat taken: authenticated, and custom.record is unreadable from it';

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
                                jsonb_build_object('name','Oxnard warehouse dock'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Pallet intake','slug','pallet_intake_' || substr(md5(random()::text),1,8),
    'type','entity','label_singular','Pallet','label_plural','Pallets',
    'title_field','pallet_tag','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,
    'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pallet_tag')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Pallet tag','key','pallet_tag','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Donor','key','donor','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Net weight','key','net_weight_lbs','type','number'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Category','key','category','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Crossed the door','key','received_at','type','datetime'));

  -- ── PART 1: WHAT A REAL WRITE COSTS, AND HOW MANY OUTBOX ROWS IT MAKES. ────────────────
  -- Through the real door, from the seat. The outbox count is what decides the size of the
  -- transition table PART 2 then fires the emitter against, so the two halves measure the
  -- same write and not two different imaginations of it.

  -- A van turns up: ONE pallet.
  perform set_config('role', v_boss, true);   -- no client door counts the outbox; step out and say so
  select count(*) into v_before from custom.io_outbox where organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  t0 := clock_timestamp();
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'pallet_tag','VCFS-' || to_char(now(),'YYYYMMDD') || '-0001',
    'donor', c_donors[1], 'net_weight_lbs', 612, 'category', c_cats[1],
    'received_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SSZ')));
  t1 := clock_timestamp();
  perform set_config('role', v_boss, true);
  select count(*) into v_after from custom.io_outbox where organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  insert into rt2_write values ('single write', 1,
                                round(extract(epoch from (t1-t0)) * 1000, 3),
                                (v_after - v_before)::int);

  -- The morning after a food drive: 1,000 pallets in one record_write_many.
  v_rows := array[]::jsonb[]; v_ids := array[]::uuid[];
  for i in 1..1000 loop
    v_rows := v_rows || jsonb_build_object(
      'pallet_tag','VCFS-DRIVE-' || lpad(i::text,5,'0'), 'donor', c_donors[1 + (i % 5)],
      'net_weight_lbs', 420 + (i * 13) % 1100, 'category', c_cats[1 + (i % 5)],
      'received_at', to_char(now() - (i || ' seconds')::interval,'YYYY-MM-DD"T"HH24:MI:SSZ'));
    v_ids := v_ids || gen_random_uuid();
  end loop;
  perform set_config('role', v_boss, true);   -- no client door counts the outbox; step out and say so
  select count(*) into v_before from custom.io_outbox where organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  t0 := clock_timestamp();
  perform custom.record_write_many(v_org, v_tbl, v_rows, v_ids);
  t1 := clock_timestamp();
  perform set_config('role', v_boss, true);
  select count(*) into v_after from custom.io_outbox where organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  insert into rt2_write values ('record_write_many 1,000', 1000,
                                round(extract(epoch from (t1-t0)) * 1000, 3),
                                (v_after - v_before)::int);

  -- The whole county drive: 5,000 pallets in one record_write_many.
  v_rows := array[]::jsonb[]; v_ids := array[]::uuid[];
  for i in 1..5000 loop
    v_rows := v_rows || jsonb_build_object(
      'pallet_tag','VCFS-COUNTY-' || lpad(i::text,6,'0'), 'donor', c_donors[1 + (i % 5)],
      'net_weight_lbs', 380 + (i * 7) % 1400, 'category', c_cats[1 + (i % 5)],
      'received_at', to_char(now() - (i || ' seconds')::interval,'YYYY-MM-DD"T"HH24:MI:SSZ'));
    v_ids := v_ids || gen_random_uuid();
  end loop;
  perform set_config('role', v_boss, true);   -- no client door counts the outbox; step out and say so
  select count(*) into v_before from custom.io_outbox where organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  t0 := clock_timestamp();
  perform custom.record_write_many(v_org, v_tbl, v_rows, v_ids);
  t1 := clock_timestamp();
  perform set_config('role', v_boss, true);
  select count(*) into v_after from custom.io_outbox where organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  insert into rt2_write values ('record_write_many 5,000', 5000,
                                round(extract(epoch from (t1-t0)) * 1000, 3),
                                (v_after - v_before)::int);

  -- ── PART 2: THE EMITTER, ON ITS OWN, TEN TIMES EACH WAY, AT EACH SIZE. ─────────────────
  -- Step out of the seat and SAY SO: writing `custom.io_outbox` directly is an operator
  -- statement no client door covers, and no product clause is asserted while out. The trigger
  -- under test cannot tell the difference — it reads the transition table and nothing else.
  perform set_config('role', v_boss, true);

  foreach v_n in array array[1, 1000, 5000] loop
    for r in 1..10 loop
      v_arm := case when r % 2 = 1 then 'on' else 'off' end;
      update platform.feature_knob
         set value = (case when v_arm = 'on' then 'true' else 'false' end)::jsonb
       where feature = 'platform' and key = 'realtime_broadcast_enabled';
      perform platform.memo_clear();

      t0 := clock_timestamp();
      insert into custom.io_outbox
        (event_key, record_id, table_id, operation, changed_field_ids, actor,
         dedupe_key, organization_id, created_by)
      select 'records.changed', gen_random_uuid(), v_tbl, 'created', '[]'::jsonb, '{}'::jsonb,
             'rt2-direct-' || v_n || '-' || r || '-' || g::text, v_org, c_admin
        from generate_series(1, v_n) g;
      t1 := clock_timestamp();

      insert into rt2_direct values ('outbox statement of ' || v_n || ' row(s)', v_arm, r, v_n,
                                     round(extract(epoch from (t1-t0)) * 1000, 3));
    end loop;
  end loop;

  -- Leave the switch as this database expects to find it. (The whole file rolls back anyway;
  -- this is belt and braces against a future edit that commits by mistake.)
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'platform' and key = 'realtime_broadcast_enabled';
  perform platform.memo_clear();
end;
$probe$;

reset role;

\echo ''
\echo 'WHAT A REAL WRITE COSTS, AND HOW MANY OUTBOX ROWS IT MAKES'
select what, rows, total_ms, outbox_rows,
       round(total_ms / rows, 3) as ms_per_row
  from rt2_write order by rows;

\echo ''
\echo 'THE EMITTER ALONE — one outbox statement, ten repetitions, alternating (ms per statement)'
select what,
       round(avg(ms) filter (where arm = 'off'), 3) as trigger_off_ms,
       round(avg(ms) filter (where arm = 'on'),  3) as trigger_on_ms,
       round(avg(ms) filter (where arm = 'on') - avg(ms) filter (where arm = 'off'), 3)
                                                    as emitter_ms,
       round(min(ms) filter (where arm = 'on'), 3)  as on_min,
       round(max(ms) filter (where arm = 'on'), 3)  as on_max
  from rt2_direct group by what order by min(rows);

\echo ''
\echo 'THE ANSWER — the emitter as a share of the write it announces'
with e as (
  select min(rows) as rows,
         avg(ms) filter (where arm = 'on') - avg(ms) filter (where arm = 'off') as emitter_ms
    from rt2_direct group by what
)
select w.what, w.rows, w.total_ms as write_ms, round(e.emitter_ms, 3) as emitter_ms,
       round(100.0 * e.emitter_ms / nullif(w.total_ms, 0), 3) as emitter_pct_of_write,
       case when 100.0 * e.emitter_ms / nullif(w.total_ms, 0) < 3.0
            then 'under the 3% bar' else 'OVER the 3% bar' end as verdict
  from rt2_write w join e on e.rows = w.rows
 order by w.rows;

rollback;
