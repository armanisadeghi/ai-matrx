-- D31: these SECURITY DEFINER RPCs are either retired browser surfaces or
-- server-only helpers.  Keeping authenticated EXECUTE allowed any signed-in
-- user to supply another user's identity while the function ran as owner.

revoke execute on function public.get_user_own_feedback(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_user_organizations(uuid)
  from public, anon, authenticated;
revoke execute on function public.check_prompt_app_drift(uuid)
  from public, anon, authenticated;
revoke execute on function public.is_dm_participant(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.resolve_full_context(uuid, text, uuid, uuid[])
  from public, anon, authenticated;
revoke execute on function public.tool_resolve_for_request(uuid, text, text, text[])
  from public, anon, authenticated;
revoke execute on function public.ensure_folder_chain(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_user_own_feedback(uuid) to service_role;
grant execute on function public.get_user_organizations(uuid) to service_role;
grant execute on function public.check_prompt_app_drift(uuid) to service_role;
grant execute on function public.is_dm_participant(uuid, uuid) to service_role;
grant execute on function public.resolve_full_context(uuid, text, uuid, uuid[]) to service_role;
grant execute on function public.tool_resolve_for_request(uuid, text, text, text[]) to service_role;
grant execute on function public.ensure_folder_chain(uuid, text) to service_role;

do $verification$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.get_user_own_feedback(uuid)',
    'public.get_user_organizations(uuid)',
    'public.check_prompt_app_drift(uuid)',
    'public.is_dm_participant(uuid,uuid)',
    'public.resolve_full_context(uuid,text,uuid,uuid[])',
    'public.tool_resolve_for_request(uuid,text,text,text[])',
    'public.ensure_folder_chain(uuid,text)'
  ]
  loop
    if has_function_privilege('authenticated', v_signature, 'execute')
       or not has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'D31 ACL reduction failed for %', v_signature;
    end if;
  end loop;
end;
$verification$;
