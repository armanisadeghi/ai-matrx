-- cvx_list_scoped_revoke_anon_execute.sql
--
-- Least-privilege follow-up for cvx_list_scoped_canonical_favorites.sql.
-- CREATE OR REPLACE preserves explicit role grants, so revoking only PUBLIC
-- did not remove the legacy direct grant to anon. The function rejects callers
-- without auth.uid(), but anonymous callers should not be able to invoke this
-- SECURITY DEFINER RPC at all. Idempotent.

revoke execute on function public.cvx_list_scoped(
  text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer
) from public, anon;

grant execute on function public.cvx_list_scoped(
  text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer
) to authenticated;
