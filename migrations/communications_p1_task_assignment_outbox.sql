-- P1: a task assignment is a saved transition, never a second browser request.
-- This migration is applied by the database release lane. The task write and its
-- email intent commit together; the dispatcher owns delivery and retries.
set local lock_timeout = '30s';
set local statement_timeout = '120s';

insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels,
   config, enabled, visibility)
values
  ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   'task.assigned', 'Task assigned', 'A task was assigned to you.',
   '{"email": true}'::jsonb,
   '{"mandatory": false, "digestible": true, "sms_locked": true,
     "assignment_outbox_active": false,
     "target_kind": "task", "routing_mode": "declared_audience",
     "sensitivity_ceiling": "internal", "max_attempts": 5,
     "retry_base_seconds": 60,
     "templates": {
       "email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of your task notification settings. Manage notifications: {{link.preferences}}"}
     }}'::jsonb,
   true, 'internal'::platform.visibility)
on conflict (event_key) do nothing;

-- The global outbox dedupe index alone is not authority: an authenticated
-- client can insert its own notification row. Reserve this event's predictable
-- keys for the server-side task trigger and dispatcher, including updates to
-- an already-created row. A client cannot squat on the next task version.
create or replace function communication._guard_task_assignment_notice_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and new.dedupe_key like 'task.assigned:%') or
    (tg_op = 'UPDATE' and (
      old.dedupe_key like 'task.assigned:%' or
      new.dedupe_key like 'task.assigned:%'
    ))
  ) then
    raise exception 'task assignment notification keys are server-owned'
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

revoke all on function communication._guard_task_assignment_notice_key()
  from public, anon, authenticated;
drop trigger if exists guard_task_assignment_notice_key on communication.notification;
create trigger guard_task_assignment_notice_key
  before insert or update on communication.notification
  for each row execute function communication._guard_task_assignment_notice_key();

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

  -- The event is email-only while the legacy in-app DM still owns actionable
  -- task chips. No SMS permission is inferred from assigning a task.
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

revoke all on function communication._task_assignment_outbox() from public, anon, authenticated;

drop trigger if exists task_assignment_outbox on workspace.tasks;
create trigger task_assignment_outbox
  after insert or update on workspace.tasks
  for each row execute function communication._task_assignment_outbox();

comment on function communication._task_assignment_outbox() is
  'P1: writes one deduplicated email notification intent only for a saved assignment transition, in the task transaction. Legacy in-app DM remains actionable; no SMS is emitted.';
