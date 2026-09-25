-- Run only after the task-assignment outbox base and activation migrations on
-- an isolated database clone. Uses admin@admin.com alone; rolls fixtures back.
begin;

-- The producer has no carrier channel. Even if a user preference enables SMS,
-- an assignment is not an enrolled text notification program.
do $test$
declare
  v_admin uuid;
  v_org uuid;
  v_task uuid;
  v_self_task uuid;
  v_first_version integer;
  v_second_version integer;
  v_count integer;
begin
  select id into strict v_admin from auth.users where email = 'admin@admin.com';
  select id into strict v_org from iam.organizations
   where is_personal is true and created_by = v_admin and archived_at is null
   order by created_at limit 1;

  update communication.notification_event_type
     set enabled = true,
         config = config || '{"assignment_outbox_active":true}'::jsonb
   where event_key = 'task.assigned';
  update users.user_email_preferences
     set task_notifications = true where user_id = v_admin;

  -- The privileged test connection has no signed-in actor. Only the designated
  -- admin account is a recipient; no SMS or voice transport is invoked.
  perform set_config('request.jwt.claim.sub', '', true);
  insert into workspace.tasks (organization_id, title, status, assignee_id)
  values (v_org, 'P1 assignment rollback proof', 'inbox', v_admin)
  returning id, version into v_task, v_first_version;

  select count(*) into v_count from communication.notification
   where dedupe_key = format('task.assigned:%s:%s:email', v_task, v_first_version)
     and recipient_user_id = v_admin and organization_id = v_org
     and target_kind = 'task' and target_id = v_task
     and status = 'render_pending';
  if v_count <> 1 then
    raise exception 'Expected one transactional email task assignment intent; got %', v_count;
  end if;

  update workspace.tasks set title = 'A revised title' where id = v_task;
  update workspace.tasks set assignee_id = v_admin where id = v_task;
  select count(*) into v_count from communication.notification
   where target_kind = 'task' and target_id = v_task and event_key = 'task.assigned'
     and channel = 'email';
  if v_count <> 1 then
    raise exception 'A title edit or unchanged assignee replay created % intents', v_count;
  end if;

  update workspace.tasks set assignee_id = null where id = v_task;
  update workspace.tasks set assignee_id = v_admin where id = v_task
    returning version into v_second_version;
  if v_second_version <= v_first_version then
    raise exception 'A second assignment did not advance the task version';
  end if;
  select count(*) into v_count from communication.notification
   where target_kind = 'task' and target_id = v_task and event_key = 'task.assigned'
     and channel = 'email';
  if v_count <> 2 then
    raise exception 'A genuine second assignment should create a second intent; got %', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into workspace.tasks (organization_id, title, status, assignee_id)
  values (v_org, 'P1 self-assignment rollback proof', 'inbox', v_admin)
  returning id into v_self_task;
  select count(*) into v_count from communication.notification
   where target_kind = 'task' and target_id = v_self_task and event_key = 'task.assigned';
  if v_count <> 0 then
    raise exception 'Self-assignment created % unwanted notices', v_count;
  end if;

  update communication.notification_event_type
     set enabled = false where event_key = 'task.assigned';
  perform set_config('request.jwt.claim.sub', '', true);
  update workspace.tasks set assignee_id = null where id = v_task;
  update workspace.tasks set assignee_id = v_admin where id = v_task;
  select count(*) into v_count from communication.notification
   where target_kind = 'task' and target_id = v_task and event_key = 'task.assigned'
     and channel = 'email';
  if v_count <> 2 then
    raise exception 'The disabled event still enqueued assignment email';
  end if;

  select count(*) into v_count from communication.notification
   where target_kind = 'task' and target_id = v_task and channel = 'sms';
  if v_count <> 0 then
    raise exception 'A task assignment unexpectedly queued SMS';
  end if;
end;
$test$;

-- A signed-in client cannot reserve the predictable key for a future task
-- version. Match the guard's own error so an unrelated RLS denial cannot pass.
set local role authenticated;
do $guard_test$
begin
  begin
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id,
       recipient_kind, created_by, status, dedupe_key,
       target_kind, target_id, visibility)
    values
      ('39c38960-d30c-4840-b0c1-c9960de95582', 'task.assigned', 'email',
       '39c38960-d30c-4840-b0c1-c9960de95582', 'user',
       '39c38960-d30c-4840-b0c1-c9960de95582', 'render_pending',
       'task.assigned:blocked:1:email', 'task',
       '39c38960-d30c-4840-b0c1-c9960de95582', 'personal');
    raise exception 'Authenticated client reserved a task assignment key';
  exception when insufficient_privilege then
    if sqlerrm not like '%task assignment notification keys are server-owned%' then
      raise exception 'Unexpected privilege denial: %', sqlerrm;
    end if;
  end;
end;
$guard_test$;
reset role;

rollback;
