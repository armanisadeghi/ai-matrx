-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.user_entity_state,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a PER-USER STATE-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "user_entity_state_client_insert_refused" on platform.user_entity_state;
drop policy if exists "user_entity_state_client_update_refused" on platform.user_entity_state;
drop policy if exists "user_entity_state_client_delete_refused" on platform.user_entity_state;
