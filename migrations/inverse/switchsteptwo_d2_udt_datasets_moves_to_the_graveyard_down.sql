-- INVERSE of migrations/campaign/switchsteptwo_d2_udt_datasets_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_datasets back to workbench exactly as it was —
-- schema, client grants, its 10 outbound foreign keys (added NOT VALID, then validated: SHARE ROW EXCLUSIVE on both
-- sides while adding, SHARE UPDATE EXCLUSIVE while validating), the realtime publication, its share registry row, its entity type.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

alter table graveyard.udt_datasets set schema workbench;
grant select, insert, update, delete on table workbench.udt_datasets to authenticated;
alter table workbench.udt_datasets
  add constraint udt_datasets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_created_by_fkey_p FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_project_id_fkey FOREIGN KEY (project_id) REFERENCES workspace.projects(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_task_id_fkey FOREIGN KEY (task_id) REFERENCES workspace.tasks(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_updated_by_fkey_p FOREIGN KEY (updated_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_datasets_workbook_id_fkey FOREIGN KEY (workbook_id) REFERENCES workbench.udt_workbooks(id) ON DELETE SET NULL not valid,
  add constraint user_tables_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid,
  add constraint user_tables_user_id_fkey_p FOREIGN KEY (user_id) REFERENCES iam.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table workbench.udt_datasets validate constraint udt_datasets_created_by_fkey_p;
alter table workbench.udt_datasets validate constraint udt_datasets_organization_id_fkey;
alter table workbench.udt_datasets validate constraint udt_datasets_project_id_fkey;
alter table workbench.udt_datasets validate constraint udt_datasets_task_id_fkey;
alter table workbench.udt_datasets validate constraint udt_datasets_updated_by_fkey_p;
alter table workbench.udt_datasets validate constraint udt_datasets_workbook_id_fkey;
alter table workbench.udt_datasets validate constraint user_tables_user_id_fkey;
alter table workbench.udt_datasets validate constraint user_tables_user_id_fkey_p;
alter publication supabase_realtime add table workbench.udt_datasets;
update platform.shareable_resource_registry set is_active = true where resource_type = 'dataset' and table_name = 'udt_datasets' and not is_active;
update platform.entity_types set is_active = true where token = 'dataset' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_datasets' and archived_as = 'graveyard.udt_datasets';
