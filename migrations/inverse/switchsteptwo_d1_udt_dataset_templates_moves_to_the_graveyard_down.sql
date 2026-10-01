-- INVERSE of migrations/campaign/switchsteptwo_d1_udt_dataset_templates_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_dataset_templates back to workbench exactly as it was —
-- schema, client grants, its 3 outbound foreign keys (added NOT VALID, then validated: SHARE ROW EXCLUSIVE on both
-- sides while adding, SHARE UPDATE EXCLUSIVE while validating), its share registry row, its entity type.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

-- A table coming OUT of the graveyard is judged as born now (REGISTERED AT BIRTH); this one was born before the
-- provisioner, so it comes back under the same grandfather its registration already carries (unprovisioned_relation).
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select 'unregistered_relation', 'workbench.udt_dataset_templates',
       'Moved back out of the graveyard by the SWITCH-STEP-TWO inverse; an older table born before the provisioner (its unprovisioned_relation grandfather row predates this).',
       'SWITCH-STEP-TWO', current_date + 30
 where not exists (select 1 from platform.provision_spec_grandfather g where g.lane = 'unregistered_relation' and g.object_ref = 'workbench.udt_dataset_templates');
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
update platform.entity_types set is_active = true, type = 'entity', custom_fields_enabled = true where token = 'udt_dataset_template' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_dataset_templates' and archived_as = 'graveyard.udt_dataset_templates';
-- Its foreign keys are judged as new on the way back (the provisioner's shape guard, at COMMIT); the ones that never had a
-- covering index keep that legacy, by name, under the same grandfather lane rather than gaining an index here.
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select 'fk_without_index', 'workbench.udt_dataset_templates.' || k.conname,
       'An older table moved back out of the graveyard by the SWITCH-STEP-TWO inverse; this foreign key never had a covering index.',
       'SWITCH-STEP-TWO', current_date + 30
  from pg_constraint k
 where k.conrelid = 'workbench.udt_dataset_templates'::regclass and k.contype = 'f'
   and not exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indislive
                     and (i.indkey::int2[])[0:cardinality(k.conkey) - 1] = k.conkey)
   and not exists (select 1 from platform.provision_spec_grandfather g
                    where g.lane = 'fk_without_index' and g.object_ref = 'workbench.udt_dataset_templates.' || k.conname);
-- The same for a nullable foreign key into a tenant table with no same-organization trigger (the older tables' legacy).
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select 'nullable_tenant_fk', 'workbench.udt_dataset_templates.' || k.conname,
       'An older table moved back out of the graveyard by the SWITCH-STEP-TWO inverse; this nullable foreign key never had a same-organization trigger.',
       'SWITCH-STEP-TWO', current_date + 30
  from pg_constraint k
 where k.conrelid = 'workbench.udt_dataset_templates'::regclass and k.contype = 'f'
   and not exists (select 1 from platform.provision_spec_grandfather g
                    where g.lane = 'nullable_tenant_fk' and g.object_ref = 'workbench.udt_dataset_templates.' || k.conname);
