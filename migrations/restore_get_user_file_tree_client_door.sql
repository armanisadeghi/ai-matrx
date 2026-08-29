-- Restore the intentional authenticated Data API door after the database-wide
-- SECURITY DEFINER grant guard correctly revoked this undeclared legacy RPC.

insert into platform.client_callable_door (
  schema_name,
  function_name,
  identity_args,
  declared_by,
  reason
)
select
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  'restore_get_user_file_tree_client_door',
  'Authenticated Files and Vault surfaces enumerate the signed-in user file tree. The function body identity-locks p_user_id to auth.uid(); anon and PUBLIC remain revoked.'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_user_file_tree'
  and p.prosecdef
  and pg_get_function_identity_arguments(p.oid) =
    'p_user_id uuid, p_limit integer, p_offset integer, p_include_folders boolean, p_include_deleted boolean, p_order_by text'
on conflict (schema_name, function_name, identity_args) do update
set declared_by = excluded.declared_by,
    reason = excluded.reason;

do $$
begin
  if not exists (
    select 1
    from platform.client_callable_door
    where schema_name = 'public'
      and function_name = 'get_user_file_tree'
      and identity_args =
        'p_user_id uuid, p_limit integer, p_offset integer, p_include_folders boolean, p_include_deleted boolean, p_order_by text'
  ) then
    raise exception 'get_user_file_tree was not registered as a client-callable door';
  end if;
end
$$;

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
