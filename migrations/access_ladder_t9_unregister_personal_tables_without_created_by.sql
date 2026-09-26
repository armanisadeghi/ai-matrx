-- chair-step: DELETES four platform.shareable_resource_registry rows this lane inserted minutes earlier (T-9b), each with zero grants; nothing else.
-- lane: access-ladder T-9
-- Access ladder T-9d (2026-09-26): take back four share-registry rows T-9b added too early.
-- T-9b registered every personal-variant table whose rows have a uuid id so its owner could share a
-- row directly. Four of them — billing.usage_ledger, extend.extension_auth_codes,
-- rag.retrieval_audit, workflow.extract_sweep_state — still carry only the retired `user_id` owner
-- column, so iam.apply_rls refuses to regenerate them and their live policies have no grant arm.
-- A registry row there would let the Share dialog write a grant that no policy honors (a share that
-- silently delivers nothing), and its owner_column `created_by` does not exist on the table.
-- They come back when each table is brought to created_by through the Entities system.
-- The rows are minutes old and carry no grants (checked: 0 iam.permissions rows on each token).

delete from platform.shareable_resource_registry
 where resource_type in ('billing_usage_ledger', 'extension_auth_code', 'retrieval_audit', 'extract_sweep_state')
   and notes like 'Access ladder T-9 (2026-09-26): registered%'
   and not exists (select 1 from iam.permissions p where p.resource_type = shareable_resource_registry.resource_type);
