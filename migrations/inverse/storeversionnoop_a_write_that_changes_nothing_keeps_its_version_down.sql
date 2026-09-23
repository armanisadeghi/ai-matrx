-- chair-step: THE INVERSE of migrations/campaign/storeversionnoop_a_write_that_changes_nothing_keeps_its_version.sql.
--   It takes the last before-row trigger back off `custom.record` and `platform.saved_view`,
--   which puts the defect back: a Save that changes nothing moves the version and writes no
--   history row (storeversionnoop_green.sql clause 2 fails again). No row of anybody's data is
--   touched. `platform.no_change_keeps_its_version()` STAYS (see below).
--
-- WHY THE FUNCTION STAYS STANDING (amended 2026-09-23, lane INVERSE-GROUND, for the
--   ground-standing check, clause a). Two later lanes bind this same function on SIX more tables
--   and each refuses to run without it: VERSION-HISTORY-FIX
--   (versionhistoryfix_a_a_save_that_changes_nothing_keeps_the_screens_number.sql — web.page,
--   workbench.notes, content_ir.kind_definition, browser.profile, scheduler.sch_task) and
--   HR-LOOP-CLEANUP (hrloopcleanup_c_a_publish_is_a_change_so_workflow_definition_keeps_its_number.sql
--   — workflow.definition). Their inverses leave the function to this lane. Dropping it here
--   would either fail on its dependents or, with CASCADE, strip those six tables' triggers and
--   put two other lanes' defects back. So this file neuters the behaviour on THIS lane's two
--   tables and leaves the object standing; with no trigger on custom.record or
--   platform.saved_view the function is never reached there, and the up's `create or replace`
--   re-states it byte for byte on the way back up.
-- window-class: DROP TRIGGER on the partitioned parent custom.record takes ACCESS EXCLUSIVE on the
--   parent and its 16 partitions and fires the supautils hook; at production 01:00–04:00 Pacific.
-- lock: custom,platform
-- lane: STORE-VERSION-NOOP

drop trigger if exists zzzzz_no_change_keeps_its_version on custom.record;
drop trigger if exists zzzzz_no_change_keeps_its_version on platform.saved_view;
