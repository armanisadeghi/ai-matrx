-- chair-step: DOORS-ONLY-2 batch 3 -- withdraw the dead client write GRANTs on
-- `iam.access_requests` and `platform.associations`. A CHAIR STEP, NOT A LANE STEP.
--
-- `platform` and `iam` are both in REVOKE_PROTECTED_SCHEMAS
-- (matrx-frontend/scripts/lib/migration-target.ts), so a REVOKE there is a header-less
-- chair-step file that runs only when the command says `--confirm-chair-step`.
--
-- 🚨 `platform.associations` IS DIFFERENT FROM EVERY OTHER LINE THIS LANE HANDED UP, and the
-- chair should know why before running it. It is the 84,566-row table every M2M relationship
-- in the platform lives in, and it is the only one in this lane that HAD real client writers:
-- four of them, moved to `public.assoc_add` and `public.assoc_remove` in the same commit as
-- its refusal policy, type-checked, and proven by a seated suite
-- (scripts/campaign-tests/doorsonly2_associations_door_green.sql, 5/5). So this REVOKE is not
-- tidying a grant nobody used -- it is the last step of a real cutover. If anything is going
-- to be found broken by this lane, it will be here, and the symptom will be an attach or
-- detach failing with 42501 somewhere that was never moved. The remedy is to move that caller
-- to the door, never to re-grant.
--
-- `iam.access_requests` is the ordinary case: its one writer goes through
-- `createAdminClient()` (`service_role`), which no line below touches.
--
-- Both already carry their RESTRICTIVE `*_client_insert_refused` / `_update_` / `_delete_`
-- policies, applied to the main database on 2026-09-21. This file closes the declared SURFACE.
--
-- 🚨 DO NOT ALSO DROP `platform_admin_all`: it is FOR ALL, so it is the SELECT policy too.
-- SELECT is not touched below. `service_role` is not touched. The SECURITY DEFINER doors are
-- owned by `postgres` and are unaffected by a client grant.
--
-- To run it:
--   node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
--     migrations/campaign/chairstep_doorsonly2_revoke_client_writes_batch3.sql \
--     --source campaign --lane DOORS-ONLY-2 --target production --confirm-chair-step
-- Inverse: migrations/inverse/chairstep_doorsonly2_revoke_client_writes_batch3.inverse.sql

set local lock_timeout = '2s';

revoke insert, update, delete on iam."access_requests" from authenticated, anon;
revoke insert, update, delete on platform."associations" from authenticated, anon;
