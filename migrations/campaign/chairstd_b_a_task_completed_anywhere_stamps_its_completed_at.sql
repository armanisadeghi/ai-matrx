-- additive: yes
-- lane: CHAIR-STANDARD-SOURCES
-- window-class: CREATE TRIGGER on projects.tasks (measured ACCESS EXCLUSIVE footprint); apply 0100-0400 Pacific
-- LOCKS: one CREATE TRIGGER on projects.tasks — db:apply measures its footprint as ACCESS EXCLUSIVE
-- (with the supautils hook's auth/storage/realtime relations), hence window-class; lock_timeout 3s.
-- One new function. No grant, no policy, no column, nothing tightened.
-- NOT YET APPLIED (2026-10-05). After it is live, remove the browser copy in
-- features/tasks/services/taskService.ts (the completed_at lines under "Lifecycle bookkeeping").
--
-- A task's completed_at follows its status for EVERY writer (task screen, Table API REST/MCP, agents,
-- SQL): entering 'completed' stamps now() unless the write sets completed_at itself; leaving
-- 'completed' clears it unless the write sets it itself. Until now only the task screen did this, in
-- the browser (features/tasks/services/taskService.ts), so a task completed through the API had no
-- completed_at. The browser copy is removed in the same change.
-- Inverse: migrations/inverse/chairstd_b_a_task_completed_anywhere_stamps_its_completed_at_down.sql.

set local lock_timeout = '3s';

create or replace function projects._task_completed_at_follows_status()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.status = 'completed' then
    if new.completed_at is null
       and (tg_op = 'INSERT' or old.status is distinct from 'completed' or old.completed_at is null) then
      new.completed_at := now();
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'completed'
        and new.completed_at is not distinct from old.completed_at then
    new.completed_at := null;
  end if;
  return new;
end
$function$;

comment on function projects._task_completed_at_follows_status() is
  'BEFORE INSERT/UPDATE OF status on projects.tasks: entering completed stamps completed_at (unless the write sets it); leaving completed clears it (unless the write sets it). One rule for every writer.';

drop trigger if exists _completed_at_follows_status on projects.tasks;
create trigger _completed_at_follows_status
  before insert or update of status, completed_at on projects.tasks
  for each row execute function projects._task_completed_at_follows_status();

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'projects.tasks'::regclass
                  and tgname = '_completed_at_follows_status' and not tgisinternal) then
    raise exception 'projects.tasks has no _completed_at_follows_status trigger';
  end if;
end $$;
