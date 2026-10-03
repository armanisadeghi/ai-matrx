-- INVERSE of migrations/campaign/kindsglue_w4_1_relation_and_pick_list_have_their_compiled_component.sql (lane
-- KINDS-GLUE): the two component rows that file seeded are archived (soft-deleted, never removed), so `relation` and
-- `pick_list` again have no live web output component.
-- lane: KINDS-GLUE

update content_ir.kind_component c
   set deleted_at = now(), updated_at = now()
 where c.metadata ->> 'seeded_by' = 'kindsglue_w4_1'
   and c.deleted_at is null
   and c.kind_definition_id in (select kd.id from content_ir.kind_definition kd
                                 where kd.kind in ('relation','pick_list')
                                   and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582');
