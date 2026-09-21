-- chair-step: DOORS-ONLY-2 batch 2 -- withdraw the dead client write GRANTs on the seventeen
-- tables batch 2 closed (sixteen in `platform`, plus `iam.permissions`).
-- A CHAIR STEP, NOT A LANE STEP.
--
-- WHY THIS IS NOT IN A NORMAL MIGRATION. `platform` and `iam` are both in
-- REVOKE_PROTECTED_SCHEMAS (matrx-frontend/scripts/lib/migration-target.ts), so
-- `-- allows: revoke <schema>` may never name them and the runner refuses the file unless the
-- command itself says `--confirm-chair-step`. A smaller lane hands such a file UP.
--
-- 🚨 `iam.permissions` IS THE GRANT TABLE and is the most consequential line in this file.
-- Every client mention of it in the codebase is a `.select(...)`; `features/files/filesDb.ts`
-- states the rule in its own header -- list, grant and revoke go through
-- `iamDb(supabase).rpc('fn_list_resource_permissions', ...)`, admin-gated inside the RPC by
-- `iam.has_access`, "never a plain `.from('permissions')` select". The base-table write grant
-- was a second path no code walked -- the same shape as CRITICAL-1
-- (`iam.api_keys.service_user_id`, full account takeover from a plain member's seat).
--
-- WHAT IS ALREADY TRUE. Each of these seventeen already carries a RESTRICTIVE
-- `<table>_client_insert_refused` / `_client_update_refused` / `_client_delete_refused` policy,
-- applied to the main database on 2026-09-21 and proven from a seat. This file closes the
-- declared SURFACE, which is the other half of the ruling: a grant nobody uses is a grant the
-- next policy regeneration makes live again in one statement.
--
-- 🚨 DO NOT ALSO DROP `platform_admin_all` while running this. It is a `FOR ALL` policy, so on
-- most of these tables it is the SELECT policy TOO -- dropping it takes platform admins' READ
-- path away. The honest shape is a `FOR SELECT` twin per table, and that file does not exist yet.
--
-- SELECT is not touched by any line below. `service_role` is not touched -- which also covers
-- the `change_type_default` reader that connects with SUPABASE_SECRET_KEY. The SECURITY DEFINER
-- doors are owned by `postgres` and are not affected by a client grant.
--
-- To run it:
--   node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
--     migrations/campaign/chairstep_doorsonly2_revoke_client_writes_batch2.sql \
--     --source campaign --lane DOORS-ONLY-2 --target production --confirm-chair-step
-- Inverse: migrations/inverse/chairstep_doorsonly2_revoke_client_writes_batch2.inverse.sql

set local lock_timeout = '2s';

revoke insert, update, delete on platform."approach" from authenticated, anon;
revoke insert, update, delete on platform."assist_producer_policy" from authenticated, anon;
revoke insert, update, delete on platform."assists" from authenticated, anon;
revoke insert, update, delete on platform."change_type_default" from authenticated, anon;
revoke insert, update, delete on platform."custom_field_definition" from authenticated, anon;
revoke insert, update, delete on platform."custom_field_target" from authenticated, anon;
revoke insert, update, delete on platform."custom_record" from authenticated, anon;
revoke insert, update, delete on platform."entity_types" from authenticated, anon;
revoke insert, update, delete on platform."masterwork_corpus_item" from authenticated, anon;
revoke insert, update, delete on platform."masterwork_source" from authenticated, anon;
revoke insert, update, delete on platform."org_change_policy" from authenticated, anon;
revoke insert, update, delete on platform."outcome_event" from authenticated, anon;
revoke insert, update, delete on platform."output_feedback" from authenticated, anon;
revoke insert, update, delete on platform."repo" from authenticated, anon;
revoke insert, update, delete on platform."shareable_resource_registry" from authenticated, anon;
revoke insert, update, delete on platform."taxonomy_node" from authenticated, anon;
revoke insert, update, delete on iam."permissions" from authenticated, anon;
