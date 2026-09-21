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

-- 🚨 `custom.work_assign` AND `custom.work_person` STAY STANDING (lane INVERSE-GUARD, 2026-09-21). This file used to
-- drop both here. Two lanes outside WORK-DOORS have adopted them and reach them on the live
-- path: `custom._checklist_instantiate` in
-- `checklists_a_checklist_is_a_template_of_work.sql` assigns through `custom.work_assign`,
-- and `custom.io_cell` in `import_a_name_that_points_at_a_record.sql` resolves a person
-- through `custom.work_person`. Both are reached from triggers standing on `custom.record`
-- right now — `zz_ckl_watch` through `custom._checklist_watch` and `zzz_pipelines_on_entry`
-- through `custom._pipeline_on_entry` — so dropping them would not put this lane's defect
-- back: the next write to the record store would die on a function that does not exist,
-- before the red twin asked anything. That is the class
-- `storerel_a_relation_edge_names_its_field_down.sql` lost a session to.
--
-- THE DEFECT IS STILL PUT BACK by what remains: the client-door register rows go above, so no
-- signed-in person can reach any of these verbs, and the three doors that nothing else calls
-- are gone. Two bodies standing for two in-database callers are not the doors this lane
-- opened.

do $$
declare v_left integer;
begin
  select count(*) into v_left from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('work_record_states', 'work_set_state', 'work_list');
  raise notice 'workdoors assignment inverse: % of the 3 dropped functions remain (0 is correct; work_assign and work_person stay standing on purpose - see the note above)', v_left;
end $$;
