-- Move the scheduler's high-churn change stream off postgres_changes.
-- Durable rows remain protected and fetched through scheduler table RLS;
-- this trigger emits private, per-user wake/update hints over Broadcast.

create or replace function scheduler.broadcast_task_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  owner_id uuid := coalesce(new.user_id, old.user_id);
begin
  perform realtime.broadcast_changes(
    'scheduler:user:' || owner_id::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create or replace function scheduler.broadcast_run_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  owner_id uuid := coalesce(new.user_id, old.user_id);
begin
  perform realtime.broadcast_changes(
    'scheduler:user:' || owner_id::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists sch_task_broadcast_change on scheduler.sch_task;
create trigger sch_task_broadcast_change
after insert or update or delete on scheduler.sch_task
for each row execute function scheduler.broadcast_task_change();

drop trigger if exists sch_run_broadcast_change on scheduler.sch_run;
create trigger sch_run_broadcast_change
after insert or update or delete on scheduler.sch_run
for each row execute function scheduler.broadcast_run_change();

drop policy if exists scheduler_user_broadcast_read on realtime.messages;
create policy scheduler_user_broadcast_read
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and topic = 'scheduler:user:' || (select auth.uid())::text
);

-- Applied only after every scheduler consumer has moved to Broadcast.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'scheduler'
      and tablename = 'sch_task'
  ) then
    alter publication supabase_realtime drop table scheduler.sch_task;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'scheduler'
      and tablename = 'sch_run'
  ) then
    alter publication supabase_realtime drop table scheduler.sch_run;
  end if;
end;
$$;
