-- lane: DOORS-ONLY-3
-- The four batch A doors are DECLARED in platform.client_callable_door but hold no client
-- EXECUTE grant, so every browser call answers 42501.
--
-- WHY, MEASURED RATHER THAN GUESSED. `platform.reopen_declared_doors(p_schema)` returns
-- immediately unless that schema is DECLARED CLOSED in `platform.schema_client_exposure`, and
-- `public` is an OPEN schema -- in an open schema a revoke is somebody's decision and the
-- repair function rightly has no business undoing it. So in `public` the grant is the
-- migration's own job, issued AFTER the door row exists: the `enforce_definer_client_grants`
-- event trigger then reads the row, sees `signed_in_callers`, and KEEPS the grant instead of
-- taking it back. Every existing public door (`org_create`, `assoc_add`) carries exactly this
-- shape -- read from `pg_proc.proacl` on the live database, not assumed.
--
-- ADDITIVE. Four grants on four functions this lane created minutes ago.
-- Inverse: migrations/inverse/doorsonly3_batch_a_doors_get_their_client_grant.inverse.sql
-- Guard: has_function_privilege('authenticated', <door>, 'EXECUTE') is true for all four.

grant execute on function public.checklist_run_start(uuid, text, text) to authenticated;
grant execute on function public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamptz, boolean, timestamptz) to authenticated;
grant execute on function public.egress_device_set(uuid, boolean, text) to authenticated;
grant execute on function public.masterwork_run_score(uuid, numeric, text) to authenticated;
