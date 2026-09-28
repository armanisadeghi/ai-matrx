-- chair-step: delete means archive (Arman 2026-09-27) — close client EXECUTE on public.hard_delete_file; its UI and every client/route caller were removed; no function, table or row is dropped
-- Delete means archive (Arman, 2026-09-27): "delete MUST MEAN ARCHIVE regardless
-- of what it's called". public.hard_delete_file(uuid) is SECURITY DEFINER and
-- erases a files.files row (and its versions) for good. The files Trash
-- "Delete forever" controls, the `hard_delete` flags on DELETE /files/{id},
-- DELETE /folders/{id} and DELETE /files/bulk, and every client caller were
-- removed in the same change. The function stays for the server's retention
-- lifecycle (SyncEngine.hard_delete_and_purge, run on the privileged
-- connection), but no signed-in or anonymous person can call it any more.

-- Close the door's register row first (db-rules §6d), then revoke.
update platform.client_callable_door
   set signed_in_callers = false,
       anonymous_callers = false,
       anonymous_purpose = null,
       non_client_lane = 'Erase-only (delete means archive, Arman 2026-09-27): no client control remains; '
         || 'the client door is closed so a signed-in person can never destroy a file for good. '
         || 'Kept for the server retention lifecycle (SyncEngine.hard_delete_and_purge), which runs as a privileged role.'
 where (schema_name, function_name) = ('public','hard_delete_file');

revoke execute on function public.hard_delete_file(uuid) from public, anon, authenticated;
grant execute on function public.hard_delete_file(uuid) to service_role;
