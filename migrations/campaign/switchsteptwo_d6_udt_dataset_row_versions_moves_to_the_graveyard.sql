-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, move 6 of 8 (lock order: a referenced table before the
-- tables that point at it, so no graveyard table ever points into workbench). workbench.udt_dataset_row_versions leaves the app for the
-- graveyard: archived in place, every row kept, restorable by its inverse. Old gone, never dropped.
-- PRECONDITION (refused otherwise): the final switch is pressed and its undo is retired
-- (switchsteptwo_a, the page's "Retire the undo"), and switchsteptwo_b/c are applied (nothing live still reads this table).
-- What it does, in one transaction: entity type `udt_dataset_row_versions` set inactive (the DDL sync refuses an active type in the
-- graveyard); its 0 outbound
-- foreign keys into live schemas dropped (the graveyard boundary guard refuses a retired table that constrains live
-- rows); SET SCHEMA graveyard; client grants revoked from the graveyard copy.
-- LOCKS (measured on clone-20261001, SWITCH-STEP-TWO): ACCESS EXCLUSIVE on workbench.udt_dataset_row_versions until commit.
-- db:apply's ceiling: lock_timeout 3 s per attempt, 10 jittered retries (scripts/lib/migration-lock-policy.ts).
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_d6_udt_dataset_row_versions_moves_to_the_graveyard_down.sql

do $pre$
begin
  if to_regclass('workbench.udt_dataset_row_versions') is null and to_regclass('graveyard.udt_dataset_row_versions') is not null then
    raise exception 'nothing to do: workbench.udt_dataset_row_versions is already in the graveyard';
  end if;
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired. Retire it on the Final switch page first (step two''s first step); the undo needs workbench.udt_dataset_row_versions.';
  end if;
end
$pre$;

update platform.entity_types set is_active = false where token = 'udt_dataset_row_versions' and is_active;
alter table workbench.udt_dataset_row_versions set schema graveyard;
revoke all on table graveyard.udt_dataset_row_versions from anon, authenticated;
update platform.deprecated_relations set archived_as = 'graveyard.udt_dataset_row_versions' where old_ref = 'workbench.udt_dataset_row_versions' and archived_as is null;
