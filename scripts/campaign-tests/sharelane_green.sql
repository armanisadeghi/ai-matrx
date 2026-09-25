-- LANE SHARE-LANE-CONTROL — THE GREEN SUITE. The Share dialog's "Who can see this" control is drawn
-- from ONE door, public.store_door_lane, so that door names in EVERY state what the control says:
-- the object's own organization (id and name), the level the member default grants on it (even
-- while the owner chose "Only people I share it with", so the choice can say what switching back
-- gives), and whether the world lane would accept "Anyone with the link".
--
-- THE REAL USE CASE: admin@admin.com runs Harbor Landscaping Crew, a throwaway organization in
-- which test@test.com (Dana) is a plain member, and keeps a Table, "Irrigation bids". Admin opens
-- Share: the control reads "Everyone in Harbor Landscaping Crew (Viewer)", selected. Admin picks
-- "Only people I share it with": the control still names the organization and its Viewer default,
-- and Current Access drops the organization-default row. Admin picks "Everyone in ..." again.
--
-- RUN IT (clone or branch; always ONE rolled-back transaction):
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/sharelane_green.sql
-- ITS RED: before sharelane_the_lane_door_names_the_organization.sql (and after its inverse) L1
-- fails: the door names no organization_id / member_default_level / world_open.

\set ON_ERROR_STOP on
\timing off

\set suite 'sharelane_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
select set_config('app.actor_system', 'sharelane_green_suite', true);

-- ── fixtures (as the store owner)
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values ('5ba5aa1e-0000-4a00-8a00-000000000b01', 'Harbor Landscaping Crew', 'harbor-landscaping-share-lane',
        'HLC', '87a6e699-3622-4869-8843-d0867456c0dd');
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
 ('5ba5aa1e-0000-4a00-8a00-000000000b01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000b01',
  '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active'),
 ('5ba5aa1e-0000-4a00-8a00-000000000b01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000b01',
  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000b01',
        '5ba5aa1e-0000-4a00-8a00-000000000b01', 'true'::jsonb, 'SHARE-LANE-CONTROL green suite');

create temp table sl_probe (k text primary key, v uuid) on commit drop;
grant select on sl_probe to authenticated;

do $t$
declare
  v_org constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000b01';
  v_hq  constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000201';
  v_adm constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  t uuid; b uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, '11111111-0000-4000-8000-000000000004', 'record', jsonb_build_object('name', 'Crew HQ'), v_adm);
  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Irrigation bids', 'slug', 'irrigation_bids', 'label_singular', 'Bid', 'label_plural', 'Bids',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  update custom.record set created_by = v_adm where id = t;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, t, 'record', jsonb_build_object('title', 'Dana Point HOA drip retrofit'), v_adm)
  returning id into b;
  insert into sl_probe values ('tbl', t), ('bid', b);
end $t$;

select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
-- L1: a Table nobody chose a lane for — the door names the organization, the default, the world switch.
do $t$
declare d jsonb;
begin
  d := public.store_door_lane('record', (select v from sl_probe where k = 'tbl'));
  if d ->> 'organization_id' is distinct from '5ba5aa1e-0000-4a00-8a00-000000000b01'
     or d ->> 'organization_name' is distinct from 'Harbor Landscaping Crew' then
    raise exception 'L1 FAILED — the lane door does not name the object''s own organization: %', d;
  end if;
  if d ->> 'member_default_level' is distinct from 'viewer' then
    raise exception 'L1 FAILED — the lane door does not name the member default level: %', d;
  end if;
  if d -> 'world_open' is null or jsonb_typeof(d -> 'world_open') <> 'boolean' then
    raise exception 'L1 FAILED — the lane door does not say whether the world lane is open: %', d;
  end if;
  if d ->> 'choice' <> 'organization' or d -> 'organization_default' ->> 'level' <> 'viewer' then
    raise exception 'L1 FAILED — the existing answer moved: %', d;
  end if;
  raise notice 'L1 PASSED — %', d;
end $t$;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000b01', (select v from sl_probe where k = 'tbl'), 'mine') ->> 'message' as said;
-- L2: on "mine" the door still names the organization and what its default grants, and no default row.
do $t$
declare d jsonb;
begin
  d := public.store_door_lane('record', (select v from sl_probe where k = 'tbl'));
  if d ->> 'choice' <> 'mine' or d -> 'organization_default' <> 'null'::jsonb then
    raise exception 'L2 FAILED — after mine the door says %', d;
  end if;
  if d ->> 'organization_name' is distinct from 'Harbor Landscaping Crew' or d ->> 'member_default_level' is distinct from 'viewer' then
    raise exception 'L2 FAILED — on mine the door forgets what "Everyone in" would give: %', d;
  end if;
  if exists (select 1 from custom.share_access('5ba5aa1e-0000-4a00-8a00-000000000b01', (select v from sl_probe where k = 'tbl')) a
              where a.reason = 'organization default') then
    raise exception 'L2 FAILED — Current Access still lists the organization default on a "mine" Table.';
  end if;
  raise notice 'L2 PASSED — %', d;
end $t$;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000b01', (select v from sl_probe where k = 'tbl'), 'organization') ->> 'message' as said;
-- L3: back on the organization lane the door names the default again.
do $t$
declare d jsonb;
begin
  d := public.store_door_lane('record', (select v from sl_probe where k = 'tbl'));
  if d ->> 'choice' <> 'organization' or d -> 'organization_default' ->> 'level' is distinct from 'viewer' then
    raise exception 'L3 FAILED — back on the organization lane the door says %', d;
  end if;
  raise notice 'L3 PASSED';
end $t$;
reset role;
-- L4: Dana, a plain member, reads the same answer (she sees the state as text).
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare d jsonb;
begin
  d := public.store_door_lane('record', (select v from sl_probe where k = 'tbl'));
  if d ->> 'organization_name' is distinct from 'Harbor Landscaping Crew' or d ->> 'choice' <> 'organization' then
    raise exception 'L4 FAILED — a plain member reads %', d;
  end if;
  raise notice 'ALL PASSED — sharelane_green';
end $t$;
reset role;

rollback;
