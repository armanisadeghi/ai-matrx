-- target: branch,production
-- chair-step: it DROPS the objects the up file created, which is what an inverse is for.
--   Nothing it drops existed before that file. It also removes that file's own rows from
--   `platform.client_callable_door`, by the exact function names it declared.
--
-- CHECKLISTS — the inverse of `migrations/campaign/checklists_a_checklist_is_a_template_of_work.sql`.
--
-- WHAT IT DOES NOT RESTORE, AND SAYS SO: records written WHILE the up file was live —
-- checklist templates, checklist runs, the `checklist_step` Table and its step records — are
-- rows of the store, not schema, and an inverse does not delete an organization's rows. They
-- become ordinary records again: a `checklist_step` Table holding assigned, dated work items,
-- and two classes of record (`checklist_template`, `checklist_run`) that nothing reads. That is
-- the honest outcome; deleting somebody's onboarding runs to undo a migration would not be.

set lock_timeout = '5s';

drop trigger if exists zz_ckl_watch on custom.record;
drop trigger if exists zz_ckl_step_guard on custom.record;

drop function if exists custom._checklist_watch();
drop function if exists custom._checklist_step_guard();

drop index if exists custom.checklist_template_trigger_idx;

drop function if exists custom.checklist_step_complete(uuid, uuid, jsonb);
drop function if exists custom.checklist_runs(uuid, uuid, uuid, boolean, integer);
drop function if exists custom.checklist_run(uuid, uuid);
drop function if exists custom.checklist_start(uuid, uuid, uuid, jsonb, timestamptz);
drop function if exists custom._checklist_instantiate(uuid, uuid, uuid, jsonb, timestamptz, text);
drop function if exists custom.checklist_template_shape(uuid, uuid);
drop function if exists custom.checklist_templates(uuid, uuid, integer);
drop function if exists custom.checklist_declare(uuid, jsonb, uuid);
drop function if exists custom.checklist_step_refusal(uuid, uuid);
drop function if exists custom._checklist_refusal_for(uuid, uuid, jsonb);
drop function if exists custom._checklist_finished(uuid, uuid, text);
drop function if exists custom.checklist_steps_table(uuid);
drop function if exists custom.checklist_refusal(jsonb);

delete from platform.client_callable_door d
 where d.schema_name = 'custom'
   and d.function_name in ('checklist_refusal', 'checklist_declare', 'checklist_templates',
                           'checklist_template_shape', 'checklist_start', 'checklist_run',
                           'checklist_runs', 'checklist_step_complete', 'checklist_step_refusal');
