-- AP3-PHASEB-U1 forcing test, GREEN: lanes, Shown-to, the admin lane, cursors and refusals through the read doors.
-- Same fixtures as ap3_u1_scopes_red.sql (rolled back). Expect:
--   admin_all_party_total_no_header = admin_all_party_total_with_header (+ the same for task and the drill API)
--   test_only_me_on_all/orgs/team = false; test_only_me_opens_by_id = true; admin_only_me_on_all (her own) = true
--   test_containment_task_on_all = true since follow-up 1 (coordinator 2026-10-06: containment stays in All;
--   ap3_u1_containment_green.sql); test_containment_task_opens_by_id = true
--   org filter narrows: all_total > holloway_total, rows of more than one organization without the filter
--   default lane = knob lists.landing_tab (platform.entity_default_list_scope): default_total = all_total
--   stale/foreign/damaged cursor -> MX013; options not served yet -> MX016 / MX015 by name
-- Run as postgres (Supabase MCP execute_sql).
begin;
create temp table _r(k text, v jsonb) on commit drop;
grant all on _r to authenticated;
select set_config('app.actor_system', 'ap3_u1_forcing_test', true);
insert into crm.party(id, party_kind, display_name, first_name, last_name, organization_id, created_by, record_class, shown_to)
values ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02', 'person', 'Dalia Fenwick', 'Dalia', 'Fenwick',
        '344cfaa8-2b0c-4971-854a-9694614816f2', '87a6e699-3622-4869-8843-d0867456c0dd', 'contact', 'only_me');
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

set local role authenticated;
set local statement_timeout = '120s';
-- the admin lane adds nothing (admin@admin.com)
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);
insert into _r select 'admin_all_party_total_no_header', platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 1) -> 'total';
insert into _r select 'admin_all_task_total_no_header', platform.entity_list_scoped('task', '{"kind":"all"}', p_page_size => 1) -> 'total';
insert into _r select 'admin_drill_all_party_no_header', platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"all","limit":1}') -> 'total';
insert into _r select 'admin_only_me_on_all', to_jsonb(exists (select 1 from jsonb_array_elements(platform.entity_list_scoped('party',
  '{"kind":"all","organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}', p_page_size => 500) -> 'rows') r where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02'));
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
insert into _r select 'admin_lane_is_open', to_jsonb(platform.admin_lane_open());
insert into _r select 'admin_all_party_total_with_header', platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 1) -> 'total';
insert into _r select 'admin_all_task_total_with_header', platform.entity_list_scoped('task', '{"kind":"all"}', p_page_size => 1) -> 'total';
insert into _r select 'admin_drill_all_party_with_header', platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}', '{"scope":"all","limit":1}') -> 'total';
select set_config('request.headers', '{}', true);

-- test@test.com: Shown-to is a list filter, never a lock; containment leaves All and still opens by id
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'test_only_me_on_' || k, to_jsonb(exists (select 1 from jsonb_array_elements(platform.entity_list_scoped('party',
  jsonb_build_object('kind', k, 'organization_id', '344cfaa8-2b0c-4971-854a-9694614816f2'), p_page_size => 500) -> 'rows') r
  where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02')) from unnest(array['all', 'orgs', 'team']) k;
insert into _r select 'test_only_me_opens_by_id', to_jsonb(jsonb_array_length(platform.entity_get('party', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d02'::uuid]) -> 'rows') = 1);
insert into _r select 'test_containment_task_on_all', to_jsonb(exists (select 1 from jsonb_array_elements(platform.entity_list_scoped('task', '{"kind":"all"}',
  '{"all":[{"column":"id","op":"eq","value":"7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04"}]}') -> 'rows') r where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04'));
insert into _r select 'test_containment_task_opens_by_id', to_jsonb(jsonb_array_length(platform.entity_get('task', array['7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d04'::uuid]) -> 'rows') = 1);
insert into _r select 'test_shared_project_on_shared', to_jsonb(exists (select 1 from jsonb_array_elements(platform.entity_list_scoped('project', '{"kind":"shared"}', p_page_size => 500) -> 'rows') r
  where r ->> 'id' = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03'));

-- the organization filter narrows; nothing else does (the doors take no active organization at all)
insert into _r select 'test_party_all_total', platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 500) -> 'total';
insert into _r select 'test_party_all_orgs_on_page', (select to_jsonb(count(distinct r ->> 'organization_id')) from jsonb_array_elements(platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 500) -> 'rows') r);
insert into _r select 'test_party_holloway_total', platform.entity_list_scoped('party', '{"kind":"all","organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}', p_page_size => 1) -> 'total';
insert into _r select 'test_party_holloway_orgs_on_page', (select to_jsonb(array_agg(distinct r ->> 'organization_id')) from jsonb_array_elements(platform.entity_list_scoped('party', '{"kind":"all","organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}', p_page_size => 500) -> 'rows') r);
-- the default lane is the landing-tab knob
insert into _r select 'knob_default_lane_party', to_jsonb(platform.entity_default_list_scope('party'));
insert into _r select 'test_party_default_lane_total', platform.entity_list_scoped('party', null, p_page_size => 1) -> 'total';

-- cursors and refusals
do $$
declare v_a text; v_try record;
begin
  v_a := platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 2) ->> 'next_after';
  for v_try in select * from (values
      ('cursor_from_another_list', $q$select platform.entity_list_scoped('party', '{"kind":"mine"}', p_page_size => 2, p_after => $1)$q$),
      ('cursor_from_another_sort', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', p_sort => '[{"column":"display_name","dir":"asc"}]', p_page_size => 2, p_after => $1)$q$),
      ('cursor_damaged', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 2, p_after => left($1, 20) || 'x')$q$),
      ('refuse_p_deep', $q$select platform.entity_list_scoped('party', p_deep => true) where $1 is not null$q$),
      ('refuse_whole_words', $q$select platform.entity_list_scoped('party', p_search => 'ellis', p_search_match => 'whole_words') where $1 is not null$q$),
      ('refuse_search_columns', $q$select platform.entity_list_scoped('party', p_search_columns => array['bio']) where $1 is not null$q$),
      ('refuse_include', $q$select platform.entity_list_scoped('party', p_include => '{"primary_employer_party_id":true}') where $1 is not null$q$),
      ('refuse_trash', $q$select platform.entity_list_scoped('party', p_trash => true) where $1 is not null$q$),
      ('refuse_favorites_first', $q$select platform.entity_list_scoped('party', p_favorites_first => true) where $1 is not null$q$),
      ('refuse_page_number', $q$select platform.entity_list_scoped('party', p_page => 2) where $1 is not null$q$),
      ('refuse_negated', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', '{"all":[{"column":"display_name","op":"eq","value":"x","negated":true}]}') where $1 is not null$q$),
      ('refuse_text_op', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', '{"all":[{"column":"display_name","op":"text","match":"contains","value":"ell"}]}') where $1 is not null$q$),
      ('refuse_any_of', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', '{"any_of":{"columns":["display_name"],"query":"ell"}}') where $1 is not null$q$),
      ('refuse_nulls_first', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', p_sort => '[{"column":"display_name","dir":"asc","nulls":"first"}]') where $1 is not null$q$),
      ('refuse_contained_scope', $q$select platform.entity_list_scoped('task', '{"kind":"contained","parent_type":"project","parent_id":"7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1d03"}') where $1 is not null$q$),
      ('refuse_platform_all_scope', $q$select platform.entity_list_scoped('party', '{"kind":"platform_all"}') where $1 is not null$q$),
      ('refuse_unknown_column', $q$select platform.entity_list_scoped('party', '{"kind":"all"}', '{"all":[{"column":"no_such_column","op":"eq","value":"x"}]}') where $1 is not null$q$),
      ('refuse_get_include', $q$select platform.entity_get('party', array[gen_random_uuid()], '{"x":true}') where $1 is not null$q$)) t(k, q) loop
    begin
      execute v_try.q using v_a;
      insert into _r values (v_try.k, '"answered"');
    exception when others then
      insert into _r values (v_try.k, jsonb_build_object('refused', sqlstate, 'message', sqlerrm));
    end;
  end loop;
end $$;
insert into _r select 'unusable_sort_column_dropped', jsonb_build_object(
  'sort_ignored', x -> 'sort_ignored', 'sort_applied', x -> 'sort_applied')
  from (select platform.entity_list_scoped('party', '{"kind":"all"}', p_sort => '[{"column":"no_such_column","dir":"asc"},{"column":"display_name","dir":"asc"}]', p_page_size => 1) x) s;
reset role;
select k, v from _r order by k;
rollback;
