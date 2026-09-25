-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_one_approval_queue.sql` (§4.13, rule 27).
-- Every object it drops is one this lane created; the queue did not exist before 2026-09-20.
--
-- `-- target: branch` like every other inverse here: it DROPs, and rule 9 forbids a drop on
-- production in any lane.
--
-- IT DELETES NO APPROVALS. A `work_approval` row is a record of the store — somebody's
-- decision, with its history — and dropping the doors is not a reason to destroy it. Rows
-- left behind are inert: with the trigger and the verbs gone nothing writes or reads them,
-- and the store's own retention rule (REC-23) is what eventually lets them go.
--
-- ORDER: the trigger before its function, the door rows and grants before the bodies.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by like '%workdoors_one_approval_queue.sql%';

drop trigger if exists zz_workdoors_approval_guard on custom.record;
drop function if exists custom._workdoors_approval_guard();

drop function if exists custom.work_inbox(uuid, integer, integer, boolean);
drop function if exists custom.work_approval_read(uuid, uuid);
drop function if exists custom.work_approval_decide(uuid, uuid, boolean, text);
drop function if exists custom.work_approval_may_decide(uuid, uuid);
drop function if exists custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid);
drop function if exists custom.work_approval_approvers(uuid, uuid, uuid);

do $$
declare v_fn integer; v_tg integer;
begin
  select count(*) into v_fn from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work_approval%' or p.proname in ('work_inbox', '_workdoors_approval_guard'));
  select count(*) into v_tg from pg_trigger t
   where t.tgrelid = 'custom.record'::regclass and t.tgname = 'zz_workdoors_approval_guard';
  raise notice 'workdoors approval inverse: % functions and % triggers remain (0 and 0 is correct)', v_fn, v_tg;
end $$;
