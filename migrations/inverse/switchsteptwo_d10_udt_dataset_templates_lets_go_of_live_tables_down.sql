-- INVERSE of migrations/campaign/switchsteptwo_d10_udt_dataset_templates_lets_go_of_live_tables.sql (lane SWITCH-STEP-TWO): the outbound
-- foreign keys come back (NOT VALID, then validated). Run AFTER the move's inverse has brought the table back to workbench.
-- The foreign keys into auth.users are not re-added: the sign-in table guard refuses a new FK into auth.users; each has
-- its iam.users twin (same ids), which this restores.
-- lane: SWITCH-STEP-TWO

alter table workbench.udt_dataset_templates
  add constraint udt_dataset_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid,
  add constraint udt_dataset_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) ON DELETE CASCADE not valid,
  add constraint udt_dataset_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) ON DELETE SET NULL not valid;
alter table workbench.udt_dataset_templates validate constraint udt_dataset_templates_created_by_fkey;
alter table workbench.udt_dataset_templates validate constraint udt_dataset_templates_organization_id_fkey;
alter table workbench.udt_dataset_templates validate constraint udt_dataset_templates_updated_by_fkey;
-- Re-added foreign keys are judged as new (the provisioner's shape guard, at COMMIT); the ones that never had a covering
-- index or a same-organization trigger keep that legacy, by name.
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select l.lane, 'workbench.udt_dataset_templates.' || k.conname,
       'An older table moved back out of the graveyard by the SWITCH-STEP-TWO inverse; a foreign key it always carried.',
       'SWITCH-STEP-TWO', current_date + 30
  from pg_constraint k cross join (values ('fk_without_index'), ('nullable_tenant_fk')) l(lane)
 where k.conrelid = 'workbench.udt_dataset_templates'::regclass and k.contype = 'f'
   and not exists (select 1 from platform.provision_spec_grandfather g where g.lane = l.lane and g.object_ref = 'workbench.udt_dataset_templates.' || k.conname);
