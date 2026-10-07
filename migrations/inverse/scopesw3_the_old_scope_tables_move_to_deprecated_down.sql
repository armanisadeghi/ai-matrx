-- INVERSE of migrations/campaign/scopesw3_the_old_scope_tables_move_to_deprecated.sql (lane FINISH-THE-SWITCH): the six old scope tables move back to `context`, with everything that moved with them.
-- chair-step: moves context.scopes, scope_types, context_items, context_item_values, context_value_refs, scope_dataset_instances back from `deprecated`.
alter table deprecated.scopes set schema context;
alter table deprecated.scope_types set schema context;
alter table deprecated.context_items set schema context;
alter table deprecated.context_item_values set schema context;
alter table deprecated.context_value_refs set schema context;
alter table deprecated.scope_dataset_instances set schema context;
set lock_timeout = '2s';
-- the 14 outbound foreign keys the forward file dropped, re-added exactly (same names and ON DELETE actions), NOT VALID then VALIDATE:
alter table context.context_item_values add constraint context_context_item_values_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) not valid;
alter table context.context_item_values add constraint context_item_values_authored_by_fkey FOREIGN KEY (authored_by) REFERENCES iam.users(id) not valid;
alter table context.context_items add constraint context_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table context.context_items add constraint context_items_status_updated_by_fkey FOREIGN KEY (status_updated_by) REFERENCES iam.users(id) not valid;
alter table context.context_items add constraint context_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) not valid;
alter table context.scope_dataset_instances add constraint context_scope_dataset_instances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) not valid;
alter table context.scope_dataset_instances add constraint scope_dataset_instances_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table context.scope_dataset_instances add constraint scope_dataset_instances_template_id_fkey FOREIGN KEY (template_id) REFERENCES workbench.udt_dataset_templates(id) ON DELETE RESTRICT not valid;
alter table context.scope_types add constraint ctx_scope_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) ON DELETE CASCADE not valid;
alter table context.scope_types add constraint scope_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table context.scope_types add constraint scope_types_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) not valid;
alter table context.scopes add constraint ctx_scopes_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table context.scopes add constraint ctx_scopes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) ON DELETE CASCADE not valid;
alter table context.scopes add constraint scopes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) not valid;
alter table context.context_item_values validate constraint context_context_item_values_organization_id_fkey;
alter table context.context_item_values validate constraint context_item_values_authored_by_fkey;
alter table context.context_items validate constraint context_items_created_by_fkey;
alter table context.context_items validate constraint context_items_status_updated_by_fkey;
alter table context.context_items validate constraint context_items_updated_by_fkey;
alter table context.scope_dataset_instances validate constraint context_scope_dataset_instances_organization_id_fkey;
alter table context.scope_dataset_instances validate constraint scope_dataset_instances_created_by_fkey;
alter table context.scope_dataset_instances validate constraint scope_dataset_instances_template_id_fkey;
alter table context.scope_types validate constraint ctx_scope_types_organization_id_fkey;
alter table context.scope_types validate constraint scope_types_created_by_fkey;
alter table context.scope_types validate constraint scope_types_updated_by_fkey;
alter table context.scopes validate constraint ctx_scopes_created_by_fkey;
alter table context.scopes validate constraint ctx_scopes_organization_id_fkey;
alter table context.scopes validate constraint scopes_updated_by_fkey;
