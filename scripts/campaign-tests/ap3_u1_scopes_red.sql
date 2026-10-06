-- AP3-PHASEB-U1 forcing test: the list scope of the platform read path (M5, M6 / G7).
-- RED (before U1), through today's platform.drill_rows API branch:
--   1. admin header: admin@admin.com's `all` party list GROWS when x-matrx-admin-lane: 1 is sent
--      (the admin route reaches the list through iam.my_orgs() -> system org, and the policies' admin arm).
--   2. Shown-to: a Holloway contact admin@admin.com marked `only_me` is ON test@test.com's `all` and `orgs` lists.
--   3. containment: a task test@test.com reaches only through a project shared with her (its organization is not
--      hers, no grant on the task) is ON her `all` list.
-- GREEN: ap3_u1_scopes_green.sql (platform.entity_list_scoped / entity_get).
-- Every fixture is rolled back. Run as postgres (Supabase MCP execute_sql).
begin;
create temp table _r(k text, v jsonb) on commit drop;
grant all on _r to authenticated;
select set_config('app.actor_system', 'ap3_u1_forcing_test', true);

-- fixture 2: an only_me Holloway contact by admin@admin.com
insert into crm.party(id, party_kind, display_name, first_name, last_name, organization_id, created_by, record_class, shown_to)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02', 'person', 'Dalia Fenwick', 'Dalia', 'Fenwick',
        '344cfaa8-2b0c-4971-854a-9694614816f2', '87a6e699-3622-4869-8843-d0867456c0dd', 'contact', 'only_me');
-- fixture 3: a project in an organization admin@admin.com is in and test@test.com is not, shared with test@test.com
-- (viewer grant on the project only), and one task inside it
insert into _r select 'containment_org', to_jsonb(o.id) from iam.organizations o
 where o.archived_at is null
   and exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '87a6e699-3622-4869-8843-d0867456c0dd')
   and not exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
   and o.id not in (select organization_id from iam.system_orgs)
 order by o.created_at limit 1;
insert into projects.projects(id, name, organization_id, created_by, visibility)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03', 'Spring catalogue shoot', (select (v #>> '{}')::uuid from _r where k = 'containment_org'),
        '87a6e699-3622-4869-8843-d0867456c0dd', 'internal');
insert into projects.tasks(id, title, project_id, organization_id, created_by, visibility)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04', 'Book the studio for the flat-lay day', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03',
        (select (v #>> '{}')::uuid from _r where k = 'containment_org'), '87a6e699-3622-4869-8843-d0867456c0dd', 'internal');
insert into iam.permissions(resource_type, resource_id, granted_to_user_id, permission_level, created_by, status)
values ('project', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'viewer',
        '87a6e699-3622-4869-8843-d0867456c0dd', 'active');

set local role authenticated;
-- 1. admin header (admin@admin.com, party, scope all): total without vs with the header
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);
insert into _r select 'admin_all_party_total_no_header', platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"all","limit":1}') -> 'total';
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
insert into _r select 'admin_all_party_total_with_header', platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"all","limit":1}') -> 'total';
select set_config('request.headers', '{}', true);

-- 2 + 3 as test@test.com
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'test_only_me_contact_on_all_list', to_jsonb(exists (select 1 from jsonb_array_elements(
  platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"all","organization":"344cfaa8-2b0c-4971-854a-9694614816f2","limit":500}') -> 'rows') r
  where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02'));
insert into _r select 'test_only_me_contact_on_orgs_list', to_jsonb(exists (select 1 from jsonb_array_elements(
  platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"orgs","organization":"344cfaa8-2b0c-4971-854a-9694614816f2","limit":500}') -> 'rows') r
  where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02'));
insert into _r select 'test_containment_task_on_all_list', to_jsonb(exists (select 1 from jsonb_array_elements(
  platform.drill_rows(null, '{"kind":"entity","token":"task","api":true}',
    jsonb_build_object('scope', 'all', 'where', jsonb_build_object('id', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04'))) -> 'rows') r
  where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04'));
insert into _r select 'test_containment_task_has_access_viewer', to_jsonb(iam.has_access('task', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04', 'viewer'));
reset role;
select k, v from _r order by k;
rollback;
