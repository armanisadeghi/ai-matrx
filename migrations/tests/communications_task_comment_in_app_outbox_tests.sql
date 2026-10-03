-- Run after communications_p1_task_comment_in_app_outbox.sql on the isolated
-- clone, in one outer transaction that is always rolled back. No SMS/voice send.
set local session_replication_role = origin;

do $test$
declare
  v_admin uuid;
  v_org uuid;
  v_task uuid;
  v_note uuid;
  v_comment uuid;
  v_count integer;
begin
  select id into strict v_admin from auth.users where email = 'admin@admin.com';
  select id into strict v_org from iam.organizations
   where name = 'admin''s Workspace' and created_by = v_admin and archived_at is null
   order by created_at limit 1;

  if not ('in_app' = any (
    hr._notify_channels('comment.added', v_org, v_admin, null)
  )) then
    raise exception 'Admin comment in-app channel is off; positive test would be vacuous';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.actor_system', 'communications_clone_fixture', true);
  insert into workspace.tasks (organization_id, title, status, created_by)
  values (v_org, 'Review the monthly report', 'inbox', v_admin)
  returning id into v_task;

  -- System-origin comment keeps the admin account the only test recipient;
  -- no second human identity or phone is used in this clone-only fixture.
  insert into platform.comments (organization_id, entity_type, entity_id, body)
  values (v_org, 'task', v_task, 'The figures need one more pass.')
  returning id into v_comment;

  select count(*) into v_count from communication.notification
   where dedupe_key = format('comment.added:%s:in_app', v_comment)
     and channel = 'in_app' and recipient_user_id = v_admin
     and organization_id = v_org and target_kind = 'task' and target_id = v_task
     and deep_link = '/tasks?task=' || v_task::text
     and payload ->> 'comment_id' = v_comment::text;
  if v_count <> 1 then
    raise exception 'One saved comment must create one exact owner notice; got %', v_count;
  end if;

  if 'email' = any (hr._notify_channels('comment.added', v_org, v_admin, null))
     and not exists (select 1 from users.user_email_preferences p
                      where p.user_id = v_admin and p.comment_notifications is false) then
    select count(*) into v_count from communication.notification
     where dedupe_key = format('comment.added:%s:email', v_comment)
       and channel = 'email' and recipient_user_id = v_admin
       and organization_id = v_org and target_id = v_task
       and payload -> 'comment' ->> 'text' = 'The figures need one more pass.';
    if v_count <> 1 then
      raise exception 'One saved comment must create one exact email intent; got %', v_count;
    end if;
  end if;

  update platform.comments set body = 'Edited figures.' where id = v_comment;
  select count(*) into v_count from communication.notification
   where target_id = v_task and event_key = 'comment.added' and channel = 'in_app';
  if v_count <> 1 then
    raise exception 'Editing a comment created % notices', v_count;
  end if;
  select count(*) into v_count from communication.notification
   where dedupe_key = format('comment.added:%s:email', v_comment);
  if v_count > 1 then
    raise exception 'Editing a comment duplicated its email intent';
  end if;

  insert into communication.notification_preference
    (user_id, organization_id, event_key, channel, enabled, created_by)
  values (v_admin, v_org, 'comment.added', 'in_app', false, v_admin)
  on conflict (user_id, organization_id, event_key, channel)
    do update set enabled = false, deleted_at = null;
  insert into platform.comments (organization_id, entity_type, entity_id, body)
  values (v_org, 'task', v_task, 'This must stay out of the inbox.');
  select count(*) into v_count from communication.notification
   where target_id = v_task and event_key = 'comment.added' and channel = 'in_app';
  if v_count <> 1 then
    raise exception 'In-app preference off still produced % notices', v_count;
  end if;

  update communication.notification_preference
     set enabled = true
   where user_id = v_admin and organization_id = v_org
     and event_key = 'comment.added' and channel = 'in_app';
  perform set_config('app.actor_system', '', true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into platform.comments
    (organization_id, entity_type, entity_id, body, created_by)
  values (v_org, 'task', v_task, 'My own update.', v_admin);
  select count(*) into v_count from communication.notification
   where target_id = v_task and event_key = 'comment.added' and channel = 'in_app';
  if v_count <> 1 then
    raise exception 'Self-comment created % notices', v_count;
  end if;

  select count(*) into v_count from communication.notification
   where target_id = v_task and event_key = 'comment.added' and channel = 'sms';
  if v_count <> 0 then
    raise exception 'Task comment created % SMS intents', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.actor_system', 'communications_clone_fixture', true);
  insert into workbench.notes (organization_id, label, created_by)
  values (v_org, 'Quarterly summary', v_admin) returning id into v_note;
  insert into platform.comments (organization_id, entity_type, entity_id, body)
  values (v_org, 'note', v_note, 'Please check the figures.')
  returning id into v_comment;
  select count(*) into v_count from communication.notification
   where dedupe_key = format('comment.added:%s:in_app', v_comment)
     and target_kind = 'note' and target_id = v_note
     and deep_link like '/notes/' || v_note::text || '%';
  if v_count <> 1 then
    raise exception 'Saved note comment did not create an exact owner notice';
  end if;
  select count(*) into v_count from communication.notification
   where dedupe_key = format('comment.added:%s:email', v_comment)
     and target_kind = 'note' and target_id = v_note
     and channel = 'email';
  if v_count <> 1 then
    raise exception 'Saved note comment did not create one email intent';
  end if;
end;
$test$;
