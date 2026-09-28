-- chair-step: delete means archive (Arman 2026-09-27) — close client EXECUTE on five erase-only functions whose UI was removed; no function, table or row is dropped
-- Delete means archive (Arman, 2026-09-27): "delete MUST MEAN ARCHIVE regardless
-- of what it's called". These functions exist only to erase rows for good. Their
-- client controls were removed in the same change; the functions stay for the
-- retention engine / GDPR erasure (run as a privileged role), but no signed-in
-- person can call them any more.
--   crm_party_purge            — CRM "Delete permanently" (Trash row + bulk)
--   rag.fn_purge_library_document / fn_purge_library_file — Source trash "Delete forever"
--   agx_purge_versions         — agent version purge (no UI caller)
--   delete_note_version        — deletes an audit-trail row from history.row_versions
--                                 (no deleted_at there; version history is never deleted by a button)

-- Close each door's register row first (db-rules §6d), then revoke.
update platform.client_callable_door
   set signed_in_callers = false,
       anonymous_callers = false,
       anonymous_purpose = null,
       non_client_lane = 'Erase-only (delete means archive, Arman 2026-09-27): no client control remains; '
         || 'the client door is closed so a signed-in person can never destroy rows for good. '
         || 'Kept for the retention engine / GDPR erasure, which runs as service_role.'
 where (schema_name, function_name) in (
         ('public','crm_party_purge'),
         ('rag','fn_purge_library_document'),
         ('rag','fn_purge_library_file'),
         ('public','agx_purge_versions'),
         ('public','delete_note_version'));

revoke execute on function public.crm_party_purge(uuid) from public, anon, authenticated;
revoke execute on function rag.fn_purge_library_document(uuid) from public, anon, authenticated;
revoke execute on function rag.fn_purge_library_file(uuid) from public, anon, authenticated;
revoke execute on function public.agx_purge_versions(uuid, integer) from public, anon, authenticated;
revoke execute on function public.delete_note_version(text) from public, anon, authenticated;

grant execute on function public.crm_party_purge(uuid) to service_role;
grant execute on function rag.fn_purge_library_document(uuid) to service_role;
grant execute on function rag.fn_purge_library_file(uuid) to service_role;
grant execute on function public.agx_purge_versions(uuid, integer) to service_role;
grant execute on function public.delete_note_version(text) to service_role;
