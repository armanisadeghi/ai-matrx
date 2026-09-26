-- VRID-PRUNE — THE GREEN SUITE. A person's whole-database record set is asked only about the
-- organizations she has a way into, and the answer is the one the full walk gives.
--
-- THE DEFECT (measured 2026-09-25): custom.visible_record_ids — what iam.accessible_entity_ids
-- ('record', …) answers while custom/accessible_entity_ids_guard is on — asked the read door's full
-- per-pair machinery (custom.visible_predicate_sql → custom.visible_set) for EVERY (organization,
-- Table) pair on the database. 25-38 s per person on production; 218 of the 249 s the store-doors
-- census custom.shared_only_disagreements spent on the clone.
--
--   V0  THE SEAT. The door is asked as `authenticated` with test@test.com's claims, and that is
--       proved before anything is asserted.
--   V1  THE ANSWER. iam.accessible_entity_ids('record', 'viewer', 0, true), asked from the seat,
--       is exactly the FULL WALK — every pair on the database, each through
--       custom.visible_predicate_sql, the pre-VRID-PRUNE definition — computed inline here as the
--       oracle. Same ids, none lost, none gained.
--   V2  THE COST. That door call asks custom.visible_predicate_sql (one call per pair asked) strictly fewer times than there are
--       (organization, Table) pairs on the database: the organizations she has no way into are
--       never asked about.
--       It counts custom.visible_predicate_sql calls PER ENTRY of custom.visible_record_ids: one
--       direct call asks the builder exactly once per pair (clone 2026-09-26: 255 calls, 1 entry,
--       for the one-organization member), but the door statement below enters the function twice,
--       so a raw count against the pair count stayed red after the fix (1,846 = 2 x 923).
--
-- RUN IT (clone or main; ONE transaction, always rolled back; ~1-2 min, the oracle is the full
-- walk on purpose):
--   psql "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/vridprune_green.sql
-- ITS RED: scripts/campaign-tests/vridprune_red.sql — the pre-fix body fails V2, and a prune that
-- forgets every foothold but membership fails V1.

\set ON_ERROR_STOP on
\timing off

\set suite 'vridprune_green.sql'
\set requires 'function:custom.visible_record_ids'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
-- ONE SNAPSHOT for the oracle and the door. Under READ COMMITTED each statement sees its own
-- snapshot, and on a database other lanes are writing to (the clone, 2026-09-26) the full walk and
-- the door disagreed by four ids that were written between them — a false R1 BROKEN.
set transaction isolation level repeatable read;
set local statement_timeout = '600s';
set local lock_timeout = '3s';
-- Function-level counters for THIS transaction only (pg_stat_xact_user_functions); V2 reads them.
set local track_functions = 'all';

-- THE KNOB IS READ, NEVER WRITTEN. A suite that turned it on "for this transaction only" is how it
-- came to be on everywhere (2026-09-20 02:18:20Z, one committed UPDATE). If it is off, the door
-- does not reach custom.visible_record_ids and there is nothing here to assert.
select coalesce(platform.knob_resolve('custom', 'accessible_entity_ids_guard', null)::text::boolean, false)
         as vrid_knob_on,
       (select u.id from auth.users u where u.email = 'test@test.com') as vrid_person
\gset
-- A dollar-quoted body is never interpolated by psql, so the DO blocks read the person from here.
select set_config('vrid.person', coalesce(:'vrid_person', ''), true);
\if :vrid_knob_on
\else
  \echo 'vridprune_green.sql: SKIPPED — custom/accessible_entity_ids_guard resolves false, so iam.accessible_entity_ids(''record'') does not reach custom.visible_record_ids'
  rollback;
  \quit
\endif

-- ══ THE ORACLE: the full walk, every pair, exactly as the pre-VRID-PRUNE body walked it. Asked as
--    the database owner because it IS the definition, not a door.
do $oracle$
declare
  v_person uuid := nullif(current_setting('vrid.person'), '')::uuid;
  v_pair   record;
  v_pred   text;
  v_ids    uuid[] := '{}';
  v_more   uuid[];
  v_pairs  integer := 0;
  t0       timestamptz := clock_timestamp();
begin
  if v_person is null then
    raise exception 'V1 CANNOT RUN — test@test.com does not exist on this database';
  end if;
  for v_pair in
    select r.organization_id as org, r.table_id as tbl
      from custom.record r where r.deleted_at is null
     group by r.organization_id, r.table_id
  loop
    v_pairs := v_pairs + 1;
    v_pred := custom.visible_predicate_sql(v_person, v_pair.org, v_pair.tbl, 'viewer', 'r');
    execute format('select coalesce(array_agg(r.id), ''{}'') from custom.record r'
                   || ' where r.organization_id = %L::uuid and r.table_id is not distinct from %L::uuid'
                   || '   and r.deleted_at is null and (%s)', v_pair.org, v_pair.tbl, v_pred)
      into v_more;
    v_ids := v_ids || v_more;
  end loop;
  perform set_config('vrid.oracle', coalesce((select array_agg(distinct x order by x) from unnest(v_ids) x), '{}')::text, true),
          set_config('vrid.pairs', v_pairs::text, true),
          set_config('vrid.oracle_ms', round(extract(epoch from clock_timestamp() - t0) * 1000)::text, true),
          set_config('vrid.calls_before',
                     coalesce((select calls from pg_stat_xact_user_functions
                                where schemaname = 'custom' and funcname = 'visible_predicate_sql'), 0)::text, true),
          set_config('vrid.vrid_before',
                     coalesce((select calls from pg_stat_xact_user_functions
                                where schemaname = 'custom' and funcname = 'visible_record_ids'), 0)::text, true);
  raise notice 'ORACLE — the full walk: % pairs, % ids, % ms',
    v_pairs, coalesce(array_length(v_ids, 1), 0), current_setting('vrid.oracle_ms');
end $oracle$;

-- ══ V0: THE SEAT.
select set_config('request.jwt.claims',
                  json_build_object('sub', :'vrid_person', 'role', 'authenticated')::text, true);
set local role authenticated;
do $v0$
begin
  if current_user <> 'authenticated' or auth.uid() is distinct from nullif(current_setting('vrid.person'), '')::uuid then
    raise exception 'V0 FAILED — the seat is %/%, not authenticated/test@test.com', current_user, auth.uid();
  end if;
  raise notice 'V0 PASSED — asking as authenticated, auth.uid() = test@test.com';
end $v0$;

-- ══ THE DOOR, from the seat.
select set_config('vrid.t0', clock_timestamp()::text, true);
select set_config('vrid.door',
         coalesce((select array_agg(distinct x order by x)
                     from unnest(iam.accessible_entity_ids('record', 'viewer', 0, true)) x), '{}')::text, true);
select set_config('vrid.door_ms',
         round(extract(epoch from clock_timestamp() - current_setting('vrid.t0')::timestamptz) * 1000)::text, true);
reset role;

-- ══ V1: THE ANSWER.
do $v1$
declare
  v_oracle uuid[] := current_setting('vrid.oracle')::uuid[];
  v_door   uuid[] := current_setting('vrid.door')::uuid[];
  v_lost   integer;
  v_gained integer;
begin
  select count(*) into v_lost   from (select unnest(v_oracle) except select unnest(v_door)) x;
  select count(*) into v_gained from (select unnest(v_door) except select unnest(v_oracle)) x;
  if v_lost > 0 or v_gained > 0 then
    raise exception 'V1 FAILED — the door and the full walk disagree for test@test.com: % ids the full walk admits are missing, % ids it refuses were returned. A ladder arm admits a person by something VRID-PRUNE does not list — widen custom.visible_record_ids'' organization set.',
      v_lost, v_gained;
  end if;
  if coalesce(array_length(v_oracle, 1), 0) = 0 then
    raise exception 'V1 CANNOT ASSERT — the full walk is empty for test@test.com, so equality proves nothing';
  end if;
  raise notice 'V1 PASSED — the door returned exactly the full walk''s % ids', array_length(v_oracle, 1);
end $v1$;

-- ══ V2: THE COST.
do $v2$
declare
  v_pairs integer := current_setting('vrid.pairs')::integer;
  v_calls integer := coalesce((select calls from pg_stat_xact_user_functions
                                where schemaname = 'custom' and funcname = 'visible_predicate_sql'), 0)
                     - current_setting('vrid.calls_before')::integer;
  -- The door statement may enter custom.visible_record_ids more than once (measured: twice
  -- inside the set_config above), so the cost is judged PER ENTRY — pairs asked per call.
  v_entries integer := coalesce((select calls from pg_stat_xact_user_functions
                                  where schemaname = 'custom' and funcname = 'visible_record_ids'), 0)
                       - current_setting('vrid.vrid_before')::integer;
  v_per integer;
begin
  if v_entries < 1 then
    raise exception 'V2 CANNOT ASSERT — the door never entered custom.visible_record_ids (knob or routing changed)';
  end if;
  v_per := v_calls / v_entries;
  if v_per >= v_pairs then
    raise exception 'V2 FAILED — each entry of custom.visible_record_ids asked custom.visible_predicate_sql about % of % pairs (% calls over % entries): it still walks every organization on the database (door % ms, full walk % ms)',
      v_per, v_pairs, v_calls, v_entries, current_setting('vrid.door_ms'), current_setting('vrid.oracle_ms');
  end if;
  raise notice 'V2 PASSED — each entry of custom.visible_record_ids asked about % of % pairs (% calls over % entries; door % ms, full walk % ms)',
    v_per, v_pairs, v_calls, v_entries, current_setting('vrid.door_ms'), current_setting('vrid.oracle_ms');
end $v2$;

rollback;
