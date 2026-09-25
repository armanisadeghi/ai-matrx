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

set lock_timeout = '2s';
set statement_timeout = '300s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_update';

-- 🚨 `custom.record_update` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21).
-- FOUR LIVE TRIGGERS AND ONE DOOR OUTSIDE THIS LANE NOW REACH IT: `zz_ckl_watch`,
-- `custom_record_field_type_converts_values` and `zzz_pipelines_on_entry` on `custom.record`,
-- `zzzz_store_relation_edge_names_its_field` on `platform.associations`, and
-- `custom.work_approval_decide` (`apprvfix_the_queue_holds_a_record_write_too.sql`), which
-- performs an approved record write through this very door. None of those lanes knew V1-FIXES
-- existed. Dropping the function would leave those triggers attached over a body that is gone,
-- and the next write to the record store would raise before anything else could run.
--
-- So the function is LEFT WHERE IT IS and the behaviour is NEUTERED instead: the DELETE above
-- takes away the `platform.client_callable_door` row, which is the ONLY thing that made
-- optimistic concurrency reachable by a client. After this file runs, `custom` once again
-- holds the same eleven CLIENT-CALLABLE doors it held before V1-FIXES, a client that asks for
-- `record_update` is refused by the door registry exactly as it was, and no caller can pass an
-- expected version through the client edge — which is the defect this file exists to restore.
-- The body stays only because the platform's own triggers, not clients, now call it.
--   drop function if exists custom.record_update(uuid, uuid, jsonb, integer);  -- NOT dropped
