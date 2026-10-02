-- inverse of notifications_inbox_triage.sql
-- chair-step: removes the inbox triage doors and the seen/done/snooze columns; every Done, snooze and seen mark a person made is lost, and the client falls back to the pre-triage doors with Done and Snooze absent.
-- WHAT IT DOES NOT UNDO: nothing structural. The `bucket` key in notification_event_type.config is
-- removed outright — no other writer sets it today, so an organization admin's later edit of it
-- would be lost too.

drop function if exists communication.inbox_notifications(text, integer, timestamptz, boolean, uuid);
drop function if exists communication.my_inbox_summary();
drop function if exists communication.mark_inbox_seen();
drop function if exists communication.set_notifications_state(uuid[], text, timestamptz);
drop function if exists communication.my_inbox_organizations();

delete from platform.client_callable_door
 where schema_name = 'communication'
   and function_name in ('inbox_notifications', 'my_inbox_summary', 'mark_inbox_seen',
                         'set_notifications_state', 'my_inbox_organizations')
   and declared_by = 'notifications_inbox_triage.sql';

update communication.notification_event_type
   set config = config - 'bucket'
 where config ? 'bucket';

drop index if exists communication.notification_inbox_recipient_idx;

alter table communication.notification
  drop column if exists seen_at,
  drop column if exists done_at,
  drop column if exists snoozed_until;

notify pgrst, 'reload schema';
