-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, move 8 of 8, part 0 — workbench.udt_structured_list_items lets go of live tables.
-- ONE statement: its outbound foreign keys into live schemas are dropped (the graveyard boundary guard refuses a retired
-- table that constrains live rows, so they must go before the move). It is its own transaction ON PURPOSE: dropping a
-- foreign key drops its triggers on the table it points at, which takes ACCESS EXCLUSIVE there (auth.users,
-- iam.users, iam.organizations…); alone, that lock lasts one statement, not the move's whole transaction.
-- Rows are never touched. PRECONDITION: the undo is retired.
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_d80_udt_structured_list_items_lets_go_of_live_tables_down.sql

do $pre$
begin
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired.';
  end if;
end
$pre$;

alter table workbench.udt_structured_list_items
  drop constraint if exists udt_structured_list_items_created_by_fkey,
  drop constraint if exists udt_structured_list_items_created_by_fkey_p,
  drop constraint if exists udt_structured_list_items_organization_id_fkey,
  drop constraint if exists udt_structured_list_items_updated_by_fkey,
  drop constraint if exists udt_structured_list_items_updated_by_fkey_p,
  drop constraint if exists udt_structured_list_items_user_id_fkey,
  drop constraint if exists udt_structured_list_items_user_id_fkey_p;
