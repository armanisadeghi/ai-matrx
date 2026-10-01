-- INVERSE of migrations/campaign/switchsteptwo_d8_udt_structured_list_items_moves_to_the_graveyard.sql (lane SWITCH-STEP-TWO): graveyard.udt_structured_list_items back to workbench exactly as it was —
-- schema, client grants, its entity type.
-- Its foreign keys into live tables come back with the d<n>0 inverse, run after this one.
-- Rows were never touched, so nothing is restored row by row.
-- lane: SWITCH-STEP-TWO

-- A table coming OUT of the graveyard is judged as born now (REGISTERED AT BIRTH); this one was born before the
-- provisioner, so it comes back under the same grandfather its registration already carries (unprovisioned_relation).
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select 'unregistered_relation', 'workbench.udt_structured_list_items',
       'Moved back out of the graveyard by the SWITCH-STEP-TWO inverse; an older table born before the provisioner (its unprovisioned_relation grandfather row predates this).',
       'SWITCH-STEP-TWO', current_date + 30
 where not exists (select 1 from platform.provision_spec_grandfather g where g.lane = 'unregistered_relation' and g.object_ref = 'workbench.udt_structured_list_items');
alter table graveyard.udt_structured_list_items set schema workbench;
grant select, insert, update, delete on table workbench.udt_structured_list_items to authenticated;
update platform.entity_types set is_active = true, type = 'detail', custom_fields_enabled = true where token = 'udt_structured_list_items' and not is_active;
update platform.deprecated_relations set archived_as = null where old_ref = 'workbench.udt_structured_list_items' and archived_as = 'graveyard.udt_structured_list_items';
-- Its foreign keys are judged as new on the way back (the provisioner's shape guard, at COMMIT); the ones that never had a
-- covering index keep that legacy, by name, under the same grandfather lane rather than gaining an index here.
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select 'fk_without_index', 'workbench.udt_structured_list_items.' || k.conname,
       'An older table moved back out of the graveyard by the SWITCH-STEP-TWO inverse; this foreign key never had a covering index.',
       'SWITCH-STEP-TWO', current_date + 30
  from pg_constraint k
 where k.conrelid = 'workbench.udt_structured_list_items'::regclass and k.contype = 'f'
   and not exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indislive
                     and (i.indkey::int2[])[0:cardinality(k.conkey) - 1] = k.conkey)
   and not exists (select 1 from platform.provision_spec_grandfather g
                    where g.lane = 'fk_without_index' and g.object_ref = 'workbench.udt_structured_list_items.' || k.conname);
-- The same for a nullable foreign key into a tenant table with no same-organization trigger (the older tables' legacy).
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by)
select 'nullable_tenant_fk', 'workbench.udt_structured_list_items.' || k.conname,
       'An older table moved back out of the graveyard by the SWITCH-STEP-TWO inverse; this nullable foreign key never had a same-organization trigger.',
       'SWITCH-STEP-TWO', current_date + 30
  from pg_constraint k
 where k.conrelid = 'workbench.udt_structured_list_items'::regclass and k.contype = 'f'
   and not exists (select 1 from platform.provision_spec_grandfather g
                    where g.lane = 'nullable_tenant_fk' and g.object_ref = 'workbench.udt_structured_list_items.' || k.conname);
