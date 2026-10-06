-- AP3-PHASEB-U1 GREEN: keyset paging, links as EntityRef, and both people's counts.
--   walk:<user>:<token>:<org>:<order>  pages of 50 walked to the end through platform.entity_list_scoped:
--        {rows, distinct, total, pages, md5_door, md5_direct} -- rows = distinct = total (never skipped or repeated)
--        and md5_door = md5_direct: the same ids as a direct read under her row security with the lane written out
--        (mine ∪ member organizations with Shown-to ∪ explicit grants, the type's default list, live organizations).
--   count:<user>:<token>:<org>         door totals in Holloway Creative and admin's Workspace (both are members)
--   links                              a task's lookup columns come back as [{token, id, label}]
-- Read-only; rolled back. Run as postgres (Supabase MCP execute_sql).
begin;
create temp table _r(k text, v jsonb) on commit drop;
grant all on _r to authenticated;
set local role authenticated;
set local statement_timeout = '300s';
select set_config('request.headers', '{}', true);
do $$
declare
  u text; t text; o uuid; s jsonb; v_after text; v_page jsonb; v_ids uuid[]; v_n int; v_total jsonb; v_direct text;
begin
  foreach u in array array['87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    foreach o in array array['344cfaa8-2b0c-4971-854a-9694614816f2'::uuid, '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid] loop
      foreach t in array array['party', 'project', 'task'] loop
        insert into _r select 'count:' || left(u, 4) || ':' || t || ':' || left(o::text, 8),
          platform.entity_list_scoped(t, jsonb_build_object('kind', 'all', 'organization_id', o), p_page_size => 1) -> 'total';
      end loop;
      foreach t in array array['party', 'project'] loop
        for s in select x from jsonb_array_elements('[null, [{"column":"updated_at","dir":"asc"}]]'::jsonb) x loop
          v_after := null; v_ids := '{}'; v_n := 0;
          loop
            v_page := platform.entity_list_scoped(t, jsonb_build_object('kind', 'all', 'organization_id', o),
                        p_sort => case when jsonb_typeof(s) = 'array' then s end, p_page_size => 50, p_after => v_after);
            v_n := v_n + 1;
            v_total := coalesce(v_total, v_page -> 'total');
            v_ids := v_ids || array(select (r ->> 'id')::uuid from jsonb_array_elements(v_page -> 'rows') r);
            v_after := v_page ->> 'next_after';
            exit when v_after is null or v_n > 100;
          end loop;
          if t = 'party' then
            select md5(coalesce(string_agg(p.id::text, ',' order by p.id), '')) into v_direct from crm.party p
             where p.organization_id = o and p.deleted_at is null and p.canonical_id is null and p.record_class = 'contact'
               and p.organization_id not in (select iam.archived_org_ids())
               and (p.created_by = u::uuid
                    or (p.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = u::uuid)
                        and platform.shown_to_lists(p.shown_to, null, p.created_by, p.organization_id, u::uuid, platform.shown_to_context('party')))
                    or p.id in (select g.resource_id from iam.permissions g where g.resource_type = 'party' and g.status <> 'rejected'
                                  and (g.expires_at is null or g.expires_at > now())
                                  and (g.granted_to_user_id = u::uuid or g.granted_to_organization_id in
                                        (select om.organization_id from iam.organization_member om where om.user_id = u::uuid))));
          else
            select md5(coalesce(string_agg(p.id::text, ',' order by p.id), '')) into v_direct from projects.projects p
             where p.organization_id = o and p.deleted_at is null
               and p.organization_id not in (select iam.archived_org_ids())
               and (p.created_by = u::uuid
                    or (p.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = u::uuid)
                        and platform.shown_to_lists(p.shown_to, null, p.created_by, p.organization_id, u::uuid, platform.shown_to_context('project')))
                    or p.id in (select g.resource_id from iam.permissions g where g.resource_type = 'project' and g.status <> 'rejected'
                                  and (g.expires_at is null or g.expires_at > now())
                                  and (g.granted_to_user_id = u::uuid or g.granted_to_organization_id in
                                        (select om.organization_id from iam.organization_member om where om.user_id = u::uuid))));
          end if;
          insert into _r select 'walk:' || left(u, 4) || ':' || t || ':' || left(o::text, 8) || ':' || case when s = 'null' then 'default' else 'updated_at' end,
            jsonb_build_object('rows', cardinality(v_ids), 'distinct', (select count(distinct x) from unnest(v_ids) x), 'total', v_total, 'pages', v_n,
                               'md5_door', (select md5(coalesce(string_agg(x::text, ',' order by x), '')) from unnest(v_ids) x), 'md5_direct', v_direct);
          v_total := null;
        end loop;
      end loop;
    end loop;
  end loop;
end $$;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
insert into _r select 'links', (select jsonb_build_object('project_id', r -> 'project_id', 'assignee_id', r -> 'assignee_id', 'created_by', r -> 'created_by')
  from jsonb_array_elements(platform.entity_list_scoped('task', '{"kind":"all","organization_id":"884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"}', p_page_size => 50) -> 'rows') r
  where jsonb_array_length(r -> 'project_id') = 1 limit 1);
reset role;
select k, v from _r order by k;
rollback;
