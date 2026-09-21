-- chair-step: DOORS-ONLY-2 -- withdraw the dead client write GRANTs on the twenty-five
-- `platform` tables this lane closed. A CHAIR STEP, NOT A LANE STEP.
--
-- WHY THIS IS NOT IN A NORMAL MIGRATION. `platform` and `iam` are both in
-- REVOKE_PROTECTED_SCHEMAS (matrx-frontend/scripts/lib/migration-target.ts), so
-- `-- allows: revoke <schema>` may never name them and the runner refuses the file unless the
-- command itself says `--confirm-chair-step`. That protection exists because a REVOKE in these
-- two schemas is the one move in this campaign that can take away a path somebody still walks.
-- A smaller lane hands such a file UP; it does not run it.
--
-- WHAT IS ALREADY TRUE, so the chair is not taking this on trust. Each of these twenty-five
-- tables already carries a RESTRICTIVE `<table>_client_insert_refused` /
-- `_client_update_refused` / `_client_delete_refused` policy, applied to the main database on
-- 2026-09-21 and PROVEN over the wire: from a plain member's seat (test@test.com, asserted to
-- hold no admin.admins row) a clone INSERT reached ZERO of the twenty-five, and from the
-- STRONGEST client seat there is -- a platform admin -- twenty-two were refused 42501 with
-- NINETEEN naming this lane's own policy, three being empty tables with no row to clone, and
-- again ZERO reaching the table. All twenty-five still answer SELECT.
--
-- So the write is already closed. THIS FILE CLOSES THE SURFACE, which is the other half of the
-- ruling: a grant nobody uses is a grant the next policy regeneration makes live again in one
-- statement. Until it runs, the guard counts these as RESIDUAL -- refused, but still declared.
--
-- 🚨 WHAT THE CHAIR MUST NOT DO WHILE RUNNING THIS. Do NOT also drop `platform_admin_all` to
-- clear the remaining RESIDUAL entries. It is a `FOR ALL` policy, which means it is the SELECT
-- policy TOO on twenty-three of these twenty-five tables. Dropping it takes platform admins'
-- READ path away. The honest shape is to REPLACE it with a `FOR SELECT` twin, per table, and
-- that is a separate file nobody has written yet.
--
-- SELECT IS NOT TOUCHED BY ANY LINE BELOW. `service_role` is not touched. The
-- SECURITY DEFINER doors are owned by `postgres` and are not affected by a client grant.
--
-- To run it:
--   node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
--     migrations/campaign/chairstep_doorsonly2_revoke_client_writes.sql \
--     --source campaign --lane DOORS-ONLY-2 --target production --confirm-chair-step
-- Inverse: migrations/inverse/chairstep_doorsonly2_revoke_client_writes.inverse.sql

set local lock_timeout = '2s';

revoke insert, update, delete on platform."_bak_assoc_file_processed_document_20260812" from authenticated, anon;
revoke insert, update, delete on platform."_bak_assoc_type_file_processed_document_20260812" from authenticated, anon;
revoke insert, update, delete on platform."_base_entity" from authenticated, anon;
revoke insert, update, delete on platform."actor_session" from authenticated, anon;
revoke insert, update, delete on platform."association_types" from authenticated, anon;
revoke insert, update, delete on platform."assurance_level" from authenticated, anon;
revoke insert, update, delete on platform."comments" from authenticated, anon;
revoke insert, update, delete on platform."custom_entity_definition" from authenticated, anon;
revoke insert, update, delete on platform."deprecated_relations" from authenticated, anon;
revoke insert, update, delete on platform."domain_classification" from authenticated, anon;
revoke insert, update, delete on platform."edge_payload_kind" from authenticated, anon;
revoke insert, update, delete on platform."entity_relationships" from authenticated, anon;
revoke insert, update, delete on platform."lifecycle_entity_plan" from authenticated, anon;
revoke insert, update, delete on platform."lifecycle_reference_map" from authenticated, anon;
revoke insert, update, delete on platform."mtx_media_heal_queue" from authenticated, anon;
revoke insert, update, delete on platform."mtx_public_url_guard" from authenticated, anon;
revoke insert, update, delete on platform."org_module_config" from authenticated, anon;
revoke insert, update, delete on platform."outsider_consumer" from authenticated, anon;
revoke insert, update, delete on platform."purpose" from authenticated, anon;
revoke insert, update, delete on platform."reachability" from authenticated, anon;
revoke insert, update, delete on platform."reference_categories" from authenticated, anon;
revoke insert, update, delete on platform."reference_declaration" from authenticated, anon;
revoke insert, update, delete on platform."schemas" from authenticated, anon;
revoke insert, update, delete on platform."source_authority" from authenticated, anon;
revoke insert, update, delete on platform."user_entity_state" from authenticated, anon;
