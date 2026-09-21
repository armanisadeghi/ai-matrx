-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.mtx_media_heal_queue,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a SERVER QUEUE-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "mtx_media_heal_queue_client_insert_refused" on platform.mtx_media_heal_queue;
drop policy if exists "mtx_media_heal_queue_client_update_refused" on platform.mtx_media_heal_queue;
drop policy if exists "mtx_media_heal_queue_client_delete_refused" on platform.mtx_media_heal_queue;
