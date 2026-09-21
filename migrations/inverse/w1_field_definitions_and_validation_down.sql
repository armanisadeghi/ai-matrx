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
-- BOTH signatures, named rather than assumed. The validator gained its fourth argument
-- (the record type, so FLD-10's per-Rule applicability could be honoured) after the file
-- had been applied once on the branch, and an inverse that names only the current shape
-- leaves the older overload behind as a live function nothing calls. Measured on the
-- branch 2026-09-17: the three-argument form survived the first inverse run. An inverse
-- restores the prior state for EVERY version of its up-file or it is not an inverse.
drop function if exists custom._merge_field_shape_guard();
drop function if exists custom._field_shape_guard();
drop function if exists custom.field_options(uuid, uuid);

-- 🚨 SIX OF W1-FIELD'S BODIES ARE PLATFORM INFRASTRUCTURE NOW, AND THIS INVERSE STOPS
-- DEMOLISHING THEM (lane INVERSE-GUARD, 2026-09-21).
--
-- This file used to drop `custom.validate_values` (both overloads), `custom.applicable_fields`,
-- `custom.table_type_field`, `custom.field_rules`, `custom.merge_field_kernel_id` and
-- `custom.field_kernel_id` as well. TWENTY-FOUR triggers created by LATER files reach those six
-- — `custom_record_field_type_converts_values`, `zzzz_a_undeclared_key_guard`,
-- `zzzz_b_claimed_column`, `custom_record_choice_words`, `custom_record_rule_uses`,
-- `custom_fields_validation` on `crm.party`, the statement-level `io_record_changed_s_*` and
-- `zz_w2a_relation_association_s_*` pairs, `_aa_memo_clear`, and the rest — so as written this
-- inverse left the whole record store calling functions that no longer existed. The first
-- insert into `custom.record` after it would have died on
--     function custom.field_kernel_id() does not exist
-- before the red twin asked a single question. A broken store is not the defect this file
-- exists to restore. `storerel_red` lost a whole session to exactly this class.
--
-- WHAT THE DEFECT ACTUALLY IS: no Field definitions, and nothing validating a write against
-- them. That is restored in full by what this file still does — the three triggers above are
-- detached, `custom.field` and `custom.merge_field` and their INSTEAD OF trigger are gone,
-- `custom._record_field_validation` and the two shape guards are gone, and the DELETE at the
-- bottom takes the ninth kernel row and every Field, Table and option record this lane seeded,
-- so `custom.applicable_fields` answers NOTHING for every table in the organization. The six
-- bodies stay standing with no Fields to find and no trigger to call them, which is precisely
-- the prior state this file claims.

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
