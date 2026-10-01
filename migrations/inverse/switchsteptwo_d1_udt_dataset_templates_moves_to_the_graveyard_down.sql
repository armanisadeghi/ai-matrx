-- INVERSE of migrations/campaign/switchsteptwo_d1_udt_dataset_templates_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_dataset_templates back to workbench exactly as it was —
-- schema, client grants, its 3 outbound foreign keys (added NOT VALID, then validated: SHARE ROW EXCLUSIVE on both
-- sides while adding, SHARE UPDATE EXCLUSIVE while validating), its share registry row, its entity type.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

alter table graveyard.udt_dataset_templates set schema workbench;
grant select, insert, update, delete on table workbench.udt_dataset_templates to authenticated;
alter table workbench.udt_dataset_templates
  add constraint udt_dataset_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_dataset_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) ON DELETE CASCADE not valid,
  add constraint udt_dataset_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid;
alter table workbench.udt_dataset_templates validate constraint udt_dataset_templates_created_by_fkey;
alter table workbench.udt_dataset_templates validate constraint udt_dataset_templates_organization_id_fkey;
alter table workbench.udt_dataset_templates validate constraint udt_dataset_templates_updated_by_fkey;
update platform.shareable_resource_registry set is_active = true where resource_type = 'udt_dataset_template' and table_name = 'udt_dataset_templates' and not is_active;
update platform.entity_types set is_active = true where token = 'udt_dataset_template' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_dataset_templates' and archived_as = 'graveyard.udt_dataset_templates';
