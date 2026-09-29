-- A task assignment version has one actionable DM, even if the browser retries
-- its notification request. Apply with the nontransactional migration runner:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction. The event marker
-- is written last, so a failed/incomplete migration leaves the route fail-closed.
-- allows: revoke communication
set lock_timeout = '2s';
set statement_timeout = '10min';

create unique index concurrently if not exists dm_task_assignment_client_message_id_uidx
  on communication.dm_messages (client_message_id)
  where client_message_id like 'task.assigned:%:dm';

create or replace function communication._guard_task_assignment_dm_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and new.client_message_id like 'task.assigned:%:dm') or
    (tg_op = 'UPDATE' and (
      old.client_message_id like 'task.assigned:%:dm' or
      new.client_message_id like 'task.assigned:%:dm'
    ))
  ) then
    raise exception 'task assignment DM keys are server-owned' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function communication._guard_task_assignment_dm_key()
  from public, anon, authenticated;
create trigger guard_task_assignment_dm_key
  before insert or update on communication.dm_messages
  for each row execute function communication._guard_task_assignment_dm_key();

do $verify$
begin
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'communication'
      and c.relname = 'dm_task_assignment_client_message_id_uidx'
      and i.indisunique and i.indisvalid and i.indisready
  ) then
    raise exception 'task assignment DM replay index is not ready';
  end if;
end;
$verify$;

update communication.notification_event_type
   set config = config || '{"assignment_dm_replay_key_active":true}'::jsonb
 where event_key = 'task.assigned' and deleted_at is null;
