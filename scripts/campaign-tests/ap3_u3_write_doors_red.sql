-- AP3-PHASEB-U3 (write doors), RED: what today's write kernel lets through, before the doors exist.
-- Run as postgres (Supabase MCP execute_sql) BEFORE migration ap3_u3_entity_write_doors. Ends in ROLLBACK.
--
-- Holloway Creative (344cfaa8-…): admin@admin.com is the owner, test@test.com a member.
--   red:link_foreign_project   test@test.com adds a task in Holloway whose project_id names a project in an
--                              organization she is not in and cannot open; custom.entity_row_write ACCEPTS it
--                              (expected RED: created = true, can_open_project = false, project_org <> Holloway)
--   red:trash_without_delete   test@test.com moves to the trash a project admin@admin.com created in Holloway;
--                              she is an editor, not its creator and not an admin on it (delete policy: creator or
--                              iam.has_access(…,'admin')). OBSERVED 2026-10-06: NO permission red exists — the table's
--                              own trigger iam._guard_governance_columns already refuses it (42501 "Edit access does
--                              not include deleting this project.", deleted_at stays null). The red is the ANSWER: a
--                              bare 42501 in edit words, raised mid-write; the door answers MX003 in trash words from
--                              its kernel check before any write (green file).
--   red:ambiguous_word         a task whose project is named by a word two Holloway projects share: the kernel
--                              answers PT409, the stale-write code (expected RED: state = PT409)
--   red:doors_exist            platform.entity_update / entity_insert / entity_archive / entity_unarchive (expected RED: 0)
begin;
create temp table _r(k text, v jsonb) on commit drop;
grant all on _r to authenticated;
select set_config('app.actor_system', 'ap3_u3_forcing_test', true);
create function pg_temp._try(p_sql text) returns jsonb language plpgsql as $f$
declare v jsonb; s text; m text; d text;
begin
  execute p_sql into v;
  return jsonb_build_object('ok', true, 'v', v);
exception when others then
  get stacked diagnostics s = returned_sqlstate, m = message_text, d = pg_exception_detail;
  return jsonb_build_object('ok', false, 'state', s, 'message', m, 'detail', d);
end $f$;
grant execute on function pg_temp._try(text) to authenticated;

-- a project in an organization admin@admin.com is in and test@test.com is not
insert into _r select 'foreign_org', to_jsonb(o.id) from iam.organizations o
 where o.archived_at is null
   and exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '87a6e699-3622-4869-8843-d0867456c0dd')
   and not exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
   and o.id not in (select organization_id from iam.system_orgs)
 order by o.created_at limit 1;
insert into projects.projects(id, name, organization_id, created_by)
values ('5d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a11', 'Harbor festival posters', (select (v #>> '{}')::uuid from _r where k = 'foreign_org'),
        '87a6e699-3622-4869-8843-d0867456c0dd');

set local role authenticated;
select set_config('request.headers', '{}', true);
-- admin@admin.com: two Holloway projects with one name, and one she alone created
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _r select 'admin_project', custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'project', null, '{"name":"Brand refresh for Lumen Bakery"}', '{}', null, null);
insert into _r select 'twin_a', custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'project', null, '{"name":"Spring campaign"}', '{}', null, null);
insert into _r select 'twin_b', custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'project', null, '{"name":"Spring campaign"}', '{}', null, null);

select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'red:link_foreign_project', pg_temp._try(format(
  $q$select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'task', null, '{"title":"Proof the festival posters","project_id":"5d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a11"}', '{}', null, null)$q$))
  || jsonb_build_object('can_open_project', iam.has_access('project', '5d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a11', 'viewer'));
insert into _r select 'red:trash_without_delete',
  jsonb_build_object('has_admin', iam.has_access('project', (select (v ->> 'id')::uuid from _r where k = 'admin_project'), 'admin'),
                     'has_editor', iam.has_access('project', (select (v ->> 'id')::uuid from _r where k = 'admin_project'), 'editor'))
  || pg_temp._try(format($q$select custom.entity_row_write(null, 'project', %L, '{}', '{}', null, true)$q$,
                         (select v ->> 'id' from _r where k = 'admin_project')));
insert into _r select 'red:trash_without_delete:deleted_at', to_jsonb((select deleted_at from projects.projects where id = (select (v ->> 'id')::uuid from _r where k = 'admin_project')));
insert into _r select 'red:ambiguous_word', pg_temp._try(
  $q$select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'task', null, '{"title":"Shot list for the window display","project_id":"Spring campaign"}', '{}', null, null)$q$);
reset role;
insert into _r select 'red:link_foreign_project:stored_project_org', to_jsonb((select p.organization_id from projects.tasks t join projects.projects p on p.id = t.project_id
  where t.title = 'Proof the festival posters' and t.organization_id = '344cfaa8-2b0c-4971-854a-9694614816f2'));
insert into _r select 'red:doors_exist', to_jsonb((select count(*) from pg_proc where pronamespace = 'platform'::regnamespace
  and proname in ('entity_update', 'entity_insert', 'entity_archive', 'entity_unarchive')));
select k, v from _r where k like 'red:%' order by k;
rollback;
