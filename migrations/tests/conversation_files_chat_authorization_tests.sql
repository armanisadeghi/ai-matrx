-- Forcing regression for the legacy-token collision in conversation_files.
-- Run after 20260829164723_fix_conversation_files_chat_authorization.sql.
begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_conversation uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
  values
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conversation-files-owner@example.invalid', ''),
    (v_outsider, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conversation-files-outsider@example.invalid', '');

  insert into chat.conversation (
    id,
    created_by,
    title,
    status,
    visibility,
    initial_agent_id
  ) values (
    v_conversation,
    v_owner,
    'conversation_files authorization fixture',
    'active',
    'personal',
    'd47378f2-2d91-4dc9-aeef-17c6a2ec2300'::uuid
  );

  if not public.can_view_chat_conversation(v_owner, v_conversation) then
    raise exception 'owner of chat.conversation must pass the attachment gate';
  end if;

  if public.can_view_chat_conversation(v_outsider, v_conversation) then
    raise exception 'unrelated user must not pass the attachment gate';
  end if;

  insert into iam.permissions (
    resource_type,
    resource_id,
    granted_to_user_id,
    permission_level,
    status,
    created_by
  ) values (
    'conversation',
    v_conversation,
    v_outsider,
    'viewer',
    'active',
    v_owner
  );

  if not public.can_view_chat_conversation(v_outsider, v_conversation) then
    raise exception 'explicit conversation viewer must pass the attachment gate';
  end if;
end;
$$;

rollback;
