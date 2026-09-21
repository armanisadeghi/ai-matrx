-- LANE REALTIME-2 — WHAT THE REALTIME EMITTER COSTS THE WRITE PATH, MEASURED.
--
-- Lane REALTIME hung the notice emitter off `custom.io_outbox` rather than `custom.record`
-- and argued from that placement that the 3% bulk-write bar "was not the live question it
-- would have been on the custom.record route". An argument is not a measurement. This file is
-- the measurement.
--
-- THE LEVER IS A KNOB, NOT A DDL LOCK. `ALTER TABLE custom.io_outbox DISABLE TRIGGER` would
-- hold ACCESS EXCLUSIVE on the busiest table in the store for the whole length of a
-- five-thousand-row run, on a database eight other lanes are landing migrations on. Since
-- `realtime2_the_emitter_reads_the_platform_switch.sql` the emitter reads
-- `platform/realtime_broadcast_enabled` once per statement and returns immediately when it is
-- off, so this file flips ONE knob row instead and blocks nobody. The OFF arm therefore still
-- pays one `platform.knob_resolve` per statement — a cost this file does not subtract, so
-- every number below slightly UNDERSTATES the emitter and never flatters it.
--
-- ALTERNATED, BECAUSE ONE RUN AT ONE TIME IS NOT EVIDENCE. This database is shared: lane
-- WRITE-PERF-3 measured the same five-thousand-row file at 12.93 ms/row and 18.59 ms/row with
-- nothing changed underneath it. So the halves run ON, OFF, ON, OFF inside ONE transaction
-- that rolls back — same connection, same caches, same contention — and the comparison is of
-- the two MEANS, with both individual runs printed so a reader can see the spread.
--
-- THE USE CASE (owner law 2026-09-21: no fake test data). VENTURA COUNTY FOOD SHARE runs a
-- pallet intake log at its Oxnard warehouse. Every inbound donation is weighed on the dock
-- scale and logged: the pallet tag the driver hands over, which grocer or grower it came from,
-- the net weight off the scale, the category the volunteers sort it into, and the time it
-- crossed the door. One pallet at a time when a van turns up; five thousand rows at once the
-- morning after a county-wide food drive, when the scale's own CSV is imported.
--
-- 🚨 WHAT THIS FILE ACTUALLY MEASURED, 2026-09-21 05:1x-05:2xZ — READ THIS BEFORE TRUSTING A
-- NUMBER OUT OF IT. The answer came back NEGATIVE: the emitter-ON arms were 8% and 28% FASTER
-- than the emitter-OFF arms on the two bulk writes, which is not a result, it is noise wearing
-- a result's clothes. The per-run column says why — the 5,000-row write measured 24.723,
-- 25.047, 10.713 and 24.380 ms/row across four runs of the SAME code minutes apart:
--
--            what            run  arm     ms
--    record_write_many 1,000   1  on    14.176
--    record_write_many 1,000   2  off   13.222
--    record_write_many 1,000   3  on    11.126
--    record_write_many 1,000   4  off   14.289
--    record_write_many 5,000   1  on    24.723
--    record_write_many 5,000   2  off   25.047
--    record_write_many 5,000   3  on    10.713   <- half the other three, nothing changed
--    record_write_many 5,000   4  off   24.380
--    single write              1  on    23.615
--    single write              2  off   17.168
--    single write              3  on    19.730
--    single write              4  off   20.571
--
-- THE NOISE FLOOR OF THIS SHARED DATABASE IS ABOUT +/-50%. THE BAR IS 3%. A wall-clock A/B
-- cannot answer a 3% question here and no number of extra runs fixes that — lane WRITE-PERF-3
-- hit the same wall and said so. So this file is kept as the honest record of an instrument
-- that was too blunt for its question, and the question is answered by counting the work
-- instead: `scripts/campaign-tests/realtime2_write_cost_direct.sql`.
--
-- Run: <psql> -f scripts/campaign-tests/realtime2_write_cost.sql       (ends in ROLLBACK)

\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10min';

create temp table rt2_cost (run int, arm text, what text, rows int, ms numeric) on commit drop;
grant all on rt2_cost to authenticated;

create or replace function pg_temp.pallet_intake(p_run int, p_arm text) returns void
language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_home uuid; v_tbl uuid;
  t0 timestamptz; t1 timestamptz;
  i int; v_rows jsonb[]; v_ids uuid[];
  c_donors text[] := array['Ventura County Certified Growers','Oxnard Pacific Market',
                           'Camarillo Harvest Co-op','Santa Paula Citrus Association',
                           'Port Hueneme Grocers Alliance'];
  c_cats   text[] := array['Fresh produce','Dairy','Dry goods','Frozen protein','Bakery'];
begin
  -- FIXTURES as the connected role (a seat is a person; no client door makes an organization).
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Ventura County Food Share — intake ' || p_arm || ' ' || p_run,
          'vcfs-rt2-' || lower(p_arm) || p_run || '-' || substr(md5(random()::text),1,8),
          'VCF', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/realtime2_write_cost', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'run %/% did not take the seat — current_user is %', p_run, p_arm, current_user;
  end if;

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

  -- ── A VAN TURNS UP: twenty single writes, one pallet at a time. ────────────────────────
  t0 := clock_timestamp();
  for i in 1..20 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object(
      'pallet_tag',      'VCFS-' || to_char(now(),'YYYYMMDD') || '-' || lpad(i::text,4,'0'),
      'donor',           c_donors[1 + (i % 5)],
      'net_weight_lbs',  480 + (i * 17) % 900,
      'category',        c_cats[1 + (i % 5)],
      'received_at',     to_char(now() - (i || ' minutes')::interval, 'YYYY-MM-DD"T"HH24:MI:SSZ')));
  end loop;
  t1 := clock_timestamp();
  insert into rt2_cost values (p_run, p_arm, 'single write', 20,
                               round(extract(epoch from (t1-t0)) * 1000 / 20.0, 3));

  -- ── THE MORNING AFTER A FOOD DRIVE: 1,000 rows in one record_write_many. ──────────────
  v_rows := array[]::jsonb[]; v_ids := array[]::uuid[];
  for i in 1..1000 loop
    v_rows := v_rows || jsonb_build_object(
      'pallet_tag',      'VCFS-DRIVE-' || lpad(i::text,5,'0'),
      'donor',           c_donors[1 + (i % 5)],
      'net_weight_lbs',  420 + (i * 13) % 1100,
      'category',        c_cats[1 + (i % 5)],
      'received_at',     to_char(now() - (i || ' seconds')::interval, 'YYYY-MM-DD"T"HH24:MI:SSZ'));
    v_ids := v_ids || gen_random_uuid();
  end loop;
  t0 := clock_timestamp();
  perform custom.record_write_many(v_org, v_tbl, v_rows, v_ids);
  t1 := clock_timestamp();
  insert into rt2_cost values (p_run, p_arm, 'record_write_many 1,000', 1000,
                               round(extract(epoch from (t1-t0)) * 1000 / 1000.0, 3));

  -- ── THE WHOLE COUNTY DRIVE: 5,000 rows in one record_write_many. ──────────────────────
  v_rows := array[]::jsonb[]; v_ids := array[]::uuid[];
  for i in 1..5000 loop
    v_rows := v_rows || jsonb_build_object(
      'pallet_tag',      'VCFS-COUNTY-' || lpad(i::text,6,'0'),
      'donor',           c_donors[1 + (i % 5)],
      'net_weight_lbs',  380 + (i * 7) % 1400,
      'category',        c_cats[1 + (i % 5)],
      'received_at',     to_char(now() - (i || ' seconds')::interval, 'YYYY-MM-DD"T"HH24:MI:SSZ'));
    v_ids := v_ids || gen_random_uuid();
  end loop;
  t0 := clock_timestamp();
  perform custom.record_write_many(v_org, v_tbl, v_rows, v_ids);
  t1 := clock_timestamp();
  insert into rt2_cost values (p_run, p_arm, 'record_write_many 5,000', 5000,
                               round(extract(epoch from (t1-t0)) * 1000 / 5000.0, 3));
end;
$$;

do $alternate$
declare
  v_boss text := current_user;
  v_run  int;
  v_arm  text;
begin
  -- ON, OFF, ON, OFF. Alternated rather than blocked so a drift in the machine's load over
  -- the eight minutes this takes lands on both arms, not on one of them.
  for v_run in 1..4 loop
    v_arm := case when v_run % 2 = 1 then 'on' else 'off' end;
    perform set_config('role', v_boss, true);
    update platform.feature_knob
       set value = (case when v_arm = 'on' then 'true' else 'false' end)::jsonb
     where feature = 'platform' and key = 'realtime_broadcast_enabled';
    perform platform.memo_clear();
    perform pg_temp.pallet_intake(v_run, v_arm);
    perform set_config('role', v_boss, true);
    raise notice 'run % (emitter %) done', v_run, v_arm;
  end loop;
end;
$alternate$;

reset role;

\echo ''
\echo 'PER RUN (ms per row)'
select what, run, arm, ms from rt2_cost order by what, run;

\echo ''
\echo 'THE ANSWER — mean of the two ON runs vs the two OFF runs, and what the emitter costs'
select what,
       round(avg(ms) filter (where arm = 'off'), 3)                                as emitter_off_ms_per_row,
       round(avg(ms) filter (where arm = 'on'),  3)                                as emitter_on_ms_per_row,
       round(avg(ms) filter (where arm = 'on') - avg(ms) filter (where arm = 'off'), 3)
                                                                                   as emitter_ms_per_row,
       round(100.0 * (avg(ms) filter (where arm = 'on') - avg(ms) filter (where arm = 'off'))
             / nullif(avg(ms) filter (where arm = 'off'), 0), 2)                   as emitter_pct
  from rt2_cost
 group by what
 order by what;

rollback;
