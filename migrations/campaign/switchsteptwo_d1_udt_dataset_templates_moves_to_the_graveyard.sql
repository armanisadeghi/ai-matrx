-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, move 1 of 8 (lock order: a referenced table before the
-- tables that point at it, so no graveyard table ever points into workbench). workbench.udt_dataset_templates leaves the app for the
-- graveyard: archived in place, every row kept, restorable by its inverse. Old gone, never dropped.
-- PRECONDITION (refused otherwise): the final switch is pressed and its undo is retired
-- (switchsteptwo_a, the page's "Retire the undo"), and switchsteptwo_b/c are applied (nothing live still reads this table).
-- Its outbound foreign keys into live schemas were dropped just before, by switchsteptwo_d10 (its own short transaction,
-- so sign-in and organization reads wait only for that one statement). What it does, in one transaction: entity type `udt_dataset_template` set inactive (the DDL sync refuses an active type in the
-- graveyard); its share registry row inactive; SET SCHEMA graveyard; client grants revoked from the graveyard copy.
-- LOCKS (measured on clone-20261001, SWITCH-STEP-TWO): ACCESS EXCLUSIVE on workbench.udt_dataset_templates only, a table nothing reads any more.
-- db:apply's ceiling: lock_timeout 3 s per attempt, 10 jittered retries (scripts/lib/migration-lock-policy.ts).
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_d1_udt_dataset_templates_moves_to_the_graveyard_down.sql

do $pre$
begin
  if exists (select 1 from pg_constraint k where k.conrelid = to_regclass('workbench.udt_dataset_templates') and k.contype = 'f'
               and k.confrelid::regclass::text !~ '^(workbench\.udt_(datasets|dataset_fields|dataset_rows|dataset_row_versions|structured_lists|structured_list_items)|graveyard\.)') then
    raise exception 'refused: workbench.udt_dataset_templates still holds foreign keys into live tables; apply switchsteptwo_d10 first';
  end if;
  if to_regclass('workbench.udt_dataset_templates') is null and to_regclass('graveyard.udt_dataset_templates') is not null then
    raise exception 'nothing to do: workbench.udt_dataset_templates is already in the graveyard';
  end if;
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired. Retire it on the Final switch page first (step two''s first step); the undo needs workbench.udt_dataset_templates.';
  end if;
end
$pre$;

update platform.entity_types set is_active = false, type = 'deprecated', custom_fields_enabled = false where token = 'udt_dataset_template' and is_active;
update platform.shareable_resource_registry set is_active = false where resource_type = 'udt_dataset_template' and table_name = 'udt_dataset_templates' and is_active;
alter table workbench.udt_dataset_templates set schema graveyard;
revoke all on table graveyard.udt_dataset_templates from anon, authenticated;
update platform.deprecated_relations set archived_as = 'graveyard.udt_dataset_templates' where old_ref = 'workbench.udt_dataset_templates' and archived_as is null;
