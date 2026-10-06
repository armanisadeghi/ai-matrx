-- AP3-PHASEB-U1 follow-up 1 (coordinator, 2026-10-06): containment stays in `all`.
--   containment_task_on_all   a task test@test.com reaches only through a project shared with her (organization
--                             not hers, no grant on the task): must be ON her `all` list (door and Table API) and open by id
--   diff:<token>              test@test.com's Table API `all` ids (platform.drill_rows, scope all, no header) against
--                             the list BEFORE U1, rebuilt from the pre-U1 predicate (_drill_compile md5 5239113d…):
--                             not (published or global-readable system org) or mine or iam.my_orgs() or a user grant,
--                             under her row security. Every id missing now is classified:
--                               shown_to  -> hidden by the row's Shown-to (G7, a list filter by design)
--                               other     -> a DEFECT
--                             and extra ids (in now, not before) are listed too.
-- RED was containment_task_on_all = false (ap3_u1_containment_red.sql). GREEN (this file, after the follow-up): true; diff missing_other = [].
-- Same body as the red file, plus totals for both people and the admin header (must add 0 rows).
-- Fixtures rolled back. Run as postgres (Supabase MCP execute_sql).
begin;
create temp table _r(k text, v jsonb) on commit drop;
grant all on _r to authenticated;
select set_config('app.actor_system', 'ap3_u1_forcing_test', true);
insert into _r select 'containment_org', to_jsonb(o.id) from iam.organizations o
 where o.archived_at is null
   and exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '87a6e699-3622-4869-8843-d0867456c0dd')
   and not exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
   and o.id not in (select organization_id from iam.system_orgs)
 order by o.created_at limit 1;
insert into projects.projects(id, name, organization_id, created_by)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03', 'Spring catalogue shoot', (select (v #>> '{}')::uuid from _r where k = 'containment_org'),
        '87a6e699-3622-4869-8843-d0867456c0dd');
insert into projects.tasks(id, title, project_id, organization_id, created_by)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04', 'Book the studio for the flat-lay day', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03',
        (select (v #>> '{}')::uuid from _r where k = 'containment_org'), '87a6e699-3622-4869-8843-d0867456c0dd');
insert into iam.permissions(resource_type, resource_id, granted_to_user_id, permission_level, created_by, status)
values ('project', '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'viewer',
        '87a6e699-3622-4869-8843-d0867456c0dd', 'active');

create temp table _ids(k text, id uuid) on commit drop;
grant all on _ids to authenticated;
set local role authenticated;
set local statement_timeout = '120s';
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'containment_task_on_all_door', to_jsonb(exists (select 1 from jsonb_array_elements(platform.entity_list_scoped('task', '{"kind":"all"}',
  '{"all":[{"column":"id","op":"eq","value":"7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04"}]}') -> 'rows') r where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04'));
insert into _r select 'containment_task_opens_by_id', to_jsonb(jsonb_array_length(platform.entity_get('task', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04'::uuid]) -> 'rows') = 1);

-- now: the Table API's `all`
insert into _ids select 'now:party', (r ->> 'id')::uuid from jsonb_array_elements(platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"all","limit":1000}') -> 'rows') r;
insert into _ids select 'now:task',  (r ->> 'id')::uuid from jsonb_array_elements(platform.drill_rows(null, '{"kind":"entity","token":"task","api":true}',  '{"scope":"all","limit":1000}') -> 'rows') r;
-- before U1: the pre-U1 `all` predicate, verbatim in meaning, under her row security
insert into _ids select 'before:party', t.id from crm.party t
 where t.deleted_at is null and t.canonical_id is null and t.record_class = 'contact'
   and (not (coalesce(t.published_to_web, false) or coalesce(t.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable), false))
        or t.created_by = auth.uid() or t.organization_id in (select iam.my_orgs())
        or t.id in (select p.resource_id from iam.permissions p where p.resource_type = 'party' and p.granted_to_user_id = auth.uid()
                     and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())));
insert into _ids select 'before:task', t.id from projects.tasks t
 where t.deleted_at is null
   and (not (coalesce(t.published_to_web, false) or coalesce(t.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable), false))
        or t.created_by = auth.uid() or t.organization_id in (select iam.my_orgs())
        or t.id in (select p.resource_id from iam.permissions p where p.resource_type = 'task' and p.granted_to_user_id = auth.uid()
                     and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())));
insert into _r
select 'diff:' || tok, jsonb_build_object(
  'before', (select count(*) from _ids where k = 'before:' || tok),
  'now',    (select count(*) from _ids where k = 'now:' || tok),
  'missing_shown_to', (select count(*) from _ids b where b.k = 'before:' || tok and b.id not in (select id from _ids where k = 'now:' || tok)
                        and b.id in (select x.id from crm.party x where tok = 'party' and not platform.shown_to_lists(x.shown_to, null, x.created_by, x.organization_id, auth.uid(), platform.shown_to_context('party'))
                                     union all
                                     select x.id from projects.tasks x where tok = 'task' and not platform.shown_to_lists(x.shown_to, null, x.created_by, x.organization_id, auth.uid(), platform.shown_to_context('task')))),
  'missing_other', (select coalesce(jsonb_agg(b.id), '[]'::jsonb) from _ids b where b.k = 'before:' || tok and b.id not in (select id from _ids where k = 'now:' || tok)
                        and b.id not in (select x.id from crm.party x where tok = 'party' and not platform.shown_to_lists(x.shown_to, null, x.created_by, x.organization_id, auth.uid(), platform.shown_to_context('party'))
                                         union all
                                         select x.id from projects.tasks x where tok = 'task' and not platform.shown_to_lists(x.shown_to, null, x.created_by, x.organization_id, auth.uid(), platform.shown_to_context('task')))),
  'extra', (select coalesce(jsonb_agg(n.id), '[]'::jsonb) from _ids n where n.k = 'now:' || tok and n.id not in (select id from _ids where k = 'before:' || tok)))
from unnest(array['party', 'task']) tok;
-- the admin lane still adds nothing; totals restated for both people (door, `all`, no organization filter)
insert into _r select 'totals:' || u || ':' || tok, platform.entity_list_scoped(tok, '{"kind":"all"}', p_page_size => 1) -> 'total'
  from (select 'test' u) x, unnest(array['party', 'task']) tok;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _r select 'totals:admin:' || tok, platform.entity_list_scoped(tok, '{"kind":"all"}', p_page_size => 1) -> 'total'
  from unnest(array['party', 'task']) tok;
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
insert into _r select 'totals:admin_with_header:' || tok, platform.entity_list_scoped(tok, '{"kind":"all"}', p_page_size => 1) -> 'total'
  from unnest(array['party', 'task']) tok;
insert into _r select 'totals:admin_with_header_drill:' || tok, platform.drill_rows(null, jsonb_build_object('kind', 'entity', 'token', tok, 'api', true), '{"scope":"all","limit":1}') -> 'total'
  from unnest(array['party', 'task']) tok;
select set_config('request.headers', '{}', true);
reset role;
select k, v from _r order by k;
rollback;
