-- lane: DOORS-ONLY-4
-- chair-step: the same `select iam.apply_rls(...)` canonical route, for the same reason.
--
-- INVERSE of migrations/campaign/doorsonly4_regen_platform_assurance_level.sql
--
-- 🚨 THIS FILE ALONE DOES NOTHING. It re-runs the SAME canonical route over the SAME table, so
-- what it restores is whatever the generator says at the moment it runs. To reverse the change,
-- run the generator's own inverse FIRST --
-- migrations/inverse/doorsonly4_the_generator_stops_emitting_client_writes.inverse.sql -- and
-- then this: the restored generator emits platform_admin_all and the std_* write family again,
-- and iam.apply_rls's DD-147 loop removes the orphaned platform_admin_select because the restored
-- catalog no longer claims the name. Run in the other order and this is a no-op, which is honest:
-- there is no per-table copy of a generated policy set to restore, and a file pretending to hold
-- one would be a lie the next platform.provision would expose.
set lock_timeout = '2s';
set statement_timeout = '600s';

select iam.apply_rls('platform', 'assurance_level', 'assurance_level', 'system');
