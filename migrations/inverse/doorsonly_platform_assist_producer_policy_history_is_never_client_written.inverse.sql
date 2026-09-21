-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on platform.assist_producer_policy_history, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a AUDIT-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "assist_producer_policy_history_client_insert_refused" on platform.assist_producer_policy_history;
drop policy if exists "assist_producer_policy_history_client_update_refused" on platform.assist_producer_policy_history;
drop policy if exists "assist_producer_policy_history_client_delete_refused" on platform.assist_producer_policy_history;
