-- chair-step: DOORS-ONLY-5 inverse -- drops the three restrictive refusal policies on
-- platform.saved_view, putting the client write surface back. Running this makes the base table
-- writable over PostgREST again for every signed-in user, which is exactly what the chair
-- ruling closed -- and on this table it also restores the hole no policy ever covered: a
-- caller holding an id could write a row under a surface key it does not own. Only run it to
-- undo a closure that broke a real path, and say which path.

drop policy if exists "saved_view_client_insert_refused" on platform.saved_view;
drop policy if exists "saved_view_client_update_refused" on platform.saved_view;
drop policy if exists "saved_view_client_delete_refused" on platform.saved_view;
