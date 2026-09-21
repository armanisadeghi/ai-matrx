-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_the_unsubscribe_token_has_exactly_one_door.sql
-- Re-opens direct client writes on crm.unsubscribe_token. Rule 27 only.
drop policy if exists unsubscribe_token_client_insert_refused on crm.unsubscribe_token;
drop policy if exists unsubscribe_token_client_update_refused on crm.unsubscribe_token;
drop policy if exists unsubscribe_token_client_delete_refused on crm.unsubscribe_token;
