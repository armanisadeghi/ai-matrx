-- Apply after communications_p1_assignment_dm_replay_key.sql on an isolated
-- clone. All records belong to admin@admin.com and roll back; no DM transport
-- or external recipient is invoked.
begin;

do $cutover$
begin
  if not exists (
    select 1 from communication.notification_event_type
    where event_key = 'task.assigned'
      and config ->> 'assignment_dm_replay_key_active' = 'true'
  ) then
    raise exception 'Assignment DM route could run before the replay guard is active';
  end if;
end;
$cutover$;

do $test$
declare
  v_admin uuid;
  v_org uuid;
  v_conversation uuid;
  v_other_conversation uuid;
  v_count integer;
  v_conflict boolean := false;
begin
  select id into strict v_admin from auth.users where email = 'admin@admin.com';
  select id into strict v_org from iam.organizations
   where created_by = v_admin and archived_at is null
   order by created_at limit 1;

  insert into communication.dm_conversations (organization_id, created_by, type)
  values (v_org, v_admin, 'direct') returning id into v_conversation;
  insert into communication.dm_conversations (organization_id, created_by, type)
  values (v_org, v_admin, 'direct') returning id into v_other_conversation;

  insert into communication.dm_messages
    (conversation_id, organization_id, sender_id, created_by, content,
     client_message_id, action_data)
  values
    (v_conversation, v_org, v_admin, v_admin, 'Review the signed contract',
     'task.assigned:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:4:dm',
     '{"kind":"task_reminder","payload":{"task_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}}'::jsonb);
  begin
    insert into communication.dm_messages
      (conversation_id, organization_id, sender_id, created_by, content,
       client_message_id, action_data)
    values
      (v_other_conversation, v_org, v_admin, v_admin, 'Wrong conversation',
       'task.assigned:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:4:dm',
       '{"kind":"task_reminder","payload":{"task_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}}'::jsonb);
  exception when unique_violation then
    v_conflict := position('dm_task_assignment_client_message_id_uidx' in sqlerrm) > 0;
  end;
  if not v_conflict then
    raise exception 'Assignment DM replay key was not unique across conversations';
  end if;
  select count(*) into v_count from communication.dm_messages
   where client_message_id = 'task.assigned:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:4:dm';
  if v_count <> 1 then
    raise exception 'Assignment DM replay created % rows', v_count;
  end if;
end;
$test$;

set local role authenticated;
do $guard$
begin
  begin
    insert into communication.dm_messages
      (conversation_id, organization_id, sender_id, content, client_message_id)
    values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       '39c38960-d30c-4840-b0c1-c9960de95582',
       '39c38960-d30c-4840-b0c1-c9960de95582',
       'Squat on a future assignment',
       'task.assigned:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:1:dm');
    raise exception 'Authenticated client reserved an assignment DM key';
  exception when insufficient_privilege then
    if sqlerrm not like '%task assignment DM keys are server-owned%' then
      raise exception 'Unexpected privilege denial: %', sqlerrm;
    end if;
  end;
end;
$guard$;
reset role;

rollback;
