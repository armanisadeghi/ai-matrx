-- chair-step: it drops the two widened run doors and the ladder question they share, which is
--   what an inverse is for. It does NOT put the narrower pair back: the up file's own header
--   explains that they existed for forty minutes inside one session and nothing else called
--   them. `checklists_a_checklist_is_a_template_of_work_down.sql` is the full inverse.
--
-- CHECKLISTS — the inverse of `checklists_a_run_is_seen_by_the_people_in_it.sql`.

set lock_timeout = '5s';

drop function if exists custom.checklist_runs(uuid, uuid, uuid, boolean, integer);
drop function if exists custom.checklist_run(uuid, uuid);
drop function if exists custom._checklist_run_visible(uuid, uuid, jsonb);

delete from platform.client_callable_door d
 where d.schema_name = 'custom' and d.function_name = '_checklist_run_visible';
