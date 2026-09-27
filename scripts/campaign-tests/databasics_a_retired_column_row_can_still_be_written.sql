-- LANE DATA-V2-BASICS — A WRITE TO A RETIRED COLUMN'S ROW IS NOT REFUSED AS "UNDECLARED".
--
-- THE REAL USE CASE: Harbor Dental's front desk added "Referral source" to the Hygiene Recall
-- Schedule and removed it five minutes later. The organization's Data tables press then rolled back
-- whole: "the table does not declare a field called referral_source - declare it there first". Here:
-- "Patient Recall List" in admin@admin.com's Workspace, "Referral source" added then removed, then a
-- later write to that retired row (what a press, a carry or a restamp does) — as the store's own
-- definer lane writes it (the owner of custom.record), which is the seat those steps run in.
--   A. the later write to the retired row is taken;
--   B. a LIVE field row whose key the table does not declare is still refused by name.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics_a_retired_column_row_can_still_be_written.sql
-- ITS RED: on the guard before the campaign file it fails at A.

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics_a_retired_column_row_can_still_be_written.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '120s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics05"}', true);

do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_home  uuid;
  v_table uuid;
  v_ref   uuid;
begin
  if current_user <> 'authenticated' then raise exception '0: not in the seat (%)', current_user; end if;
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Patient Recall List Home'));
  v_table := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Patient Recall List', 'slug', 'patient_recall_list_databasics_r', 'type', 'entity',
    'label_singular', 'Recall', 'label_plural', 'Recalls', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient_name', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient_name', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient_name')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, v_table, jsonb_build_object('key', 'patient_name', 'label', 'Patient Name', 'type', 'text'));
  v_ref := custom.field_declare(c_ws, v_table, jsonb_build_object('label', 'Referral source', 'type', 'text'));
  perform custom.field_retire(c_ws, v_ref);
  perform set_config('databasics.ref', v_ref::text, true);
  perform set_config('databasics.table', v_table::text, true);
end
$t$;

reset role;
do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_ref   uuid := current_setting('databasics.ref')::uuid;
  v_table uuid := current_setting('databasics.table')::uuid;
begin
  -- A. a later write to the retired row (a press restamps every field of a copied table).
  begin
    update custom.record set data = data || jsonb_build_object('help', 'How the patient heard of us')
     where organization_id = c_ws and id = v_ref;
  exception when others then
    raise exception 'A: a write to the retired column''s row was refused: %', sqlerrm;
  end;
  -- B. a live field whose key the table does not declare is still refused.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    select c_ws, custom.field_kernel_id(), 'field',
           (data - 'key') || jsonb_build_object('key', 'never_declared', 'label', 'Never declared')
      from custom.record where organization_id = c_ws and id = v_ref;
    raise exception 'B: a live field the table never declared was taken';
  exception when check_violation then
    if sqlerrm not like 'the table does not declare a field called never_declared%' then
      raise exception 'B: refused for another reason: %', sqlerrm;
    end if;
  end;
  raise notice 'GREEN: A B — a retired column''s row can still be written; an undeclared live one cannot';
end
$t$;

rollback;
