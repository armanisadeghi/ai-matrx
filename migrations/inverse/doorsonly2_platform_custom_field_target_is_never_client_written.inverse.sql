-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.custom_field_target,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a SCHEMA DEFINITION-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "custom_field_target_client_insert_refused" on platform.custom_field_target;
drop policy if exists "custom_field_target_client_update_refused" on platform.custom_field_target;
drop policy if exists "custom_field_target_client_delete_refused" on platform.custom_field_target;
