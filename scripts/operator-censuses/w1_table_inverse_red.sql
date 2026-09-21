-- OPERATOR REHEARSAL, NOT A PRODUCT SUITE: running an inverse is DDL — it drops triggers off
-- `custom.record` and drops views and functions — and no `authenticated` seat can do any of
-- that, so this cannot sit down and `pnpm check:suites-take-the-seat` does not count this
-- directory. It asserts nothing about what a person may reach; the product suite for these
-- guards is `scripts/campaign-tests/w1_table_red.sql`, from the seat.
--
-- W1-TABLE — THE TWIN OF THE INVERSE ITSELF, on the REHEARSAL BRANCH.
--
-- RUN IT:
--   PSQL="$(brew --prefix libpq)/bin/psql"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_table_inverse_red.sql
--
-- WHY IT EXISTS (lane INVERSE-GUARD, 2026-09-21). `w1_table_red.sql` proves W1-TABLE's two
-- guards are what refuse — it does that by `ALTER TABLE … DISABLE TRIGGER` inside its own
-- transaction, and it never runs `migrations/inverse/w1_table_table_home_containment_down.sql`
-- at all. So nothing in the campaign exercised that inverse, and for months nothing could have:
-- it opened with a guard refusing unless schema `custom` held NOTHING but this lane's own
-- fifteen function names. Thirty lanes have landed in `custom` since; the branch holds 268
-- there, so it raised naming 250 of them on every database in existence. An inverse nothing
-- runs is an inverse nobody knows is broken.
--
-- WHAT THIS ASSERTS, in one transaction that always ends in ROLLBACK:
--   1. the world BEFORE: both guards attached to `custom.record`, both projections present;
--   2. the inverse RUNS to its end — the thing that was impossible;
--   3. the world AFTER: both guard triggers gone, both projections gone, and every body this
--      file is allowed to remove gone — the defect W1-TABLE found, put back;
--   4. and the two bodies later lanes adopted are STILL STANDING. An inverse that restored the
--      defect by taking `custom.record_reparent` out from under W3-MIG's two doors would not be
--      restoring a defect, it would be breaking the platform.
--
-- 🚨 THE BRANCH, NOT MAIN, AND THAT IS DELIBERATE. Dropping two triggers off `custom.record`
-- takes ACCESS EXCLUSIVE on the parent and all sixteen partitions. On the instance people sign
-- in to that is a write freeze for the length of the transaction, and the standing rule is that
-- big routine jobs run 1–4 AM PT and never hold a long lock on the live database. The bytes
-- under test are the same bytes either way.

\set ON_ERROR_STOP on

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $before$
declare v_trig integer; v_views integer;
begin
  if current_setting('server_version_num')::int < 130000 then
    raise exception 'unexpected server version';
  end if;
  select count(*) into v_trig from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'custom'::regnamespace and c.relname = 'record'
     and t.tgname in ('custom_record_containment_guard', 'custom_record_table_shape_guard');
  select count(*) into v_views from pg_class
   where relnamespace = 'custom'::regnamespace and relname in ('home', 'table');
  if v_trig <> 2 or v_views <> 2 then
    raise exception 'PRECONDITION FAILED: W1-TABLE is not standing on this database (% guard trigger(s), % projection(s)) — there is no defect to put back', v_trig, v_views
      using hint = 'Point this at the rehearsal branch, which carries the lane.';
  end if;
  raise notice 'BEFORE — both guards attached to custom.record, custom.home and custom."table" both present.';
end
$before$;

-- ── THE INVERSE ITSELF, the same bytes rule 27 runs ───────────────────────────
\i migrations/inverse/w1_table_table_home_containment_down.sql

do $after$
declare v_trig integer; v_views integer; v_gone integer; v_standing integer;
begin
  select count(*) into v_trig from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'custom'::regnamespace and c.relname = 'record'
     and t.tgname in ('custom_record_containment_guard', 'custom_record_table_shape_guard');
  if v_trig <> 0 then
    raise exception 'RED 1 DID NOT GO RED: % guard trigger(s) still attached to custom.record after the inverse ran', v_trig;
  end if;

  select count(*) into v_views from pg_class
   where relnamespace = 'custom'::regnamespace and relname in ('home', 'table');
  if v_views <> 0 then
    raise exception 'RED 2 DID NOT GO RED: % projection(s) still present after the inverse ran', v_views;
  end if;

  select count(*) into v_gone from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.proname in ('_containment_guard', '_table_shape_guard', 'home_add', 'reachable_from');
  if v_gone <> 0 then
    raise exception 'RED 3 DID NOT GO RED: % of the four bodies this file removes are still here', v_gone;
  end if;

  -- AND THE OTHER HALF, which is the whole point of the class this lane's guard enforces.
  select count(*) into v_standing from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname in ('record_reparent', 'home_relations');
  if v_standing < 2 then
    raise exception 'THE GROUND DID NOT STAY STANDING: custom.record_reparent / custom.home_relations are adopted by W3-MIG and CHOICE-VAL and only % of the 2 survived the inverse', v_standing
      using hint = 'An inverse restores a defect; it does not take a later lane''s door down with it.';
  end if;

  raise notice 'RED 1 — both guards are off custom.record: no Table is held to a home, nothing refuses a containment cycle, nothing enforces the depth ceiling.';
  raise notice 'RED 2 — custom.home and custom."table" are gone: the projections a person reads are not there.';
  raise notice 'RED 3 — all four bodies this file removes are gone.';
  raise notice 'STANDING — custom.record_reparent and custom.home_relations survived, so W3-MIG''s two doors and CHOICE-VAL''s custom.query_table_homes still resolve.';
  raise notice 'THE INVERSE RAN AND THE DEFECT IS BACK. Rolling back — nothing below this line survives.';
end
$after$;

rollback;
