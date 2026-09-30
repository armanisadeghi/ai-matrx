-- Activate only after the durable task_assignment_dm dispatcher and compatible
-- browser route are available. The release owner controls this cutover.
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $activate$
begin
  if not exists (
    select 1 from communication.notification_event_type
     where event_key = 'task.assigned' and deleted_at is null
       and config ->> 'assignment_outbox_active' = 'true'
       and config ->> 'assignment_dm_replay_key_active' = 'true'
       and default_channels ->> 'in_app' = 'true'
  ) then
    raise exception 'The assignment outbox, in-app preference, and DM replay guard must be active first';
  end if;
end;
$activate$;

update communication.notification_event_type
   set config = config || jsonb_build_object(
     'assignment_dm_outbox_active', true,
     'assignment_dm_outbox_activated_at', now()
   )
 where event_key = 'task.assigned' and deleted_at is null;
