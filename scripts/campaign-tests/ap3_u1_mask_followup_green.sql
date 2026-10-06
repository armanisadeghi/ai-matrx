-- AP3-PHASEB-U1 follow-ups 2 and 3 (coordinator, 2026-10-06).
-- Fixture (rolled back): a Holloway contact by admin@admin.com with internal field "Renewal risk"; the platform knob
-- custom/field_sensitivity_levels read.internal is raised to `admin` inside the transaction, so the store withholds
-- the value from test@test.com (member, editor seat on the row).
--   2. analytics_* : the drill's ANALYTICS branch (no "scope") with a where on cf:<field>, as test@test.com:
--      RED  -> the count is 1 (a yes/no oracle over a withheld value); GREEN -> 0 (the field filters as unknown)
--   3. custom_has_key / custom_value : the withheld key in the door's _custom
--      RED  -> the key is missing; GREEN -> present, JSON null
-- This is the GREEN run (same body as ap3_u1_mask_followup_red.sql). Run as postgres (Supabase MCP execute_sql).
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
insert into _ids select 'internal', custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party',
  '{"key":"renewal_risk","label":"Renewal risk","type":"text","sensitivity":"internal"}'::jsonb);
select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01', '{}'::jsonb,
  '{"renewal_risk":"High: budget frozen until Q3"}'::jsonb, null, null);
reset role;
update platform.feature_knob set value = jsonb_set(value, '{read,internal}', '"admin"')
 where feature = 'custom' and key = 'field_sensitivity_levels';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'store_withholds', to_jsonb((x -> 'custom' -> '_hidden') ? 'renewal_risk')
  from custom.entity_record_read('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01') x;
insert into _r select 'analytics_rows_total_where_withheld',
  platform.drill_rows('344cfaa8-2b0c-4971-854a-9694614816f2', '{"kind":"entity","token":"party"}',
    jsonb_build_object('where', jsonb_build_object('cf:' || (select id from _ids where k = 'internal'), 'High: budget frozen until Q3'))) -> 'total';
insert into _r select 'analytics_ask_where_withheld',
  (select jsonb_agg(x) from platform.drill_ask('344cfaa8-2b0c-4971-854a-9694614816f2', '{"kind":"entity","token":"party"}',
    jsonb_build_object('where', jsonb_build_object('cf:' || (select id from _ids where k = 'internal'), 'High: budget frozen until Q3'))) x);
insert into _r select 'custom_has_key', to_jsonb((platform.entity_get('party', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01'::uuid]) -> 'rows' -> 0 -> '_custom') ? 'renewal_risk');
insert into _r select 'custom_value', platform.entity_get('party', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d01'::uuid]) -> 'rows' -> 0 -> '_custom';
reset role;
select k, v from _r order by k;
rollback;
