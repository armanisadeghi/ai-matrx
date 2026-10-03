-- draft: communications owner - watched live database change belongs to the release lane
-- P1: a committed comment creates one notice per eligible channel in the
-- same transaction. Browser replays cannot cause another delivery.
set local lock_timeout = '2s';
set local statement_timeout = '120s';

-- Keep clients from reserving a predictable key before the comment trigger.
create function communication._guard_comment_notice_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and new.dedupe_key like 'comment.added:%') or
    (tg_op = 'UPDATE' and (old.dedupe_key like 'comment.added:%'
                           or new.dedupe_key like 'comment.added:%'))
  ) then
    raise exception 'comment notification keys are server-owned' using errcode = '42501';
  end if;
  return new;
end;
$guard$;

revoke all on function communication._guard_comment_notice_key()
  from public, anon, authenticated;
create trigger guard_comment_notice_key
  before insert or update on communication.notification
  for each row execute function communication._guard_comment_notice_key();

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
  v_resource_kind text;
  v_address text;
  v_refusal text;
  v_status text;
begin
  -- Canvas items have no valid record deep link yet. Do not mail a 404.
  if new.entity_type not in ('task', 'note') or new.deleted_at is not null then
    return new;
  end if;

  if new.entity_type = 'task' then
    select t.created_by, t.title into v_owner, v_title
      from workspace.tasks t where t.id = new.entity_id
       and t.organization_id = new.organization_id and t.deleted_at is null;
    v_resource_kind := 'task';
  else
    select n.created_by, n.label into v_owner, v_title
      from workbench.notes n where n.id = new.entity_id
       and n.organization_id = new.organization_id and n.deleted_at is null;
    v_resource_kind := 'note';
  end if;
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
  if coalesce(v_enabled, false) is not true then
    return new;
  end if;

  -- The title is private task content. Recheck the recipient's current access
  -- before making a second readable copy in the notification inbox.
  if coalesce(iam.has_access_for(v_owner, v_resource_kind, new.entity_id,
                                 'viewer'::public.permission_level), false) is not true then
    return new;
  end if;

  select nullif(btrim(p.display_name), '') into v_author
    from users.profiles p
   where p.id = new.created_by and p.deleted_at is null;
  v_title := coalesce(nullif(v_title, ''), new.entity_type);
  v_subject := 'New comment on ' || new.entity_type || ': ' || left(v_title, 180);
  v_body := coalesce(v_author, 'Someone') || ' commented on your ' || new.entity_type || ': ' || left(v_title, 180);

  if 'in_app' = any (hr._notify_channels('comment.added', new.organization_id, v_owner, null)) then
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     created_by, dedupe_key, subject, body, payload,
     target_kind, target_id, deep_link)
  values
    (new.organization_id, 'comment.added', 'in_app', v_owner, 'user',
     v_owner, format('comment.added:%s:in_app', new.id), v_subject, v_body,
     jsonb_build_object('comment_id', new.id,
                        'actor_user_id', new.created_by,
                        'comment', jsonb_build_object('author', coalesce(v_author, 'Someone'),
                          'resource_type', new.entity_type, 'resource_title', v_title,
                          'text', left(new.body, 200)),
                        'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
     v_resource_kind, new.entity_id,
     case new.entity_type when 'task' then '/tasks?task=' || new.entity_id::text
          else '/notes/' || new.entity_id::text end)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if 'email' = any (hr._notify_channels('comment.added', new.organization_id, v_owner, null))
     and not exists (select 1 from users.user_email_preferences p
                      where p.user_id = v_owner and p.comment_notifications is false) then
    select a.address, a.refusal into v_address, v_refusal
      from communication.resolve_channel_address(
        'email', new.organization_id, 'user', v_owner, null, null, null
      ) a limit 1;
    v_status := case when v_address is null then 'skipped' else 'render_pending' end;
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       created_by, to_address, status, error_code, error_message, dedupe_key,
       payload, target_kind, target_id, deep_link)
    values
      (new.organization_id, 'comment.added', 'email', v_owner, 'user', v_owner,
       v_address, v_status,
       case when v_status = 'skipped' then coalesce(v_refusal, 'no_contact_point') end,
       case when v_status = 'skipped' then 'No verified email address for this comment recipient.' end,
       format('comment.added:%s:email', new.id),
       jsonb_build_object('comment_id', new.id, 'actor_user_id', new.created_by,
         'comment', jsonb_build_object('author', coalesce(v_author, 'Someone'),
           'resource_type', new.entity_type, 'resource_title', v_title,
           'text', left(new.body, 200)),
         'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       v_resource_kind, new.entity_id,
       case new.entity_type when 'task' then '/tasks?task=' || new.entity_id::text
            else '/notes/' || new.entity_id::text end)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function communication._task_comment_in_app_outbox()
  from public, anon, authenticated;

create trigger task_comment_in_app_outbox
  after insert on platform.comments
  for each row execute function communication._task_comment_in_app_outbox();

comment on function communication._task_comment_in_app_outbox() is
  'P1: saved task and note comments create one preference-gated in-app notice and optional email intent in their organization.';
