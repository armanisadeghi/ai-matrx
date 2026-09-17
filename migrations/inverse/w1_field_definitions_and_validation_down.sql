-- target: branch
-- additive: yes
-- guard: custom/system_enabled
--
-- THE INVERSE of `migrations/campaign/w1_field_definitions_and_validation.sql` (§4.13,
-- rule 27). It restores the prior state exactly: the eight-row kernel, no `custom.field`,
-- no `custom.merge_field`, none of this lane's triggers or functions, and `crm.party`
-- carrying no trigger of ours.
--
-- IT IS `-- target: branch` ON PURPOSE. Tonight is branch-only, and an inverse is a DROP,
-- which rule 9 forbids on production in any lane. When the up-file is applied to production
-- by the attended step, this file is what the chair would run there and it goes through
-- `-- chair-step:` like every other production DROP, never through this header.
--
-- ITS SIBLING is `w1_field_entity_custom_fields_down.sql`, which takes the crm.party half.
--
-- IT IS ORDERED DEPENDENCY-LAST: the triggers, then the views (whose INSTEAD OF trigger
-- goes with them), then the functions, then the rows. Dropping a function a live trigger
-- still calls would fail, which is the check that this order is right.

set lock_timeout = '5s';
set statement_timeout = '300s';

drop trigger if exists custom_record_field_validation on custom.record;
drop trigger if exists custom_record_merge_field_shape_guard on custom.record;
drop trigger if exists custom_record_field_shape_guard on custom.record;

drop view if exists custom.merge_field;
drop view if exists custom.field;                 -- takes custom_field_definition_validation with it

drop function if exists custom._field_definition_write();
drop function if exists custom._record_field_validation();
drop function if exists custom.validate_values(uuid, custom.record[], jsonb);
drop function if exists custom._merge_field_shape_guard();
drop function if exists custom._field_shape_guard();
drop function if exists custom.field_options(uuid, uuid);
drop function if exists custom.applicable_fields(uuid, uuid, text);
drop function if exists custom.table_type_field(uuid, uuid);
drop function if exists custom.field_rules(jsonb);
drop function if exists custom.merge_field_kernel_id();
drop function if exists custom.field_kernel_id();

-- The rows, by the exact ids this lane seeded and by nothing broader: the seven field
-- definitions, the five Table records, the twenty-five option records, and DYN-1's ninth
-- kernel row LAST, so the count goes 9 → 8 as the final act.
delete from custom.record
 where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and id in (
     '11111111-0003-4000-8000-000000000001','11111111-0003-4000-8000-000000000002',
     '11111111-0003-4000-8000-000000000003','11111111-0003-4000-8000-000000000004',
     '11111111-0003-4000-8000-000000000005','11111111-0003-4000-8000-000000000006',
     '11111111-0003-4000-8000-000000000007',
     '11111111-0002-4000-8000-000000000001','11111111-0002-4000-8000-000000000002',
     '11111111-0002-4000-8000-000000000003','11111111-0002-4000-8000-000000000004',
     '11111111-0002-4000-8000-000000000005','11111111-0002-4000-8000-000000000006',
     '11111111-0002-4000-8000-000000000007','11111111-0002-4000-8000-000000000008',
     '11111111-0002-4000-8000-000000000011','11111111-0002-4000-8000-000000000012',
     '11111111-0002-4000-8000-000000000013','11111111-0002-4000-8000-000000000014',
     '11111111-0002-4000-8000-000000000015',
     '11111111-0002-4000-8000-000000000021','11111111-0002-4000-8000-000000000022',
     '11111111-0002-4000-8000-000000000023','11111111-0002-4000-8000-000000000024',
     '11111111-0002-4000-8000-000000000025','11111111-0002-4000-8000-000000000026',
     '11111111-0002-4000-8000-000000000027',
     '11111111-0002-4000-8000-000000000031','11111111-0002-4000-8000-000000000032',
     '11111111-0002-4000-8000-000000000033','11111111-0002-4000-8000-000000000034',
     '11111111-0002-4000-8000-000000000035',
     '11111111-0001-4000-8000-000000000001','11111111-0001-4000-8000-000000000002',
     '11111111-0001-4000-8000-000000000003','11111111-0001-4000-8000-000000000004',
     '11111111-0001-4000-8000-000000000009',
     '11111111-0000-4000-8000-000000000009');
