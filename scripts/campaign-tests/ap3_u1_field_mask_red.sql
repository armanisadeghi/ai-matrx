-- AP3-PHASEB-U1 forcing test: the custom-field mask on platform reads (R12 / G8).
-- Reader: test@test.com, member of Holloway Creative, editor (not admin) on a contact admin@admin.com added.
--
-- PART A -- a `restricted` party field (values in the row). The live store refuses `restricted` on a standard
-- table (custom._field_shape_guard LANE7-SEC), so the field is declared `internal` through the product door, its
-- value written through custom.entity_row_write, then raised to `restricted` with triggers off.
--   finding: today's drill ALREADY withholds it (platform._drill_protect drops a protected cf: column the reader's
--   field rule does not admit, and refuses a filter on it with 42501). PART A is the baseline the doors must keep.
--
-- PART B -- the residual hole R12 closes: a field the store's per-field rule (iam.may_touch_field, the rule
-- custom.entity_read_mask applies) withholds from this reader but that is NOT protected-beside-the-row. Made here by
-- raising the platform knob custom/field_sensitivity_levels read.internal to `admin` inside the transaction.
--   the store's own door (custom.entity_record_read) -> value withheld
--   RED (before U1): drill_rows' API branch -> the value in cf:<id>, and a filter on it MATCHES (yes/no oracle)
-- GREEN: ap3_u1_field_mask_green.sql. Everything is rolled back. Run as postgres (Supabase MCP execute_sql).
begin;
create temp table _r(k text, v jsonb) on commit drop;
grant all on _r to authenticated;
create temp table _ids(k text, id uuid) on commit drop;
grant all on _ids to authenticated;
select set_config('app.actor_system', 'ap3_u1_forcing_test', true);
insert into crm.party(id, party_kind, display_name, first_name, last_name, organization_id, created_by, record_class)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01', 'person', 'Marisol Ortega', 'Marisol', 'Ortega',
        '344cfaa8-2b0c-4971-854a-9694614816f2', '87a6e699-3622-4869-8843-d0867456c0dd', 'contact');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _ids select 'restricted', custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party',
  '{"key":"payment_terms_note","label":"Payment terms note","type":"text","sensitivity":"internal"}'::jsonb);
insert into _ids select 'internal', custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party',
  '{"key":"renewal_risk","label":"Renewal risk","type":"text","sensitivity":"internal"}'::jsonb);
select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01', '{}'::jsonb,
  '{"payment_terms_note":"Net 15, CFO sign-off above 40k","renewal_risk":"High: budget frozen until Q3"}'::jsonb, null, null);
reset role;
set local session_replication_role = replica;
update custom.record set data = data || '{"sensitivity":"restricted"}'::jsonb where id = (select id from _ids where k = 'restricted');
set local session_replication_role = origin;
update platform.feature_knob set value = jsonb_set(value, '{read,internal}', '"admin"')
 where feature = 'custom' and key = 'field_sensitivity_levels';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'store_entity_record_read_custom', x -> 'custom'
  from custom.entity_record_read('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01') x;
insert into _r select 'drill_row_custom_columns',
  (select jsonb_object_agg(e.key, e.value) from jsonb_array_elements(
     platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}'::jsonb,
       '{"scope":"all","organization":"344cfaa8-2b0c-4971-854a-9694614816f2"}'::jsonb) -> 'rows') r,
     jsonb_each(r) e
    where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01' and e.key like 'cf:%');
do $$
begin
  insert into _r select 'A_filter_on_restricted', to_jsonb(jsonb_array_length(platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}'::jsonb,
    jsonb_build_object('scope', 'all', 'where', jsonb_build_object('cf:' || (select id from _ids where k = 'restricted'), 'Net 15, CFO sign-off above 40k'))) -> 'rows'));
exception when others then
  insert into _r values ('A_filter_on_restricted', jsonb_build_object('refused', sqlstate, 'message', sqlerrm));
end $$;
insert into _r select 'B_filter_on_withheld_internal_matches', to_jsonb(jsonb_array_length(platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}'::jsonb,
  jsonb_build_object('scope', 'all', 'where', jsonb_build_object('cf:' || (select id from _ids where k = 'internal'), 'High: budget frozen until Q3'))) -> 'rows'));
reset role;
insert into _r select 'field_ids', jsonb_object_agg(k, id) from _ids;
select k, v from _r order by k;
rollback;
