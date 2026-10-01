-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, move 4 of 8, part 0 — workbench.udt_dataset_fields lets go of live tables.
-- ONE statement: its outbound foreign keys into live schemas are dropped (the graveyard boundary guard refuses a retired
-- table that constrains live rows, so they must go before the move). It is its own transaction ON PURPOSE: dropping a
-- foreign key drops its triggers on the table it points at, which takes ACCESS EXCLUSIVE there (auth.users,
-- iam.users, iam.organizations…); alone, that lock lasts one statement, not the move's whole transaction.
-- Rows are never touched. PRECONDITION: the undo is retired.
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_d40_udt_dataset_fields_lets_go_of_live_tables_down.sql

do $pre$
begin
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired.';
  end if;
end
$pre$;

alter table workbench.udt_dataset_fields
  drop constraint if exists table_fields_user_id_fkey,
  drop constraint if exists table_fields_user_id_fkey_p,
  drop constraint if exists udt_dataset_fields_created_by_fkey,
  drop constraint if exists udt_dataset_fields_created_by_fkey_p,
  drop constraint if exists udt_dataset_fields_organization_id_fkey,
  drop constraint if exists udt_dataset_fields_updated_by_fkey,
  drop constraint if exists udt_dataset_fields_updated_by_fkey_p;
