-- lane: SECURITY-SWEEP — the inverse of migrations/campaign/secsweep_platform_retention_policy_is_never_client_written.sql
-- Re-opens direct client writes on platform.retention_policy. Run only to prove the pair reverses (rule 27).
drop policy if exists retention_policy_client_insert_refused on platform.retention_policy;
drop policy if exists retention_policy_client_update_refused on platform.retention_policy;
drop policy if exists retention_policy_client_delete_refused on platform.retention_policy;
