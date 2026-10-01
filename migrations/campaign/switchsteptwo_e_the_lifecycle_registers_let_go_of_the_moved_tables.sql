-- chair-step: lane SWITCH-STEP-TWO-RUN (2026-10-01), step two, after the move — the lifecycle and soft-delete registers let
-- go of the six tables that moved to the graveyard. Found on production after the move: public.__soft_delete_cascade_conformance()
-- → platform.soft_delete_orphan_census() raised 42P01 at 20:52:16Z and 21:16:36Z ("relation workbench.udt_datasets does not
-- exist"), because platform.soft_delete_edge still declared workspace.tasks → workbench.udt_datasets. The same class, in
-- platform.lifecycle_reference_map (9 rows) and platform.lifecycle_entity_plan (6 rows), sends the data-lifecycle sweep
-- and the archive or delete of a task, project or workbook (guard_sql `not exists (select 1 from workbench.udt_datasets …)`)
-- into the same 42P01. The rows deleted are exactly the ones platform.build_lifecycle_reference_map() would no longer
-- build: the six entity types went inactive with the move, and their foreign keys are gone. Registry rows only; no person's
-- data is touched. A census of every text column naming a table in platform/iam/ops/meta/audit/admin/custom found these
-- three live registers. The rest are history (stats, findings, ledgers, probes) or were already handled by the d-files
-- (entity_types, shareable_resource_registry).
-- Locks: row locks in the three registers only.
-- lane: SWITCH-STEP-TWO-RUN
-- INVERSE: migrations/inverse/switchsteptwo_e_the_lifecycle_registers_let_go_of_the_moved_tables_down.sql

-- No precondition on the move: on a database where the tables are still in workbench (the clone) the rows only stop
-- declaring cascades the lifecycle no longer runs there either once the entity types are inactive; the inverse restores them.


delete from platform.soft_delete_edge
 where child_schema = 'workbench'
   and child_table in ('udt_datasets', 'udt_dataset_fields', 'udt_dataset_rows', 'udt_dataset_row_versions',
                       'udt_structured_lists', 'udt_structured_list_items');

delete from platform.lifecycle_reference_map
 where parent_ref in ('workbench.udt_datasets', 'workbench.udt_dataset_fields', 'workbench.udt_dataset_rows',
                      'workbench.udt_dataset_row_versions', 'workbench.udt_structured_lists', 'workbench.udt_structured_list_items')
    or child_ref in ('workbench.udt_datasets', 'workbench.udt_dataset_fields', 'workbench.udt_dataset_rows',
                     'workbench.udt_dataset_row_versions', 'workbench.udt_structured_lists', 'workbench.udt_structured_list_items');

delete from platform.lifecycle_entity_plan
 where entity_ref in ('workbench.udt_datasets', 'workbench.udt_dataset_fields', 'workbench.udt_dataset_rows',
                      'workbench.udt_dataset_row_versions', 'workbench.udt_structured_lists', 'workbench.udt_structured_list_items');
