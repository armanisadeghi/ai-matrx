-- Restore the intentional Data API contract for the authenticated file-tree RPC.
--
-- The project revokes default function execution privileges. Replacing this
-- SECURITY DEFINER function therefore must be followed by an explicit grant for
-- its exact overload. Keep anon and PUBLIC revoked: the body identity-locks the
-- requested user to auth.uid(), and only signed-in callers may enumerate files.

revoke execute on function public.get_user_file_tree(
  uuid, integer, integer, boolean, boolean, text
) from public, anon;

grant execute on function public.get_user_file_tree(
  uuid, integer, integer, boolean, boolean, text
) to authenticated, service_role;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute get_user_file_tree';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)',
    'execute'
  ) or has_function_privilege(
    'public',
    'public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)',
    'execute'
  ) then
    raise exception 'anonymous or PUBLIC can execute get_user_file_tree';
  end if;
end
$$;
