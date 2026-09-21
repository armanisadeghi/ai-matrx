-- lane: DOORS-ONLY-4
-- chair-step: `select iam.apply_rls(...)` is a spec-driven builder -- the additive allow-list
-- cannot read the DDL it will execute, which is exactly the refusal
-- w1_prov_custom_record_via_the_door.sql records and does not route around. What it executes is
-- the CANONICAL ROUTE and nothing else: the one function every table in this database gets its
-- policies from. Nothing is hand-written here.
--
-- REGENERATION BATCH 7 OF 7 -- 4 table(s) in `platform`/`iam` through the canonical route.
--
-- WHY THIS FILE EXISTS. migrations/campaign/doorsonly4_the_generator_stops_emitting_client_writes.sql
-- changed what `iam._apply_rls_unchecked` EMITS for a schema declared doors-only in
-- `platform.schema_client_exposure.client_writes_doors_only`: no std_insert / std_update /
-- std_delete, and `platform_admin_all`'s predicate emitted FOR SELECT as `platform_admin_select`.
-- A generator change moves nothing on its own -- a live table keeps the policies of the day it
-- was last generated. This runs the generator over the tables, which is the ONLY route that puts
-- the catalog and the generator back in agreement. Hand-written DROP POLICY files would not
-- survive the next `platform.provision`; this is the state that does.
--
-- WHAT CHANGES ON EACH TABLE, MEASURED ON platform.approach IN A ROLLED-BACK TRIAL FIRST:
--   before  platform_admin_all, std_select, std_insert, std_update, std_delete, pub_read, svc_all
--           + its named *_client_*_refused restrictive policies
--   after   platform_admin_select, std_select, pub_read, svc_all
--           + the SAME named restrictive policies, untouched (DD-147: this generator drops only
--             the names in iam.generated_policy_names() and KEEPS everything else)
-- Reads do not move: `platform_admin_select`'s USING is byte-identical to the USING half of the
-- `platform_admin_all` it replaces, and `std_select` is regenerated from the same kernel
-- (platform.provision_selfcheck() reports the entity read kernel fingerprint matching).
--
-- COST, MEASURED: 2.27 s for one table end to end. The expensive part is the DB-wide re-sweep of
-- ~2,000 SECURITY DEFINER functions that every GRANT/REVOKE fires, which is why this is batched
-- 4 to a transaction instead of all fifty-two in one -- a short lock per table rather than one
-- long one on a live database.
--
-- THE READ PROOF IS NOT IN THIS FILE, deliberately: rows visible to admin@admin.com's own seat
-- are counted per table BEFORE the batch and again AFTER it, and compared
-- (scripts/campaign-tests/doorsonly4_platform_admin_reads_do_not_move.sql). A count taken inside
-- the same transaction as the change would prove nothing about the committed state.
--
-- Inverse: migrations/inverse/doorsonly4_regenerate_batch_07.inverse.sql
set lock_timeout = '2s';
set statement_timeout = '600s';

select iam.apply_rls('platform', 'short_links', 'short_link', 'ledger');
select iam.apply_rls('platform', 'source_authority', 'source_authority', 'system');
select iam.apply_rls('platform', 'taxonomy_node', 'taxonomy_node', 'system');
select iam.apply_rls('platform', 'user_entity_state', 'user_entity_state', 'personal');
