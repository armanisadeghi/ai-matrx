-- LANE DATA-V2-BASICS — A NEW COLUMN NEVER TAKES A KEY ANOTHER COLUMN HOLDS.
--
-- THE REAL USE CASE (Arman, his own Coding Accounts, 2026-09-27): the column "Resets" (key `resets`)
-- was renamed "Account Type". He added a new column called "Resets" and was refused *This table
-- already has a field called "Resets"* — no column on his screen is called that. Here the front desk
-- of a dental office keeps "Insurance Plan Accounts" in admin@admin.com's Workspace: the column
-- "Renews" (key `renews`) is renamed "Plan Type", then the owner adds a new "Renews" choice column
-- (same kind as the old one) and a "Renews" text column, retires "Notes" and adds "Notes" again.
--
-- What must hold, from the signed-in person's seat:
--   A. the new "Renews" choice column is a NEW column (its own id, key renews_2), never the old one;
--   B. a "Renews" text column is another new column (renews_3);
--   C. a column added after "Notes" was retired never takes `notes` (the retired values sit under it);
--   D. a key a caller ASKED for, held by another column, is refused naming that column;
--   E. adding a column whose NAME and kind are already there is still that column (idempotent).
--
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics_a_new_column_never_takes_a_key_another_column_holds.sql
-- ITS RED: on the body before the campaign file it fails at A (the old column's id comes back).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics_a_new_column_never_takes_a_key_another_column_holds.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '120s';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics01"}', true);

do $t$
declare
  c_ws     constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  v_table  uuid;
  v_home   uuid;
  v_plan   uuid;
  v_new    uuid;
  v_text   uuid;
  v_notes  uuid;
  v_notes2 uuid;
  v_again  uuid;
  v_key    text;
  v_msg    text;
begin
  if current_user <> 'authenticated' then
    raise exception '0: the suite is not in the signed-in person''s seat (%)', current_user;
  end if;

  -- The table is made the way the "New table" button makes it (records' declareTable).
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Insurance Plan Accounts Home'));
  v_table := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Insurance Plan Accounts', 'slug', 'insurance_plan_accounts_databasics', 'type', 'entity',
    'label_singular', 'Plan account', 'label_plural', 'Plan accounts', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'account', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'account', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'account')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, v_table, jsonb_build_object('key', 'account', 'label', 'Account', 'type', 'text'));
  v_plan := custom.field_declare(c_ws, v_table, jsonb_build_object(
    'label', 'Renews', 'type', 'select', 'options', jsonb_build_array('PPO', 'HMO', 'Indemnity')));
  v_notes := custom.field_declare(c_ws, v_table, jsonb_build_object('label', 'Notes', 'type', 'text'));
  perform custom.field_update(c_ws, v_plan, jsonb_build_object('label', 'Plan Type'));

  -- A. "Renews" again, a choice column like the old one.
  v_new := custom.field_declare(c_ws, v_table, jsonb_build_object(
    'label', 'Renews', 'type', 'select', 'options', jsonb_build_array('Monthly', 'Yearly')));
  if v_new = v_plan then
    raise exception 'A: adding "Renews" answered the OLD column (now "Plan Type") — the new column never appears';
  end if;
  select f.data ->> 'key' into v_key from custom.applicable_fields(c_ws, v_table, null) f where f.id = v_new;
  if v_key is distinct from 'renews_2' then
    raise exception 'A: the new "Renews" column took key % (want renews_2)', v_key;
  end if;

  -- B. "Renews" as text: another new column, its own key.
  v_text := custom.field_declare(c_ws, v_table, jsonb_build_object('label', 'Renews', 'type', 'text'));
  select f.data ->> 'key' into v_key from custom.applicable_fields(c_ws, v_table, null) f where f.id = v_text;
  if v_text in (v_plan, v_new) or v_key is distinct from 'renews_3' then
    raise exception 'B: a "Renews" text column did not get its own column and key (got %)', v_key;
  end if;

  -- C. retire "Notes", add "Notes" again.
  perform custom.field_retire(c_ws, v_notes);
  v_notes2 := custom.field_declare(c_ws, v_table, jsonb_build_object('label', 'Notes', 'type', 'text'));
  select f.data ->> 'key' into v_key from custom.applicable_fields(c_ws, v_table, null) f where f.id = v_notes2;
  if v_notes2 = v_notes or v_key = 'notes' then
    raise exception 'C: the new "Notes" took the retired column''s key % (its old values would show)', v_key;
  end if;

  -- D. a key asked for by name, held by "Plan Type".
  begin
    perform custom.field_declare(c_ws, v_table, jsonb_build_object('key', 'renews', 'label', 'Renewal', 'type', 'text'));
    raise exception 'D: a column was given the key renews that "Plan Type" holds';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%The column "Plan Type" already uses the key renews%' then
      raise exception 'D: the refusal does not name the column that holds the key: %', v_msg;
    end if;
  end;

  -- E. the same column said twice is that column.
  v_again := custom.field_declare(c_ws, v_table, jsonb_build_object(
    'label', 'Renews', 'type', 'select', 'options', jsonb_build_array('Monthly', 'Yearly')));
  if v_again is distinct from v_new then
    raise exception 'E: declaring "Renews" (choice) a second time made another column';
  end if;

  raise notice 'GREEN: A B C D E — a new column never takes a key another column holds';
end
$t$;

rollback;
