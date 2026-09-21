-- lane: SECURITY-SWEEP — the inverse of migrations/campaign/secsweep_iam_access_audit_is_never_client_written.sql
-- Re-opens direct client writes on iam.access_audit. Run only to prove the pair reverses (rule 27).
drop policy if exists access_audit_client_insert_refused on iam.access_audit;
drop policy if exists access_audit_client_update_refused on iam.access_audit;
drop policy if exists access_audit_client_delete_refused on iam.access_audit;
