-- staff_door_selftest_leftover_removed.sql
--
-- WHAT: removes the one scratch object `pnpm check:staff-door --self-test` left behind on
-- 2026-09-14 07:12:11Z — the registry row `zz_staff_door_selftest_mu0wnnb1_token` and the schema
-- `zz_staff_door_selftest_mu0wnnb1` (one empty table `probe`, its pkey, its row types).
--
-- WHY IT WAS LEFT: at 07:12:57Z every statement the teardown sent on platform.entity_types failed
-- with `permission denied for table entity_types` (postgres_logs, three rows). The teardown caught
-- both failures in `catch {}` and its leftover check then threw out of `finally`, so the run died
-- as a generic crash that named nothing. aidream f1b781fb2 then synced the token into the
-- published @ai-matrx/associations vocabulary (0.9.15). The class fix is
-- `scripts/lib/scratch-teardown.ts` (DC-027 #8); this file is only the instance.
--
-- SAFE, PROVEN READ-ONLY BEFORE WRITING (2026-09-15): zero rows reference the token in any of the
-- 14 foreign keys onto platform.entity_types; the schema holds nothing but the probe table (0 rows),
-- its pkey and its two row types; no function, no policy, no inbound dependency.
--
-- Idempotent: a re-run finds nothing and does nothing. The guard refuses to drop the schema if it
-- has grown anything that is not the self-test's own probe.

do $guard$
declare
  foreign_objects text;
begin
  select string_agg(c.relname || ':' || c.relkind::text, ', ')
    into foreign_objects
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'zz_staff_door_selftest_mu0wnnb1'
     and c.relname not in ('probe', 'probe_pkey');
  if foreign_objects is not null then
    raise exception 'refusing to drop zz_staff_door_selftest_mu0wnnb1: it holds objects the self-test never creates (%)', foreign_objects;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'zz_staff_door_selftest_mu0wnnb1') then
    raise exception 'refusing to drop zz_staff_door_selftest_mu0wnnb1: it holds functions the self-test never creates';
  end if;
end
$guard$;

-- Registry row first: the sql_drop event trigger (platform.flag_entity_types_on_drop) flags
-- registered tables on drop, so the row must be gone before the schema is.
delete from platform.entity_types
 where token = 'zz_staff_door_selftest_mu0wnnb1_token'
   and schema_name = 'zz_staff_door_selftest_mu0wnnb1';

drop schema if exists zz_staff_door_selftest_mu0wnnb1 cascade;

do $verify$
begin
  if exists (select 1 from platform.entity_types where token = 'zz_staff_door_selftest_mu0wnnb1_token')
     or exists (select 1 from pg_namespace where nspname = 'zz_staff_door_selftest_mu0wnnb1') then
    raise exception 'zz_staff_door_selftest_mu0wnnb1 is still present after removal';
  end if;
end
$verify$;
