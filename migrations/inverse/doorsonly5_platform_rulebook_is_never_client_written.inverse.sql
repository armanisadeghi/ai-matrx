-- chair-step: DOORS-ONLY-5 inverse -- drops the three restrictive refusal policies on
-- platform.rulebook, putting the client write surface back. Running this makes the base table
-- writable over PostgREST again for every signed-in user, which is exactly what the chair
-- ruling closed -- and on this table it also restores two holes no policy ever covered: a
-- browser could overwrite metadata.coherence, the server lane's reading of the Expert's work,
-- and every client writer replaced the whole metadata column from a row it had read, so a
-- sibling feature's key could be lost. Only run it to undo a closure that broke a real path,
-- and say which path.

drop policy if exists "rulebook_client_insert_refused" on platform.rulebook;
drop policy if exists "rulebook_client_update_refused" on platform.rulebook;
drop policy if exists "rulebook_client_delete_refused" on platform.rulebook;
