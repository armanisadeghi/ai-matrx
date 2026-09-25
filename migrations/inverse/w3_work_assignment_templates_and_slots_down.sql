-- 🚨 FIVE BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- Three of this lane's functions were ADOPTED after this inverse was written, and one of them is
-- reached by the LIVE trigger `zzz_pipelines_on_entry` on `custom.record`:
--   custom.work_has_assignment     <- custom.work_assign (checklists_assigning_somebody_their_own_row.sql)
--   custom.work_transition_refusal <- custom.work_record_states (choiceval_a_state_is_a_word_too.sql)
--   custom.work_take_assignment    <- custom.checklist_steps_table (checklists_a_checklist_is_a_template_of_work.sql)
-- `custom.work_states` and `custom.work_assignment_fields` stay with them because they call them.
-- Dropping them left the pipelines trigger over a function that was gone — a broken record store,
-- not W3-WORK's prior state.
--   THE DEFECT IS STILL RESTORED: `zz_w3_work_shape_guard` comes off `custom.record`, the guard
-- body goes, and every slot, template and instantiation verb goes — so nothing can declare or
-- instantiate an assignment template or hold a slot, which is what this lane added.
-- The sweep below now asserts exactly that, and names the five it is keeping rather than counting
-- to zero: a check that cannot be satisfied is a check nobody runs.
--
-- target: branch
--
-- THE INVERSE of `migrations/campaign/w3_work_assignment_templates_and_slots.sql`
-- (§4.13, rule 27). It restores the prior state exactly: schema `custom` holds none of
-- W3-WORK's nineteen functions and `custom.record` carries no `zz_w3_work_shape_guard`
-- trigger.
--
-- IT IS `-- target: branch` ON PURPOSE, for the same reason every other inverse in this
-- directory is: an inverse is a DROP, which rule 9 forbids on production in any lane.
--
-- ORDER MATTERS, callers before callees. The trigger fires `custom._work_shape_guard()`,
-- which calls `custom.work_template_refusal()` and `custom.work_transition_refusal()`; the
-- verbs call the readers. So: the trigger first, then the guard, then the verbs, then the
-- readers, then the declarations.
--
-- THE MIGRATION CREATES NO ROWS, so this inverse deletes none. Tables, Fields, templates and
-- holds are written by CALLERS of these verbs (the proof scripts clean up their own), and
-- deleting a tenant's records because a function was dropped would be the destructive act
-- rule 9 exists to prevent. The sweep below therefore touches functions and one trigger and
-- nothing else, and it PRINTS what it removed rather than reporting a silent success —
-- W1-INDEX's inverse reported success with every object it was written to drop still
-- standing, which is the failure this notice exists to make impossible to repeat.

set lock_timeout = '2s';
set statement_timeout = '600s';

drop trigger if exists zz_w3_work_shape_guard on custom.record;

drop function if exists custom._work_shape_guard();

drop function if exists custom.work_slot_holds(uuid, uuid);
drop function if exists custom.work_slot_release(uuid, uuid);
drop function if exists custom.work_slot_hold(uuid, uuid, text, text, interval);
drop function if exists custom.work_slot_expire(uuid, uuid);
drop function if exists custom.work_slots_declare(uuid, text, text, uuid);
drop function if exists custom.work_slot_index_name(uuid);

drop function if exists custom.work_instantiation_shape(uuid, uuid);
drop function if exists custom.work_template_shape(uuid, uuid);
drop function if exists custom.work_template_instantiate(uuid, uuid, jsonb);
drop function if exists custom.work_template_declare(uuid, text, jsonb);
drop function if exists custom.work_template_refusal(jsonb);
drop function if exists custom.work_relation_kinds();

-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.work_transition_refusal(uuid, uuid, uuid);
drop function if exists custom.work_whose_turn(uuid, uuid, boolean);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.work_take_assignment(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.work_has_assignment(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.work_assignment_fields(uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.work_states();

do $down$
declare
  v_fns integer;
  v_trg integer;
begin
  -- THE SWEEP NAMES WHAT IT DROPPED, not a prefix (lane INVERSE-GUARD, 2026-09-21). Two things
  -- made `proname like 'work\_%'` wrong: five of this lane's functions are LEFT STANDING because
  -- later lanes adopted them (see the note at the top of this file), and `custom.work_assign`
  -- carries the same prefix but belongs to `checklists_assigning_somebody_their_own_row.sql`, so
  -- the old count could never reach zero. A check that cannot be satisfied is a check nobody runs.
  select count(*) into v_fns
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('_work_shape_guard',
                       'work_slot_holds', 'work_slot_release', 'work_slot_hold',
                       'work_slot_expire', 'work_slots_declare', 'work_slot_index_name',
                       'work_instantiation_shape', 'work_template_shape',
                       'work_template_instantiate', 'work_template_declare',
                       'work_template_refusal', 'work_relation_kinds', 'work_whose_turn');
  select count(*) into v_trg
    from pg_trigger t
   where t.tgrelid = 'custom.record'::regclass and t.tgname = 'zz_w3_work_shape_guard';
  if v_fns <> 0 or v_trg <> 0 then
    raise exception 'the W3-WORK inverse did not clear the schema: % of its fourteen droppable function(s) and % trigger(s) are still standing',
                    v_fns, v_trg;
  end if;
  raise notice 'W3-WORK inverse: 0 of the fourteen droppable work_* functions, 0 zz_w3_work_shape_guard triggers on custom.record. Five are LEFT STANDING on purpose - work_has_assignment, work_take_assignment, work_transition_refusal, work_states, work_assignment_fields - because later lanes call them and a live trigger reaches them. No record was deleted - this migration created none.';
end
$down$;
