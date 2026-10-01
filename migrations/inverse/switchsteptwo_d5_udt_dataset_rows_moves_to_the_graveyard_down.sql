-- INVERSE of migrations/campaign/switchsteptwo_d5_udt_dataset_rows_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_dataset_rows back to workbench exactly as it was —
-- schema, client grants, its 7 outbound foreign keys (added NOT VALID, then validated: SHARE ROW EXCLUSIVE on both
-- sides while adding, SHARE UPDATE EXCLUSIVE while validating), the realtime publication, its entity type.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

alter table graveyard.udt_dataset_rows set schema workbench;
grant select, insert, update, delete on table workbench.udt_dataset_rows to authenticated;
alter table workbench.udt_dataset_rows
  add constraint table_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid,
  add constraint table_data_user_id_fkey_p FOREIGN KEY (user_id) REFERENCES iam.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid,
  add constraint udt_dataset_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_dataset_rows_created_by_fkey_p FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_dataset_rows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) not valid,
  add constraint udt_dataset_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_dataset_rows_updated_by_fkey_p FOREIGN KEY (updated_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid;
alter table workbench.udt_dataset_rows validate constraint table_data_user_id_fkey;
alter table workbench.udt_dataset_rows validate constraint table_data_user_id_fkey_p;
alter table workbench.udt_dataset_rows validate constraint udt_dataset_rows_created_by_fkey_p;
alter table workbench.udt_dataset_rows validate constraint udt_dataset_rows_organization_id_fkey;
alter table workbench.udt_dataset_rows validate constraint udt_dataset_rows_updated_by_fkey_p;
alter publication supabase_realtime add table workbench.udt_dataset_rows;
update platform.entity_types set is_active = true where token = 'udt_dataset_rows' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_dataset_rows' and archived_as = 'graveyard.udt_dataset_rows';
