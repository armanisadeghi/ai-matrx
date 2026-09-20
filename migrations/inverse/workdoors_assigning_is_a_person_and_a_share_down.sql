-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_assigning_is_a_person_and_a_share.sql`
-- (§4.13, rule 27). Every object it drops is one this lane created; nothing here existed
-- before 2026-09-20.
--
-- `-- target: branch` like every other inverse in this directory: it DROPs, and rule 9
-- forbids a drop on production in any lane.
--
-- IT DELETES NO ROWS. The person-kernel records `custom.work_person` created, the
-- assignments `custom.work_assign` wrote and the grants it issued are DATA, and dropping a
-- function is not a reason to take somebody's access away.

set lock_timeout = '10s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by like '%workdoors_assigning_is_a_person_and_a_share.sql%';

drop function if exists custom.work_list(uuid, text, boolean, integer, integer);
drop function if exists custom.work_set_state(uuid, uuid, uuid);
drop function if exists custom.work_record_states(uuid, uuid);
drop function if exists custom.work_assign(uuid, uuid, uuid, timestamptz, boolean);
drop function if exists custom.work_person(uuid, uuid, boolean);

do $$
declare v_left integer;
begin
  select count(*) into v_left from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('work_person', 'work_assign', 'work_record_states', 'work_set_state', 'work_list');
  raise notice 'workdoors assignment inverse: % of the 5 functions remain (0 is correct)', v_left;
end $$;
