-- Generated Supabase clients cannot express nullable UUID function arguments reliably.
-- Keep disconnect typed and explicit instead of weakening the client boundary with casts.

drop function if exists communication.disconnect_my_sms_assistant();
create function communication.disconnect_my_sms_assistant()
returns table (
  destination_id uuid,
  masked_phone text,
  program_key text,
  number_active boolean,
  global_assistant_enabled boolean,
  verified_user_phone text,
  sms_enabled boolean,
  user_assistant_enabled boolean,
  preferred_agent_id uuid,
  preferred_agent_version_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  identity_status text,
  consent_status text,
  ready boolean,
  blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select *
  from communication.configure_my_sms_assistant(false, null, null);
end;
$$;

revoke execute on function communication.disconnect_my_sms_assistant()
  from public, anon;
grant execute on function communication.disconnect_my_sms_assistant()
  to authenticated, service_role;

comment on function communication.disconnect_my_sms_assistant() is
  'Authenticated typed operation that disables the caller SMS assistant and clears its agent binding.';
