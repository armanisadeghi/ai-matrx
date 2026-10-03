-- draft: communications owner - watched live database change belongs to the release lane
-- P1: a committed task comment creates its owner's in-app notice in the
-- same transaction. The browser's later email request is not the producer.
-- No carrier channel is introduced by this migration.
set local lock_timeout = '2s';
set local statement_timeout = '120s';

create function communication._task_comment_in_app_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid;
  v_title text;
  v_author text;
  v_enabled boolean;
  v_subject text;
  v_body text;
begin
  if new.entity_type <> 'task' or new.deleted_at is not null then
    return new;
  end if;

  select t.created_by, t.title into v_owner, v_title
    from workspace.tasks t
   where t.id = new.entity_id
     and t.organization_id = new.organization_id
     and t.deleted_at is null;
  if v_owner is null or v_owner = new.created_by then
    return new;
  end if;

  select e.enabled and coalesce(o.enabled, true) into v_enabled
    from communication.notification_event_type e
    left join communication.notification_event_override o
      on o.event_key = e.event_key
     and o.organization_id = new.organization_id
     and o.deleted_at is null
   where e.event_key = 'comment.added' and e.deleted_at is null;
  if coalesce(v_enabled, false) is not true
     or not ('in_app' = any (
       hr._notify_channels('comment.added', new.organization_id, v_owner, null)
     )) then
    return new;
  end if;

  -- The title is private task content. Recheck the recipient's current access
  -- before making a second readable copy in the notification inbox.
  if coalesce(iam.has_access_for(v_owner, 'task', new.entity_id,
                                 'viewer'::public.permission_level), false) is not true then
    return new;
  end if;

  select nullif(btrim(p.display_name), '') into v_author
    from users.profiles p
   where p.id = new.created_by and p.deleted_at is null;
  v_subject := 'New comment on task: ' || left(v_title, 180);
  v_body := coalesce(v_author, 'Someone') || ' commented on your task: ' || left(v_title, 180);

  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     created_by, dedupe_key, subject, body, payload,
     target_kind, target_id, deep_link)
  values
    (new.organization_id, 'comment.added', 'in_app', v_owner, 'user',
     v_owner, format('comment.added:%s:in_app', new.id), v_subject, v_body,
     jsonb_build_object('comment_id', new.id, 'task_id', new.entity_id,
                        'actor_user_id', new.created_by,
                        'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
     'task', new.entity_id, '/tasks?task=' || new.entity_id::text)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$function$;

revoke all on function communication._task_comment_in_app_outbox()
  from public, anon, authenticated;

create trigger task_comment_in_app_outbox
  after insert on platform.comments
  for each row execute function communication._task_comment_in_app_outbox();

comment on function communication._task_comment_in_app_outbox() is
  'P1: a saved task comment creates one owner-visible, preference-gated in-app notice in its organization.';
