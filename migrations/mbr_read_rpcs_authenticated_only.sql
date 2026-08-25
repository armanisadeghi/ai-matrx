-- Membership reads are an authenticated browser surface.
--
-- These SECURITY DEFINER functions derive their caller from auth.uid(). An
-- anonymous invocation therefore cannot return meaningful membership data;
-- allowing it to execute turns a missing browser session into a successful
-- empty result and makes organization state appear device-dependent.

revoke execute on function public.mbr_list(text, uuid) from public, anon;
revoke execute on function public.mbr_for_user(text) from public, anon;
revoke execute on function public.mbr_list_with_users(text, uuid) from public, anon;
revoke execute on function public.mbr_count(text, uuid[]) from public, anon;

grant execute on function public.mbr_list(text, uuid) to authenticated, service_role;
grant execute on function public.mbr_for_user(text) to authenticated, service_role;
grant execute on function public.mbr_list_with_users(text, uuid) to authenticated, service_role;
grant execute on function public.mbr_count(text, uuid[]) to authenticated, service_role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.mbr_list(text,uuid)',
    'public.mbr_for_user(text)',
    'public.mbr_list_with_users(text,uuid)',
    'public.mbr_count(text,uuid[])'
  ]
  loop
    -- `anon` inherits PUBLIC privileges, so this proves both paths are closed.
    if has_function_privilege('anon', function_signature, 'execute') then
      raise exception 'anonymous or PUBLIC can execute %', function_signature;
    end if;

    if not has_function_privilege('authenticated', function_signature, 'execute')
      or not has_function_privilege('service_role', function_signature, 'execute') then
      raise exception 'authenticated or service_role cannot execute %', function_signature;
    end if;
  end loop;
end
$$;
