-- chair-step: deletes only a stale self-test's scratch registrations (zz_ tokens) and drops its zz_ scratch schema; no product data.
-- scratch_cleanup_rls_on_selftest_mui408q9.sql
--
-- Removes the scratch objects `pnpm check:rls-on --self-test` left at 2026-09-26 08:10:01Z
-- (run id mui408q9, decoded from the schema name): two platform.entity_types rows and their schema.
-- Ten hours stale; `pnpm gen:entity-types` refuses every `zz_` registration, so `pnpm sync-types`
-- could not run for anyone. The remedy the teardown report names (scripts/lib/scratch-teardown.ts).
delete from platform.entity_types
 where token in ('zz_rls_on_selftest_mui408q9_t', 'zz_rls_on_selftest_mui408q9_v');
drop schema if exists zz_rls_on_selftest_mui408q9 cascade;
