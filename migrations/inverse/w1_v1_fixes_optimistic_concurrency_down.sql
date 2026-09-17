-- target: branch
--
-- THE INVERSE of `migrations/campaign/w1_v1_fixes_optimistic_concurrency.sql` (rule 27). It
-- restores the prior state exactly: `custom.record_update` does not exist and its
-- `platform.client_callable_door` row is gone, so `custom` holds the same eleven door rows
-- and the same eleven SECURITY DEFINER functions it did before that file.
--
-- ORDER MATTERS AND IS NOT COSMETIC. The door row goes FIRST: dropping the function while
-- its row still stands makes `platform._door_follows_its_function` record a `door_orphaned`
-- debt, and `platform._provision_shape_settled` then refuses the whole transaction at COMMIT
-- - which is exactly the guard doing its job, and exactly the reason
-- `w1_v1_fixes_branch_levels_door_orphaned.sql` had to level the branch first.
--
-- Branch-only: it DROPs, and schema `custom` does not exist on production.

set lock_timeout = '5s';
set statement_timeout = '300s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_update';

drop function if exists custom.record_update(uuid, uuid, jsonb, integer);
