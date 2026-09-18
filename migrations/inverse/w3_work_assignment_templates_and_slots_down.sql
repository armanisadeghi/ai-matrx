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

set lock_timeout = '10s';
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

drop function if exists custom.work_transition_refusal(uuid, uuid, uuid);
drop function if exists custom.work_whose_turn(uuid, uuid, boolean);
drop function if exists custom.work_take_assignment(uuid, uuid);
drop function if exists custom.work_has_assignment(uuid, uuid);
drop function if exists custom.work_assignment_fields(uuid);
drop function if exists custom.work_states();

do $down$
declare
  v_fns integer;
  v_trg integer;
begin
  select count(*) into v_fns
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work\_%' or p.proname = '_work_shape_guard');
  select count(*) into v_trg
    from pg_trigger t
   where t.tgrelid = 'custom.record'::regclass and t.tgname = 'zz_w3_work_shape_guard';
  if v_fns <> 0 or v_trg <> 0 then
    raise exception 'the W3-WORK inverse did not clear the schema: % function(s) and % trigger(s) are still standing',
                    v_fns, v_trg;
  end if;
  raise notice 'W3-WORK inverse: 0 work_* functions, 0 zz_w3_work_shape_guard triggers on custom.record. No record was deleted - this migration created none.';
end
$down$;
