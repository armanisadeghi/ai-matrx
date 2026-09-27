-- P1: persist an in-app assignment notice in the same transaction as the
-- task's assignee transition. The browser-owned DM remains actionable, but a
-- lost browser POST no longer leaves the in-app inbox empty.
-- Apply after communications_p1_task_assignment_outbox.sql.
-- allows: revoke communication
set local lock_timeout = '2s';
set local statement_timeout = '120s';

update communication.notification_event_type
   set default_channels = jsonb_set(default_channels, '{in_app}', 'true'::jsonb, true),
       config = jsonb_set(config, '{templates,in_app}',
         '{"subject":"{{notice.subject}}","body":"{{notice.body}}"}'::jsonb, true)
 where event_key = 'task.assigned' and deleted_at is null;

create or replace function communication._task_assignment_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_event_enabled boolean;
  v_subject text;
  v_body text;
  v_link text;
  v_address text;
  v_refusal text;
  v_status text;
begin
  if new.assignee_id is null or new.deleted_at is not null
     or (tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id) then
    return new;
  end if;

  select t.enabled and coalesce(o.enabled, true)
         and coalesce((t.config ->> 'assignment_outbox_active')::boolean, false)
    into v_event_enabled
    from communication.notification_event_type t
    left join communication.notification_event_override o
      on o.event_key = t.event_key
     and o.organization_id = new.organization_id and o.deleted_at is null
   where t.event_key = 'task.assigned' and t.deleted_at is null;
  if coalesce(v_event_enabled, false) is not true then
    return new;
  end if;

  -- A title is private task content. A recipient who cannot read the saved
  -- task must not receive it through another channel.
  if coalesce(iam.has_access_for(new.assignee_id, 'task', new.id,
                                 'viewer'::public.permission_level), false) is not true then
    return new;
  end if;
  if new.assignee_id = v_actor then
    return new;
  end if;

  select nullif(btrim(p.display_name), '') into v_actor_name
    from users.profiles p where p.id = v_actor and p.deleted_at is null;
  v_subject := 'Task assigned: ' || left(new.title, 180);
  v_body := coalesce(v_actor_name, 'AI Matrx') || ' assigned you a task: ' || left(new.title, 180);
  v_link := '/tasks?task=' || new.id::text;

  -- The notice is committed with the assignment. If the browser request never
  -- reaches the legacy actionable DM route, the assignee still has a durable,
  -- deduplicated in-app inbox item and a link to the saved task.
  if 'in_app' = any (
    hr._notify_channels('task.assigned', new.organization_id, new.assignee_id, null)
  ) then
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       created_by, dedupe_key, subject, body, payload,
       target_kind, target_id, deep_link, visibility)
    values
      (new.organization_id, 'task.assigned', 'in_app', new.assignee_id, 'user',
       new.assignee_id, format('task.assigned:%s:%s:in_app', new.id, new.version),
       v_subject, v_body,
       jsonb_build_object('task_id', new.id, 'actor_user_id', v_actor,
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       'task', new.id, v_link, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  -- Email remains separately preference- and address-gated. An in-app notice
  -- does not silently authorize a text or an email.
  if not ('email' = any (
    hr._notify_channels('task.assigned', new.organization_id, new.assignee_id, null)
  )) or exists (
    select 1 from users.user_email_preferences p
     where p.user_id = new.assignee_id and p.task_notifications is false
  ) then
    return new;
  end if;

  select a.address, a.refusal into v_address, v_refusal
    from communication.resolve_channel_address(
      'email', new.organization_id, 'user', new.assignee_id,
      null, null, null
    ) a limit 1;
  v_status := case when v_address is null then 'skipped' else 'render_pending' end;

  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind, created_by,
     to_address, status, error_code, error_message, dedupe_key,
     subject, body, payload, target_kind, target_id, deep_link, visibility)
  values
    (new.organization_id, 'task.assigned', 'email', new.assignee_id, 'user', new.assignee_id,
     v_address, v_status,
     case when v_status = 'skipped' then coalesce(v_refusal, 'no_contact_point') end,
     case when v_status = 'skipped' then 'No verified email address for this task assignee.' end,
     format('task.assigned:%s:%s:email', new.id, new.version),
     null, null,
     jsonb_build_object('task_id', new.id, 'actor_user_id', v_actor,
                        'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
     'task', new.id, v_link, 'personal'::platform.visibility)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$function$;


revoke all on function communication._task_assignment_outbox()
  from public, anon, authenticated;

comment on function communication._task_assignment_outbox() is
  'P1: one deduplicated in-app notice and optional email intent per saved assignee transition, committed with the task. The actionable DM remains browser-owned.';
