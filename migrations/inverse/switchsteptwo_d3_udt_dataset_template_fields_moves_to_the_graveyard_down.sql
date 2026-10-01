-- INVERSE of migrations/campaign/switchsteptwo_d3_udt_dataset_template_fields_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_dataset_template_fields back to workbench exactly as it was —
-- schema, client grants, its 0 outbound foreign keys (added NOT VALID, then validated: SHARE ROW EXCLUSIVE on both
-- sides while adding, SHARE UPDATE EXCLUSIVE while validating), its entity type.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

alter table graveyard.udt_dataset_template_fields set schema workbench;
grant select, insert, update, delete on table workbench.udt_dataset_template_fields to authenticated;
update platform.entity_types set is_active = true where token = 'udt_dataset_template_fields' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_dataset_template_fields' and archived_as = 'graveyard.udt_dataset_template_fields';
