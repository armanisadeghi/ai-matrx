-- D31: retire unguarded legacy readers/writers.  Conversation display/model
-- RPCs have no browser callers; the generic versioning client now uses the
-- canonical version_* family, which enforces iam.has_access.

revoke execute on function public.get_conversation_for_display(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_conversation_messages_for_display(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_conversation_messages_for_model(uuid)
  from public, anon, authenticated;
grant execute on function public.get_conversation_for_display(uuid) to service_role;
grant execute on function public.get_conversation_messages_for_display(uuid) to service_role;
grant execute on function public.get_conversation_messages_for_model(uuid) to service_role;

revoke execute on function public.get_version_history(text, uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.get_version_snapshot(text, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.get_version_diff(text, uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.promote_version(text, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.restore_version(text, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.purge_old_versions(text, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.get_version_history(text, uuid, integer, integer) to service_role;
grant execute on function public.get_version_snapshot(text, uuid, integer) to service_role;
grant execute on function public.get_version_diff(text, uuid, integer, integer) to service_role;
grant execute on function public.promote_version(text, uuid, integer) to service_role;
grant execute on function public.restore_version(text, uuid, integer) to service_role;
grant execute on function public.purge_old_versions(text, uuid, integer) to service_role;

-- The canonical family has in-body viewer/editor checks; remove its redundant
-- anonymous surface while retaining authenticated browser use.
revoke execute on function public.version_list(text, uuid, integer, integer) from public, anon;
revoke execute on function public.version_snapshot(text, uuid, integer) from public, anon;
revoke execute on function public.version_current(text, uuid) from public, anon;
revoke execute on function public.version_diff(text, uuid, integer, integer) from public, anon;
revoke execute on function public.version_diff_current(text, uuid, integer) from public, anon;
revoke execute on function public.version_restore(text, uuid, integer) from public, anon;
revoke execute on function public.version_prune(text, uuid, integer) from public, anon;

grant execute on function public.version_list(text, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.version_snapshot(text, uuid, integer) to authenticated, service_role;
grant execute on function public.version_current(text, uuid) to authenticated, service_role;
grant execute on function public.version_diff(text, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.version_diff_current(text, uuid, integer) to authenticated, service_role;
grant execute on function public.version_restore(text, uuid, integer) to authenticated, service_role;
grant execute on function public.version_prune(text, uuid, integer) to authenticated, service_role;
