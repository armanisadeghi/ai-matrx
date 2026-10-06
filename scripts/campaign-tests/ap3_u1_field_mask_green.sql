-- AP3-PHASEB-U1 forcing test, GREEN: the custom-field mask through the new read doors (R12 / G8).
-- Same fixture as ap3_u1_field_mask_red.sql (rolled back):
--   PART A  `restricted` party field (value in the row) -- withheld; filtering on it is refused by name
--   PART B  internal field withheld from an editor by the store's level rule (knob raised in the transaction)
-- Expect, as test@test.com (member, editor on the row):
--   door_list_custom / door_get_custom / drill_value -> renewal_risk null, payment_terms_note absent
--   door_filter_withheld_internal_matches = 0, drill_filter_withheld_internal_matches = 0 (answers as unknown)
--   door_filter_restricted -> MX012 (no such column for her)
--   store_entity_record_read_custom -> both withheld (the store agrees)
-- And as admin@admin.com (organization owner = admin seat): door_list_custom_admin shows renewal_risk.
-- Control (knob as live): test@test.com reads the internal value (no new obstacle): control_member_reads_internal.
-- Run as postgres (Supabase MCP execute_sql).
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
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _ids select 'restricted', custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party',
  '{"key":"payment_terms_note","label":"Payment terms note","type":"text","sensitivity":"internal"}'::jsonb);
insert into _ids select 'internal', custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party',
  '{"key":"renewal_risk","label":"Renewal risk","type":"text","sensitivity":"internal"}'::jsonb);
select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01', '{}'::jsonb,
  '{"payment_terms_note":"Net 15, CFO sign-off above 40k","renewal_risk":"High: budget frozen until Q3"}'::jsonb, null, null);

-- control: with the live knob, the member reads the internal value through the door
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'control_member_reads_internal',
  (platform.entity_get('party', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01'::uuid]) -> 'rows' -> 0 -> '_custom');

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
insert into _r select 'door_list_custom',
  (select r -> '_custom' from jsonb_array_elements(platform.entity_list_scoped('party',
     '{"kind":"all","organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}', p_page_size => 500) -> 'rows') r
    where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01');
insert into _r select 'door_get_custom',
  (platform.entity_get('party', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01'::uuid]) -> 'rows' -> 0 -> '_custom');
insert into _r select 'door_filter_withheld_internal_matches',
  platform.entity_list_scoped('party', '{"kind":"all"}',
    '{"all":[{"column":"_custom.renewal_risk","op":"eq","value":"High: budget frozen until Q3"}]}') -> 'total';
do $$
begin
  insert into _r select 'door_filter_restricted', platform.entity_list_scoped('party', '{"kind":"all"}',
    '{"all":[{"column":"_custom.payment_terms_note","op":"eq","value":"Net 15, CFO sign-off above 40k"}]}') -> 'total';
exception when others then
  insert into _r values ('door_filter_restricted', jsonb_build_object('refused', sqlstate, 'message', sqlerrm));
end $$;
insert into _r select 'drill_value',
  (select jsonb_object_agg(e.key, e.value) from jsonb_array_elements(
     platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}'::jsonb,
       '{"scope":"all","organization":"344cfaa8-2b0c-4971-854a-9694614816f2"}'::jsonb) -> 'rows') r,
     jsonb_each(r) e
    where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01' and e.key like 'cf:%');
insert into _r select 'drill_filter_withheld_internal_matches', to_jsonb(jsonb_array_length(platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}'::jsonb,
  jsonb_build_object('scope', 'all', 'where', jsonb_build_object('cf:' || (select id from _ids where k = 'internal'), 'High: budget frozen until Q3'))) -> 'rows'));

-- the organization's owner holds the admin seat on the row: the rule lets her read it
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _r select 'door_list_custom_admin',
  (select r -> '_custom' from jsonb_array_elements(platform.entity_list_scoped('party',
     '{"kind":"all","organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}', p_page_size => 500) -> 'rows') r
    where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01');
insert into _r select 'store_entity_record_read_custom_admin', x -> 'custom'
  from custom.entity_record_read('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01') x;
reset role;
select k, v from _r order by k;
rollback;
