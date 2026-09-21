-- lane: SECURITY-SWEEP — the inverse of migrations/campaign/secsweep_platform_action_request_is_never_client_written.sql
-- Re-opens direct client writes on platform.action_request. Run only to prove the pair reverses (rule 27).
drop policy if exists action_request_client_insert_refused on platform.action_request;
drop policy if exists action_request_client_update_refused on platform.action_request;
drop policy if exists action_request_client_delete_refused on platform.action_request;
