-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on platform.knob_write_door, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a KNOB-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "knob_write_door_client_insert_refused" on platform.knob_write_door;
drop policy if exists "knob_write_door_client_update_refused" on platform.knob_write_door;
drop policy if exists "knob_write_door_client_delete_refused" on platform.knob_write_door;
