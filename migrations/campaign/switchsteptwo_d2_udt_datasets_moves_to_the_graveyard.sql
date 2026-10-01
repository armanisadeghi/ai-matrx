-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, move 2 of 8 (lock order: a referenced table before the
-- tables that point at it, so no graveyard table ever points into workbench). workbench.udt_datasets leaves the app for the
-- graveyard: archived in place, every row kept, restorable by its inverse. Old gone, never dropped.
-- PRECONDITION (refused otherwise): the final switch is pressed and its undo is retired
-- (switchsteptwo_a, the page's "Retire the undo"), and switchsteptwo_b/c are applied (nothing live still reads this table).
-- What it does, in one transaction: entity type `dataset` set inactive (the DDL sync refuses an active type in the
-- graveyard); leaves the realtime publication; its share registry row inactive; its 10 outbound
-- foreign keys into live schemas dropped (the graveyard boundary guard refuses a retired table that constrains live
-- rows); SET SCHEMA graveyard; client grants revoked from the graveyard copy.
-- LOCKS (measured on clone-20261001, SWITCH-STEP-TWO): ACCESS EXCLUSIVE on workbench.udt_datasets and, for the FK drops, ACCESS EXCLUSIVE on auth.users, iam.organizations, iam.users, workbench.udt_workbooks, workspace.projects, workspace.tasks until commit.
-- db:apply's ceiling: lock_timeout 3 s per attempt, 10 jittered retries (scripts/lib/migration-lock-policy.ts).
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_d2_udt_datasets_moves_to_the_graveyard_down.sql

do $pre$
begin
  if to_regclass('workbench.udt_datasets') is null and to_regclass('graveyard.udt_datasets') is not null then
    raise exception 'nothing to do: workbench.udt_datasets is already in the graveyard';
  end if;
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired. Retire it on the Final switch page first (step two''s first step); the undo needs workbench.udt_datasets.';
  end if;
end
$pre$;

update platform.entity_types set is_active = false where token = 'dataset' and is_active;
update platform.shareable_resource_registry set is_active = false where resource_type = 'dataset' and table_name = 'udt_datasets' and is_active;
alter publication supabase_realtime drop table workbench.udt_datasets;
alter table workbench.udt_datasets
  drop constraint udt_datasets_created_by_fkey,
  drop constraint udt_datasets_created_by_fkey_p,
  drop constraint udt_datasets_organization_id_fkey,
  drop constraint udt_datasets_project_id_fkey,
  drop constraint udt_datasets_task_id_fkey,
  drop constraint udt_datasets_updated_by_fkey,
  drop constraint udt_datasets_updated_by_fkey_p,
  drop constraint udt_datasets_workbook_id_fkey,
  drop constraint user_tables_user_id_fkey,
  drop constraint user_tables_user_id_fkey_p;
alter table workbench.udt_datasets set schema graveyard;
revoke all on table graveyard.udt_datasets from anon, authenticated;
update platform.deprecated_relations set archived_as = 'graveyard.udt_datasets' where old_ref = 'workbench.udt_datasets' and archived_as is null;
