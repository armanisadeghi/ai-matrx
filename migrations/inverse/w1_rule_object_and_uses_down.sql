-- 🚨 TEN BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- The header below says this file "restores the prior state exactly". It cannot any more, and
-- saying so is the point of this note: nine of this lane's functions were ADOPTED by later lanes
-- and every one of them is reached by a trigger standing on `custom.record` RIGHT NOW
-- (`zzz_pipelines_on_entry`, `custom_record_choice_words`, `zzzz_unique_rule_holds`,
-- `custom_record_field_type_parity_guard`, `custom_record_zz_derived_fields`,
-- `custom_record_rule_topology_guard`, `_aa_memo_clear`):
--   custom.record_values     <- custom.read_record (choiceval_every_door_says_the_word.sql)
--   custom.table_rules       <- custom.pipeline_transition_refusal (pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql)
--   custom.rule_run          <- custom.anon_clear (forms_a_strangers_answer_is_written_by_whoever_opened_the_door.sql)
--   custom.rule_eval         <- custom.parity_field_types (limitsfix_a_checkbox_is_a_real_boolean.sql)
--   custom.rule_truth        <- custom.anon_clear (forms_...)
--   custom.rule_field_label  <- custom.pipeline_declare (pipelines_...)
--   custom.rule_field_key    <- custom._rule_topology_guard (fieldguards_a_refusal_is_a_whole_sentence.sql)
--   custom.rule_node_kinds   <- custom._field_type_parity_guard (fieldguards_...)
--   custom.rule_kernel_id    <- custom._resolve_choice_words (choiceval_a_choice_is_its_own_word.sql)
-- `custom.rule_uses` stays with them because they call it. Dropping any one of them left a guard
-- on the record store over a function that was gone — the whole store, not one lane.
--   THE DEFECT IS STILL RESTORED where it is this lane's to restore: the two `custom.record`
-- triggers come off, the `custom.rule` view and its INSTEAD OF trigger go, this lane's private
-- write and shape-guard bodies go, `custom.computed_provenance` and `custom.rule_version` go, and
-- the seven seed rows are deleted — so `custom.rule` is unreachable and the kernel count goes back
-- to the nine W1-STORE and W1-FIELD landed, exactly as the header below promises.
--
-- target: branch
-- additive: yes
-- guard: custom/system_enabled
--
-- THE INVERSE of `migrations/campaign/w1_rule_object_and_uses.sql` (§4.13, rule 27). It
-- restores the prior state exactly: no `custom.rule`, none of this lane's functions or
-- triggers, and no Rule, Field or Table row of this lane's in `custom.record` — so the
-- kernel count goes back to the NINE `W1-STORE` and `W1-FIELD` landed, and
-- `custom.field`'s row count goes back to seven.
--
-- IT IS `-- target: branch` ON PURPOSE. Tonight is branch-only, and an inverse is a DROP,
-- which rule 9 forbids on production in any lane. When the up-file is applied to production
-- by the attended step, this file is what the chair would run there and it goes through
-- `-- chair-step:` like every other production DROP, never through this header.
--
-- IT IS ORDERED DEPENDENCY-LAST: the triggers on `custom.record`, then the view (whose
-- INSTEAD OF trigger goes with it), then the functions, then the rows. Dropping a function
-- a live trigger still calls would fail, which is the check that this order is right. The
-- rows go LAST because the record rows are what the triggers fire on.

set lock_timeout = '2s';
set statement_timeout = '300s';

drop trigger if exists custom_record_rule_uses on custom.record;
drop trigger if exists custom_record_rule_shape_guard on custom.record;

drop view if exists custom.rule;

drop function if exists custom._record_rule_uses();
drop function if exists custom._rule_definition_write();
drop function if exists custom._rule_shape_guard();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.record_values(uuid, uuid);
drop function if exists custom.computed_provenance(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.table_rules(uuid, uuid, text, text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_run(uuid, uuid, jsonb, jsonb);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_eval(uuid, jsonb, jsonb, jsonb);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_truth(jsonb);
drop function if exists custom.rule_version(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_field_label(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_field_key(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_node_kinds();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_uses();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.rule_kernel_id();

-- The seed, in dependency order: the Rule, then the Fields, then the Table. A Field row
-- cannot be deleted while a Rule points at it only in the sense that the shape guard would
-- refuse a WRITE; a delete is unguarded, so the order here is for readability and for the
-- day REC-18's refusal (W3-MIG) makes it load-bearing.
delete from custom.record
 where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and id in (
     '11111111-0004-4000-8000-000000000101',
     '11111111-0004-4000-8000-000000000014',
     '11111111-0004-4000-8000-000000000013',
     '11111111-0004-4000-8000-000000000012',
     '11111111-0004-4000-8000-000000000011',
     '11111111-0004-4000-8000-000000000010',
     '11111111-0004-4000-8000-000000000001');
