-- lane: SECURITY-SWEEP — the inverse of migrations/campaign/secsweep_iam_org_member_controls_is_never_client_written.sql
-- Re-opens direct client writes on iam.org_member_controls. Run only to prove the pair reverses (rule 27).
drop policy if exists org_member_controls_client_insert_refused on iam.org_member_controls;
drop policy if exists org_member_controls_client_update_refused on iam.org_member_controls;
drop policy if exists org_member_controls_client_delete_refused on iam.org_member_controls;
