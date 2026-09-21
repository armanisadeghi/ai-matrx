-- Boot release repair, part 1 of 6.
--
-- The combined file boot_lane_component_rls_and_event_trigger_execution.sql was
-- refused before it could run: a migration may call iam.apply_rls for one table
-- only, and may not raise lock_timeout above 2000ms. These four components had
-- no composition edge, so their policies still treated created_by as ownership.
-- The edges land first; each following file regenerates one table.

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note) values
  ('analysis_result', 'file', 'file_id', 'composition',
   'Boot release repair: an analysis result inherits the access of its file; created_by is provenance, never ownership.'),
  ('data_store_members', 'data_store', 'data_store_id', 'composition',
   'Boot release repair: membership rows inherit the access of their data store.'),
  ('trigger_event', 'workflow_trigger', 'trigger_id', 'composition',
   'Boot release repair: trigger events inherit the access of their workflow trigger.'),
  ('workflow_work_item', 'workflow_run', 'run_id', 'composition',
   'Boot release repair: work items inherit the access of their workflow run.')
on conflict do nothing;
