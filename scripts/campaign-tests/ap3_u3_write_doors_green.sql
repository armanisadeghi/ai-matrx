-- AP3-PHASEB-U3 (write doors), GREEN: platform.entity_insert / entity_update / entity_archive / entity_unarchive.
-- Run as postgres (Supabase MCP execute_sql) AFTER migrations ap3_u3_an_ambiguous_word_is_a_refused_value and
-- ap3_u3_entity_write_doors. Ends in ROLLBACK; every fixture (projects, tasks, the custom field, the association,
-- the contact edits) goes with it. RED twin: ap3_u3_write_doors_red.sql.
--
-- Holloway Creative (344cfaa8-…): admin@admin.com owner, test@test.com member; 160 contacts made by admin@admin.com.
-- Every row below is one claim; `pass` is the claim's own boolean.
--   insert_project_as_test      saved, in Holloway, created_by = test@test.com, version 1, in the same call
--   update_right_version        saved; the row comes back with version 2 in the same call
--   update_wrong_version        MX001, the store's stale sentence, detail {id, base_version 1, current_version 2}
--   contact_custom_and_column   one write sets job_title AND a Holloway custom field; both read back; version + 1
--   refused_value               legal_name on a person contact: MX005 (the store's sentence, constraint party_org_facet);
--                               the contact is unchanged
--   insert_task_links_ok        a task under a Holloway project, assigned to a Holloway member: saved with both links
--   insert_party_refused        MX005 not_supported, "New contacts are added through the CRM…"; nothing written
--   link_foreign_project_insert MX004 naming project_id (RED: the kernel accepted it); nothing written
--   link_foreign_project_update MX004 naming project_id; the task keeps its project
--   link_outsider_assignee      MX004 naming assignee_id (a person outside Holloway)
--   trash_without_delete_right  test@test.com trashing admin@admin.com's project: MX003 in trash words; still live
--   ambiguous_word_door/kernel  MX005 {column project_id, reason ambiguous_word} (RED: PT409) through the door and kernel
--   unknown_key / system_key / no_org   MX012 / MX008 / MX002
--   admin_arm:door              a project in an organization admin@admin.com is not in (iam.has_access viewer = false):
--                               the door answers MX004 from the kernel check, before custom.entity_row_write runs
--                               (admin_arm:kernel_would records what the kernel itself answers for the same call)
--   trash_restore_project       admin trashes her project (association with a contact soft-deleted with it, its task
--                               untouched: no soft_delete_edge project -> task), "Moved to trash"; restore brings the
--                               association back, "Restored from trash"
--   trash_restore_subtasks      trashing a task trashes its subtask at the same instant; restoring brings it back;
--                               restoring [subtask, task] in that order also succeeds (second pass)
--   kernel_unchanged            custom.entity_row_write md5 is the pre-U3 body; a single word still resolves; a
--                               stale kernel write is still PT409 (the Table API's and HR panels' path)
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
  return jsonb_build_object('ok', false, 'state', s, 'message', m, 'detail', case when d like '{%' then d::jsonb else to_jsonb(d) end);
end $f$;
grant execute on function pg_temp._try(text) to authenticated;
create function pg_temp._id(p_k text) returns uuid language sql as $f$ select coalesce(v #>> '{v,rows,0,id}', v #>> '{rows,0,id}', v ->> 'id')::uuid from _r where k = p_k $f$;
grant execute on function pg_temp._id(text) to authenticated;

-- fixtures outside Holloway (as postgres): a project in an organization admin is in and test is not; a person
-- in that organization who is not in Holloway; a project in an organization admin is NOT in (for the admin arm)
insert into _r select 'kernel_md5', to_jsonb(md5(pg_get_functiondef('custom.entity_row_write(uuid,text,uuid,jsonb,jsonb,integer,boolean)'::regprocedure)));
insert into _r select 'foreign_org', to_jsonb(o.id) from iam.organizations o
 where o.archived_at is null
   and exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '87a6e699-3622-4869-8843-d0867456c0dd')
   and not exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
   and o.id not in (select organization_id from iam.system_orgs)
 order by o.created_at limit 1;
insert into projects.projects(id, name, organization_id, created_by)
values ('5d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a11', 'Harbor festival posters', (select (v #>> '{}')::uuid from _r where k = 'foreign_org'),
        '87a6e699-3622-4869-8843-d0867456c0dd');
insert into _r select 'outsider', to_jsonb(m.user_id) from iam.organization_member m
 where m.user_id not in (select user_id from iam.organization_member where organization_id = '344cfaa8-2b0c-4971-854a-9694614816f2')
 order by m.joined_at limit 1;
insert into _r select 'admin_arm_project', to_jsonb(p.id) from projects.projects p
 where p.deleted_at is null and p.visibility >= 'internal'
   and not exists (select 1 from iam.organization_member m where m.organization_id = p.organization_id and m.user_id = '87a6e699-3622-4869-8843-d0867456c0dd')
   and p.created_by is distinct from '87a6e699-3622-4869-8843-d0867456c0dd'
 order by p.created_at limit 1;
insert into _r select 'contacts', to_jsonb(array(select id from crm.party where organization_id = '344cfaa8-2b0c-4971-854a-9694614816f2'
   and deleted_at is null and record_class = 'contact' and party_kind = 'person' and created_by = '87a6e699-3622-4869-8843-d0867456c0dd' order by id limit 2));

set local role authenticated;
select set_config('request.headers', '{}', true);
-- ── admin@admin.com: a Holloway field for contacts, her project with a task, a subtask and a related contact
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _r select 'field', to_jsonb(custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '{"label":"Preferred contact time","type":"text"}'));
insert into _r select 'admin_project', pg_temp._try($q$select platform.entity_insert('project', '344cfaa8-2b0c-4971-854a-9694614816f2', '[{"name":"Brand refresh for Lumen Bakery","status":"active"}]')$q$);
insert into _r select 'twin_a', pg_temp._try($q$select platform.entity_insert('project', '344cfaa8-2b0c-4971-854a-9694614816f2', '[{"name":"Spring campaign"},{"name":"Spring campaign"}]')$q$);
insert into _r select 'admin_task', pg_temp._try(format($q$select platform.entity_insert('task', '344cfaa8-2b0c-4971-854a-9694614816f2', %L)$q$,
  jsonb_build_array(jsonb_build_object('title', 'Draft the new logo directions', 'project_id', pg_temp._id('admin_project')))));
insert into _r select 'admin_subtask', pg_temp._try(format($q$select platform.entity_insert('task', '344cfaa8-2b0c-4971-854a-9694614816f2', %L)$q$,
  jsonb_build_array(jsonb_build_object('title', 'Collect the bakery''s old packaging', 'project_id', pg_temp._id('admin_project'), 'parent_task_id', pg_temp._id('admin_task')))));
insert into _r select 'assoc', to_jsonb(public.assoc_link('party', (select (v ->> 0)::uuid from _r where k = 'contacts'), 'project', pg_temp._id('admin_project')));
insert into _r select 'admin_arm:can_open', to_jsonb(iam.has_access('project', (select (v #>> '{}')::uuid from _r where k = 'admin_arm_project'), 'viewer'));
insert into _r select 'admin_arm:door', pg_temp._try(format($q$select platform.entity_update('project', %L, null, '{"description":"Reviewed"}')$q$,
  (select v #>> '{}' from _r where k = 'admin_arm_project')));
insert into _r select 'admin_arm:kernel_would', pg_temp._try(format($q$select custom.entity_row_write(null, 'project', %L, '{"description":"Reviewed"}', '{}', null, null)$q$,
  (select v #>> '{}' from _r where k = 'admin_arm_project')));

-- ── test@test.com, a member of Holloway
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'insert_project_as_test', pg_temp._try($q$select platform.entity_insert('project', '344cfaa8-2b0c-4971-854a-9694614816f2', '[{"name":"Autumn window display","priority":"high"}]')$q$);
insert into _r select 'update_right_version', pg_temp._try(format($q$select platform.entity_update('project', %L, 1, '{"status":"planning","description":"Mood board due Friday"}')$q$, pg_temp._id('insert_project_as_test')));
insert into _r select 'update_wrong_version', pg_temp._try(format($q$select platform.entity_update('project', %L, 1, '{"status":"paused"}')$q$, pg_temp._id('insert_project_as_test')));
insert into _r select 'contact_before', platform.entity_get('party', array[(select (v ->> 0)::uuid from _r where k = 'contacts')]) -> 'rows' -> 0;
insert into _r select 'contact_custom_and_column', pg_temp._try(format($q$select platform.entity_update('party', %L, %s, %L)$q$,
  (select v ->> 0 from _r where k = 'contacts'), (select v ->> 'version' from _r where k = 'contact_before'),
  jsonb_build_object('job_title', 'Head of Retail Marketing', '_custom', jsonb_build_object('preferred_contact_time', 'Weekday mornings'))));
insert into _r select 'refused_value:version_before', to_jsonb((select version from crm.party where id = (select (v ->> 1)::uuid from _r where k = 'contacts')));
insert into _r select 'refused_value', pg_temp._try(format($q$select platform.entity_update('party', %L, null, '{"legal_name":"Lumen Bakery LLC"}')$q$,
  (select v ->> 1 from _r where k = 'contacts')));
insert into _r select 'refused_value:version_after', to_jsonb((select version from crm.party where id = (select (v ->> 1)::uuid from _r where k = 'contacts')));
insert into _r select 'insert_task_links_ok', pg_temp._try(format($q$select platform.entity_insert('task', '344cfaa8-2b0c-4971-854a-9694614816f2', %L)$q$,
  jsonb_build_array(jsonb_build_object('title', 'Order sample shelving', 'project_id', pg_temp._id('insert_project_as_test'),
                                       'assignee_id', '87a6e699-3622-4869-8843-d0867456c0dd'))));
insert into _r select 'insert_party_refused', pg_temp._try($q$select platform.entity_insert('party', '344cfaa8-2b0c-4971-854a-9694614816f2', '[{"display_name":"Marisol Ortega"}]')$q$);
insert into _r select 'link_foreign_project_insert', pg_temp._try($q$select platform.entity_insert('task', '344cfaa8-2b0c-4971-854a-9694614816f2', '[{"title":"Proof the festival posters","project_id":"5d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a11"}]')$q$);
insert into _r select 'link_foreign_project_update', pg_temp._try(format($q$select platform.entity_update('task', %L, null, '{"project_id":[{"token":"project","id":"5d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a11","label":"Harbor festival posters"}]}')$q$,
  pg_temp._id('insert_task_links_ok')));
insert into _r select 'link_outsider_assignee', pg_temp._try(format($q$select platform.entity_update('task', %L, null, %L)$q$,
  pg_temp._id('insert_task_links_ok'), jsonb_build_object('assignee_id', (select v #>> '{}' from _r where k = 'outsider'))));
insert into _r select 'trash_without_delete_right', pg_temp._try(format($q$select platform.entity_archive('project', array[%L]::uuid[])$q$, pg_temp._id('admin_project')));
insert into _r select 'ambiguous_word_door', pg_temp._try($q$select platform.entity_insert('task', '344cfaa8-2b0c-4971-854a-9694614816f2', '[{"title":"Shot list for the window display","project_id":"Spring campaign"}]')$q$);
insert into _r select 'ambiguous_word_kernel', pg_temp._try($q$select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'task', null, '{"title":"Shot list for the window display","project_id":"Spring campaign"}', '{}', null, null)$q$);
insert into _r select 'kernel_single_word', pg_temp._try($q$select custom.entity_row_write('344cfaa8-2b0c-4971-854a-9694614816f2', 'task', null, '{"title":"Book the photographer","project_id":"Autumn window display"}', '{}', null, null)$q$);
insert into _r select 'kernel_stale', pg_temp._try(format($q$select custom.entity_row_write(null, 'project', %L, '{"status":"active"}', '{}', 1, null)$q$, pg_temp._id('insert_project_as_test')));
insert into _r select 'unknown_key', pg_temp._try(format($q$select platform.entity_update('project', %L, null, '{"budget_code":"LB-7"}')$q$, pg_temp._id('insert_project_as_test')));
insert into _r select 'system_key', pg_temp._try(format($q$select platform.entity_update('project', %L, null, '{"version":9}')$q$, pg_temp._id('insert_project_as_test')));
insert into _r select 'no_org', pg_temp._try($q$select platform.entity_insert('project', null, '[{"name":"Holiday cards"}]')$q$);

-- ── admin@admin.com: trash and restore
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _r select 'trash_project', pg_temp._try(format($q$select platform.entity_archive('project', array[%L]::uuid[])$q$, pg_temp._id('admin_project')));
reset role;
insert into _r select 'trash_project:state', jsonb_build_object(
  'project_deleted', (select deleted_at is not null from projects.projects where id = pg_temp._id('admin_project')),
  'task_deleted', (select deleted_at is not null from projects.tasks where id = pg_temp._id('admin_task')),
  'assoc_deleted', (select deleted_at is not null from platform.associations where source_type = 'party' and target_type = 'project' and target_id = pg_temp._id('admin_project')));
set local role authenticated;
insert into _r select 'restore_project', pg_temp._try(format($q$select platform.entity_unarchive('project', array[%L]::uuid[])$q$, pg_temp._id('admin_project')));
reset role;
insert into _r select 'restore_project:state', jsonb_build_object(
  'project_deleted', (select deleted_at is not null from projects.projects where id = pg_temp._id('admin_project')),
  'assoc_deleted', (select deleted_at is not null from platform.associations where source_type = 'party' and target_type = 'project' and target_id = pg_temp._id('admin_project')));
set local role authenticated;
insert into _r select 'trash_task', pg_temp._try(format($q$select platform.entity_archive('task', array[%L]::uuid[])$q$, pg_temp._id('admin_task')));
reset role;
insert into _r select 'trash_task:state', (select jsonb_build_object('task_at', t.deleted_at, 'subtask_at', s.deleted_at, 'same_instant', t.deleted_at = s.deleted_at)
  from projects.tasks t, projects.tasks s where t.id = pg_temp._id('admin_task') and s.id = pg_temp._id('admin_subtask'));
set local role authenticated;
insert into _r select 'restore_task', pg_temp._try(format($q$select platform.entity_unarchive('task', array[%L]::uuid[])$q$, pg_temp._id('admin_task')));
insert into _r select 'restore_task:state', (select jsonb_build_object('task_live', t.deleted_at is null, 'subtask_live', s.deleted_at is null)
  from projects.tasks t, projects.tasks s where t.id = pg_temp._id('admin_task') and s.id = pg_temp._id('admin_subtask'));
insert into _r select 'trash_task_again', pg_temp._try(format($q$select platform.entity_archive('task', array[%L]::uuid[])$q$, pg_temp._id('admin_task')));
insert into _r select 'restore_child_first', pg_temp._try(format($q$select platform.entity_unarchive('task', array[%L, %L]::uuid[])$q$, pg_temp._id('admin_subtask'), pg_temp._id('admin_task')));
reset role;

select k, case k
  when 'insert_project_as_test' then jsonb_build_object('pass', (v ->> 'ok')::boolean and v #>> '{v,rows,0,organization_id}' = '344cfaa8-2b0c-4971-854a-9694614816f2'
                     and v #>> '{v,rows,0,created_by,0,id}' = '4060701e-706a-4c76-b3ca-0bbc69fa5a14' and (v #>> '{v,rows,0,version}')::int = 1,
                     'row', (v #> '{v,rows,0}') - 'metadata' - 'settings')
  when 'update_right_version' then jsonb_build_object('pass', (v ->> 'ok')::boolean and (v #>> '{v,rows,0,version}')::int = 2 and v #>> '{v,rows,0,status}' = 'planning',
                     'version', v #> '{v,rows,0,version}', 'status', v #> '{v,status}')
  when 'update_wrong_version' then jsonb_build_object('pass', v ->> 'state' = 'MX001' and v #>> '{detail,current_version}' = '2', 'got', v)
  when 'contact_custom_and_column' then jsonb_build_object('pass', (v ->> 'ok')::boolean and v #>> '{v,rows,0,job_title}' = 'Head of Retail Marketing'
                     and v #>> '{v,rows,0,_custom,preferred_contact_time}' = 'Weekday mornings'
                     and (v #>> '{v,rows,0,version}')::int = (select (v2 ->> 'version')::int + 1 from (select v as v2 from _r where k = 'contact_before') b),
                     'job_title', v #> '{v,rows,0,job_title}', '_custom', v #> '{v,rows,0,_custom}', 'version', v #> '{v,rows,0,version}')
  when 'refused_value' then jsonb_build_object('pass', v ->> 'state' = 'MX005' and v #>> '{detail,constraint}' = 'party_org_facet'
                     and (select v from _r where k = 'refused_value:version_after') = (select v from _r where k = 'refused_value:version_before'), 'got', v)
  when 'insert_task_links_ok' then jsonb_build_object('pass', (v ->> 'ok')::boolean and v #>> '{v,rows,0,project_id,0,id}' = (select pg_temp._id('insert_project_as_test')::text)
                     and v #>> '{v,rows,0,assignee_id,0,id}' = '87a6e699-3622-4869-8843-d0867456c0dd', 'project_id', v #> '{v,rows,0,project_id}', 'assignee_id', v #> '{v,rows,0,assignee_id}')
  when 'insert_party_refused' then jsonb_build_object('pass', v ->> 'state' = 'MX005' and v #>> '{detail,reason}' = 'not_supported', 'got', v)
  when 'link_foreign_project_insert' then jsonb_build_object('pass', v ->> 'state' = 'MX004' and v #>> '{detail,column}' = 'project_id', 'got', v)
  when 'link_foreign_project_update' then jsonb_build_object('pass', v ->> 'state' = 'MX004' and v #>> '{detail,column}' = 'project_id', 'got', v)
  when 'link_outsider_assignee' then jsonb_build_object('pass', v ->> 'state' = 'MX004' and v #>> '{detail,column}' = 'assignee_id', 'got', v)
  when 'trash_without_delete_right' then jsonb_build_object('pass', v ->> 'state' = 'MX003'
                     and (select deleted_at is null from projects.projects where id = pg_temp._id('admin_project')), 'got', v)
  when 'ambiguous_word_door' then jsonb_build_object('pass', v ->> 'state' = 'MX005' and v #>> '{detail,reason}' = 'ambiguous_word', 'got', v)
  when 'ambiguous_word_kernel' then jsonb_build_object('pass', v ->> 'state' = 'MX005' and v #>> '{detail,column}' = 'project_id', 'got', v)
  when 'kernel_single_word' then jsonb_build_object('pass', (v ->> 'ok')::boolean, 'got', v)
  when 'kernel_stale' then jsonb_build_object('pass', v ->> 'state' = 'PT409', 'got', v)
  when 'kernel_md5' then jsonb_build_object('pass', v #>> '{}' = '5f143bfbe12888bac8be372712b750fd', 'md5', v)
  when 'unknown_key' then jsonb_build_object('pass', v ->> 'state' = 'MX012', 'got', v)
  when 'system_key' then jsonb_build_object('pass', v ->> 'state' = 'MX008', 'got', v)
  when 'no_org' then jsonb_build_object('pass', v ->> 'state' = 'MX002', 'got', v)
  when 'admin_arm:door' then jsonb_build_object('pass', v ->> 'state' = 'MX004', 'got', v)
  when 'trash_project' then jsonb_build_object('pass', (v ->> 'ok')::boolean and v #>> '{v,message}' = 'Moved to trash' and (v #>> '{v,rows,0,_state,archived}')::boolean,
                     'message', v #> '{v,message}', 'state', v #> '{v,rows,0,_state}')
  when 'restore_project' then jsonb_build_object('pass', (v ->> 'ok')::boolean and v #>> '{v,message}' = 'Restored from trash', 'message', v #> '{v,message}', 'state', v #> '{v,rows,0,_state}')
  when 'trash_project:state' then jsonb_build_object('pass', (v ->> 'project_deleted')::boolean and (v ->> 'assoc_deleted')::boolean, 'state', v)
  when 'restore_project:state' then jsonb_build_object('pass', not (v ->> 'project_deleted')::boolean and not (v ->> 'assoc_deleted')::boolean, 'state', v)
  when 'trash_task:state' then jsonb_build_object('pass', (v ->> 'same_instant')::boolean, 'state', v)
  when 'restore_task:state' then jsonb_build_object('pass', (v ->> 'task_live')::boolean and (v ->> 'subtask_live')::boolean, 'state', v)
  when 'restore_child_first' then jsonb_build_object('pass', (v ->> 'ok')::boolean and jsonb_array_length(v #> '{v,rows}') = 2
                     and not exists (select 1 from jsonb_array_elements(v #> '{v,rows}') r where r ? 'deleted_at'), 'got', v #> '{v,message}')
  else v end as result
from _r
where k not in ('foreign_org', 'outsider', 'contacts', 'field', 'twin_a', 'assoc', 'contact_before', 'admin_task', 'admin_subtask', 'trash_task', 'restore_task',
                'trash_task_again', 'refused_value:version_before', 'admin_project', 'admin_arm_project')
order by k;
rollback;
