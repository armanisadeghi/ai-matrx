-- draft: communications owner - watched live database change belongs to the release lane
-- P1: a committed comment creates one notice per eligible channel in the
-- same transaction. Browser replays cannot cause another delivery.
-- Delivery goes through THE spine (communication.notify_from_sql + p_options), so the
-- email's DM leg comes from the one pairing rule (communication.notification_pair_channels):
-- an email to a platform user never goes without a DM.
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
  v_channels text[];
  v_opted_out jsonb;
  v_payload jsonb;
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

  -- The person's own rungs (hr._notify_channels ends in the pairing rule). Whatever they
  -- turned off, and their legacy "no comment emails" switch, becomes p_options.opted_out:
  -- notify_from_sql applies the pairing rule FIRST, so an opted-out email still brings its DM
  -- and a DM turned off takes its email with it (a named opted_out skip, never silence).
  v_channels := coalesce(hr._notify_channels('comment.added', new.organization_id, v_owner, null),
                         '{}'::text[]);
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_opted_out
    from unnest(array['in_app', 'email', 'dm']) c
   where not (c = any (v_channels))
      or (c = 'email' and exists (select 1 from users.user_email_preferences p
                                   where p.user_id = v_owner and p.comment_notifications is false));

  select a.address into v_address
    from communication.resolve_channel_address(
      'email', new.organization_id, 'user', v_owner, null, null, null
    ) a limit 1;

  v_payload := jsonb_build_object('comment_id', new.id, 'actor_user_id', new.created_by,
    'comment', jsonb_build_object('author', coalesce(v_author, 'Someone'),
      'resource_type', new.entity_type, 'resource_title', v_title,
      'text', left(new.body, 200)),
    'notice', jsonb_build_object('subject', v_subject, 'body', v_body));

  -- One row per channel the event + organization + pairing rule turn on, keyed
  -- comment.added:<comment>:<channel> (the same keys this trigger wrote before), so a
  -- replay queues nothing new.
  perform communication.notify_from_sql(
    new.organization_id, 'comment.added', v_owner, v_address, null, v_payload,
    case new.entity_type when 'task' then '/tasks?task=' || new.entity_id::text
         else '/notes/' || new.entity_id::text end,
    v_resource_kind, new.entity_id,
    format('comment.added:%s', new.id),
    jsonb_build_object('opted_out', v_opted_out));
  return new;
end;
$function$;

revoke all on function communication._task_comment_in_app_outbox()
  from public, anon, authenticated;

create trigger task_comment_in_app_outbox
  after insert on platform.comments
  for each row execute function communication._task_comment_in_app_outbox();

comment on function communication._task_comment_in_app_outbox() is
  'P1: saved task and note comments queue one preference-gated notice per channel through communication.notify_from_sql, so the email always carries its paired DM.';
