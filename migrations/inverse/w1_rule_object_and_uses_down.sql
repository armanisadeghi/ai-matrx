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

set lock_timeout = '5s';
set statement_timeout = '300s';

drop trigger if exists custom_record_rule_uses on custom.record;
drop trigger if exists custom_record_rule_shape_guard on custom.record;

drop view if exists custom.rule;

drop function if exists custom._record_rule_uses();
drop function if exists custom._rule_definition_write();
drop function if exists custom._rule_shape_guard();
drop function if exists custom.record_values(uuid, uuid);
drop function if exists custom.computed_provenance(uuid, uuid);
drop function if exists custom.table_rules(uuid, uuid, text, text);
drop function if exists custom.rule_run(uuid, uuid, jsonb, jsonb);
drop function if exists custom.rule_eval(uuid, jsonb, jsonb, jsonb);
drop function if exists custom.rule_truth(jsonb);
drop function if exists custom.rule_version(uuid, uuid);
drop function if exists custom.rule_field_label(uuid, uuid);
drop function if exists custom.rule_field_key(uuid, uuid);
drop function if exists custom.rule_node_kinds();
drop function if exists custom.rule_uses();
drop function if exists custom.rule_kernel_id();

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
