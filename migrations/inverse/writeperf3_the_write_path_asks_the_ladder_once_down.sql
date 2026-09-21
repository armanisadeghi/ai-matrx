-- additive: yes
--
-- chair-step: THE INVERSE of writeperf3_the_write_path_asks_the_ladder_once.sql. It puts
--   `custom.assert_store_door`, `custom.assert_client_may_reach` and
--   `custom.assert_may_know_table` back exactly as the live catalogue held them before
--   WRITE-PERF-3 — each asking the ladder again on every single row — and removes the
--   statement-level triggers that empty the memo, together with the census and the declared
--   list. The three bodies themselves live in
--   `writeperf3_the_write_path_asks_the_ladder_once_bodies_down.sql`, which this file reads and
--   which a harness that cannot afford fourteen ACCESS EXCLUSIVE locks reads on its own. Run
--   for real by scripts/campaign-tests/writeperf3_red.sql and writeperf3_parity.sql inside a
--   rolled-back transaction.

-- THE ORDER IS NOT COSMETIC. Dropping a trigger needs ACCESS EXCLUSIVE, and the ladder itself
-- reads `platform.entity_grants` BEFORE `platform.associations` in every visibility check on
-- this database. Taking `platform.associations` first — which is what the declared order does —
-- means any concurrent reader holding entity_grants and waiting on associations deadlocks this
-- file: measured, six consecutive attempts, always that pair. So the two tables every peer
-- touches, `platform.associations` and `custom.record`, are taken LAST, in the same order the
-- readers take them.
--
-- ground-standing-ok: c — `platform.memo_clear_stmt` and `platform.memo_clear_on_structure`
-- look like bodies no trigger runs, and they are not. WRITE-PERF-3's up-file creates
-- `zz_memo_clear_i` / `_u` / `_d` over them DYNAMICALLY, with `execute 'create trigger ...'`
-- across every table `platform.memo_reach_tables()` names, so no static `create trigger`
-- statement exists anywhere in the tree for a reader without a database to find. The DO block
-- immediately below detaches exactly that set, by the same dynamic sweep and in the
-- deadlock-safe order the header explains, BEFORE the two bodies are dropped. The `--live` arm
-- reads `pg_trigger` and sees both the triggers and the detach; the static arm cannot, and
-- this line is that answer rather than an excuse.
do $do$
declare r text; v_order text[];
begin
  select array_agg(x order by (x in ('platform.associations','custom.record')), x)
    into v_order from unnest(platform.memo_reach_tables()) x;
  foreach r in array v_order loop
    execute 'drop trigger if exists zz_memo_clear_i on ' || r;
    execute 'drop trigger if exists zz_memo_clear_u on ' || r;
    execute 'drop trigger if exists zz_memo_clear_d on ' || r;
  end loop;
end;
$do$;
drop function if exists platform.memo_reach_unguarded();
drop function if exists platform.memo_clear_on_structure();
drop function if exists platform.memo_clear_stmt();
drop function if exists platform.memo_reach_tables();

\i migrations/inverse/writeperf3_the_write_path_asks_the_ladder_once_bodies_down.sql
