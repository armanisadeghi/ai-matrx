-- 🚨 FOUR BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- `custom.checklist_start` was ADOPTED by another lane after this inverse was written:
-- `custom._pipeline_on_entry` (pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql) calls
-- it, and that body runs under the LIVE trigger `zzz_pipelines_on_entry` on `custom.record`.
-- Dropping it left the pipelines trigger over a function that was gone, so the next write to
-- the record store exploded before `checklists_red` asked a single question — a broken table,
-- not a defect put back. `custom._checklist_instantiate`, `custom.checklist_refusal` and
-- `custom.checklist_steps_table` stay with it because `checklist_start` calls them.
--   THE DEFECT IS STILL RESTORED, and by the things that actually carry it: the four watch and
-- step-guard triggers come off `custom.record`, the watch and guard bodies go, the template
-- index goes, every other checklist door goes, and the `platform.client_callable_door` rows go
-- — so no client can reach a checklist and nothing watches a record for one. What stays is a
-- door another lane holds a reference to, standing and unreachable.
--
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

-- 🚨 RE-POINTED TO THE LIVE TRIGGERS (lane RED-SUITES-3, 2026-09-21). This file named only the
-- ROW-level trigger `zz_ckl_watch`, and
-- `writeperf2_the_after_triggers_fire_once_per_statement.sql` replaced it with a STATEMENT-level
-- pair (`zz_ckl_watch_s_i` / `_s_u` over `custom._checklist_watch_stmt_insert` / `_stmt_update`,
-- both of which call `custom._checklist_watch_for`). So this inverse dropped a body nothing
-- calls, the watcher kept running, and the block it exists to turn red stayed green for the
-- previous block's reason — which is exactly what `checklists_red` RED 4 was found doing.
-- The triggers come off BEFORE their functions.
drop trigger if exists zz_ckl_watch     on custom.record;
drop trigger if exists zz_ckl_watch_s_i on custom.record;
drop trigger if exists zz_ckl_watch_s_u on custom.record;
drop trigger if exists zz_ckl_step_guard on custom.record;

drop function if exists custom._checklist_watch();
drop function if exists custom._checklist_watch_stmt_insert();
drop function if exists custom._checklist_watch_stmt_update();
drop function if exists custom._checklist_watch_for(text, custom.record, custom.record);
drop function if exists custom._checklist_step_guard();

drop index if exists custom.checklist_template_trigger_idx;

drop function if exists custom.checklist_step_complete(uuid, uuid, jsonb);
drop function if exists custom.checklist_runs(uuid, uuid, uuid, boolean, integer);
drop function if exists custom.checklist_run(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.checklist_start(uuid, uuid, uuid, jsonb, timestamptz);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom._checklist_instantiate(uuid, uuid, uuid, jsonb, timestamptz, text);
drop function if exists custom.checklist_template_shape(uuid, uuid);
drop function if exists custom.checklist_templates(uuid, uuid, integer);
drop function if exists custom.checklist_declare(uuid, jsonb, uuid);
drop function if exists custom.checklist_step_refusal(uuid, uuid);
drop function if exists custom._checklist_refusal_for(uuid, uuid, jsonb);
drop function if exists custom._checklist_finished(uuid, uuid, text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.checklist_steps_table(uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.checklist_refusal(jsonb);

delete from platform.client_callable_door d
 where d.schema_name = 'custom'
   and d.function_name in ('checklist_refusal', 'checklist_declare', 'checklist_templates',
                           'checklist_template_shape', 'checklist_start', 'checklist_run',
                           'checklist_runs', 'checklist_step_complete', 'checklist_step_refusal');
