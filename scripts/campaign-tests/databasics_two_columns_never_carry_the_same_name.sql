-- LANE DATA-V2-BASICS — TWO COLUMNS OF ONE TABLE NEVER CARRY THE SAME NAME (BREAKER-1 F8/F10).
--
-- THE REAL USE CASE: Harbor Dental's front desk keeps "Patient Recall List" in admin@admin.com's
-- Workspace with "Patient Name" and "Notes". Someone renames "Notes" to "Patient Name" (BREAKER-1 F8:
-- it was taken, the header read "Patient Name" twice, and a 500-row paste then blanked a real column
-- because its header matched the wrong one — F10).
--
-- What must hold, from the signed-in person's seat:
--   A. renaming a column onto another column's name is refused: You already have a column called "Patient Name".
--   B. adding a column whose name another column carries is refused the same way (any letter case);
--   C. the same column said again with its own key, name and kind is still that column (idempotent);
--   D. a table that ALREADY carries a repeated name stays editable: a setting change is taken, and a
--      rename of one of the pair to a unique name is taken;
--   E. a rename that only changes letter case is taken.
--
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics_two_columns_never_carry_the_same_name.sql
-- ITS RED: on the bodies before the campaign file it fails at A (the rename is taken).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics_two_columns_never_carry_the_same_name.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '120s';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics02"}', true);

do $t$
declare
  c_ws     constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  v_home   uuid;
  v_table  uuid;
  v_name   uuid;
  v_notes  uuid;
  v_again  uuid;
  v_msg    text;
begin
  if current_user <> 'authenticated' then
    raise exception '0: the suite is not in the signed-in person''s seat (%)', current_user;
  end if;
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Patient Recall List Home'));
  v_table := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Patient Recall List', 'slug', 'patient_recall_list_databasics', 'type', 'entity',
    'label_singular', 'Recall', 'label_plural', 'Recalls', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient_name', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient_name', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient_name')), 'parent_id', v_home::text));
  v_name := custom.field_declare(c_ws, v_table, jsonb_build_object('key', 'patient_name', 'label', 'Patient Name', 'type', 'text'));
  v_notes := custom.field_declare(c_ws, v_table, jsonb_build_object('label', 'Notes', 'type', 'text'));

  -- A. rename onto another column's name.
  begin
    perform custom.field_update(c_ws, v_notes, jsonb_build_object('label', 'Patient Name'));
    raise exception 'A: "Notes" was renamed "Patient Name" beside the real "Patient Name"';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'You already have a column called "Patient Name".' then
      raise exception 'A: the refusal does not say it plainly: %', v_msg;
    end if;
  end;

  -- B. add a column another column is called (another letter case).
  begin
    perform custom.field_declare(c_ws, v_table, jsonb_build_object('label', 'patient name', 'type', 'text'));
    raise exception 'B: a second column called "patient name" was added';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'You already have a column called "patient name".%' then
      raise exception 'B: the refusal does not name it: %', v_msg;
    end if;
  end;

  -- C. the same column said again with its own key, name and kind.
  v_again := custom.field_declare(c_ws, v_table, jsonb_build_object('key', 'patient_name', 'label', 'Patient Name', 'type', 'text'));
  if v_again is distinct from v_name then
    raise exception 'C: declaring the same column again made another one';
  end if;

  -- E. a letter-case-only rename is taken.
  perform custom.field_update(c_ws, v_notes, jsonb_build_object('label', 'notes'));
  perform custom.field_update(c_ws, v_notes, jsonb_build_object('label', 'Notes'));

  raise notice 'PASSED A B C E';
end
$t$;

-- D. A table that already carries a repeated name (made the way it happened before this file: the
--    owner of custom.record writes the second label directly, as the breaker's rename did) stays editable.
reset role;
do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_notes uuid;
begin
  select r.id into v_notes from custom.record r
   where r.organization_id = c_ws and r.table_id = custom.field_kernel_id() and r.data_class = 'field'
     and r.deleted_at is null and r.data ->> 'label' = 'Notes'
     and r.data ->> 'entity_definition_id' = (select t.id::text from custom.record t where t.organization_id = c_ws
          and t.table_id = custom.table_kernel_id() and t.data ->> 'slug' = 'patient_recall_list_databasics' limit 1);
  update custom.record set data = jsonb_set(data, '{label}', '"Patient Name"') where organization_id = c_ws and id = v_notes;
  perform set_config('databasics.notes', v_notes::text, true);
end
$t$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics03"}', true);
do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_notes uuid := current_setting('databasics.notes')::uuid;
begin
  perform custom.field_update(c_ws, v_notes, jsonb_build_object('required', false, 'label', 'Patient Name'));
  perform custom.field_update(c_ws, v_notes, jsonb_build_object('label', 'Recall notes'));
  raise notice 'GREEN: A B C D E — two columns of one table never carry the same name';
end
$t$;

rollback;
