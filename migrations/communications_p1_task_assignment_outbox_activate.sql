-- P1 release cutover: apply only AFTER the frontend route that reads this flag
-- is live. The base migration installs an inert trigger, so either the base
-- migration or the frontend can arrive first without a duplicate email.
-- The release owner activates this step after verifying both prerequisites.
set local lock_timeout = '2s';
set local statement_timeout = '120s';

do $activate$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'workspace.tasks'::regclass
       and tgname = 'task_assignment_outbox' and not tgisinternal and tgenabled <> 'D'
  ) then
    raise exception 'task-assignment outbox trigger is not installed';
  end if;
  if not exists (
    select 1 from communication.notification_event_type
     where event_key = 'task.assigned' and deleted_at is null
  ) then
    raise exception 'task.assigned notification event is not registered';
  end if;
  if exists (
    select 1 from communication.notification
     where dedupe_key like 'task.assigned:%'
  ) then
    raise exception 'task assignment notification keys were reserved before activation; audit the rows before enabling delivery';
  end if;
end;
$activate$;

update communication.notification_event_type
   set config = config || jsonb_build_object(
     'assignment_outbox_active', true,
     'assignment_outbox_activated_at', clock_timestamp()
   )
 where event_key = 'task.assigned' and deleted_at is null;
