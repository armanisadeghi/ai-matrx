-- lane: SECURITY-SWEEP — the inverse of migrations/campaign/secsweep_iam_emergency_door_request_is_never_client_written.sql
-- Re-opens direct client writes on iam.emergency_door_request. Run only to prove the pair reverses (rule 27).
drop policy if exists emergency_door_request_client_insert_refused on iam.emergency_door_request;
drop policy if exists emergency_door_request_client_update_refused on iam.emergency_door_request;
drop policy if exists emergency_door_request_client_delete_refused on iam.emergency_door_request;
