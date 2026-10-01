-- INVERSE of migrations/campaign/switchsteptwo_d7_udt_structured_lists_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_structured_lists back to workbench exactly as it was —
-- schema, client grants, its 7 outbound foreign keys (added NOT VALID, then validated: SHARE ROW EXCLUSIVE on both
-- sides while adding, SHARE UPDATE EXCLUSIVE while validating), its share registry row, its entity type.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

alter table graveyard.udt_structured_lists set schema workbench;
grant select, insert, update, delete on table workbench.udt_structured_lists to authenticated;
alter table workbench.udt_structured_lists
  add constraint udt_structured_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_structured_lists_created_by_fkey_p FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_structured_lists_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) ON DELETE SET NULL not valid,
  add constraint udt_structured_lists_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_structured_lists_updated_by_fkey_p FOREIGN KEY (updated_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_structured_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid,
  add constraint udt_structured_lists_user_id_fkey_p FOREIGN KEY (user_id) REFERENCES iam.users(id) ON DELETE SET NULL not valid;
alter table workbench.udt_structured_lists validate constraint udt_structured_lists_created_by_fkey_p;
alter table workbench.udt_structured_lists validate constraint udt_structured_lists_updated_by_fkey_p;
alter table workbench.udt_structured_lists validate constraint udt_structured_lists_user_id_fkey_p;
update platform.shareable_resource_registry set is_active = true where resource_type = 'structured_list' and table_name = 'udt_structured_lists' and not is_active;
update platform.entity_types set is_active = true where token = 'structured_list' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_structured_lists' and archived_as = 'graveyard.udt_structured_lists';
