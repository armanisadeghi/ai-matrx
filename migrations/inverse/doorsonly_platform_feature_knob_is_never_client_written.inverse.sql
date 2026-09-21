-- chair-step: DOORS-ONLY inverse -- re-opens the client write door on platform.feature_knob, which
-- VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST write
-- surface on a KNOB-semantics table that no client code uses. Only run it to undo a closure
-- that broke a real path, and say which path.

drop policy if exists "feature_knob_client_insert_refused" on platform.feature_knob;
drop policy if exists "feature_knob_client_update_refused" on platform.feature_knob;
drop policy if exists "feature_knob_client_delete_refused" on platform.feature_knob;
