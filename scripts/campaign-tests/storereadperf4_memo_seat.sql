-- One seat's digests for storereadperf4_memo.sql (phase :phase, seat :seat).
select set_config('request.jwt.claims', json_build_object('sub', :'seat_id', 'role', 'authenticated')::text, true) \g /dev/null
select array_agg(m.organization_id)::text as orgs from iam.organization_member m
  join iam.organizations x on x.id = m.organization_id and x.archived_at is null where m.user_id = :'seat_id' \gset
select coalesce(array_agg(t.id), '{}')::text as types from custom.record t
 where t.organization_id = any (:'orgs'::uuid[]) and t.table_id = custom.table_kernel_id()
   and t.deleted_at is null and t.data ->> 'kept_for' = 'context' \gset
select coalesce((array_agg(r.id order by r.id))[1:200], '{}')::text as scopes from custom.record r
 where r.table_id = any (:'types'::uuid[]) and r.deleted_at is null \gset
set role authenticated;
select md5(custom.data_home()::text) as d1 \gset
select md5(custom.context_tree(:'orgs'::uuid[])::text) as d2 \gset
select md5(custom.context_items(:'types'::uuid[])::text) as d3 \gset
select md5(custom.context_values(:'scopes'::uuid[])::text) as d4 \gset
select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '')) as d5 from custom.data_home_tables() t \gset
select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '')) as d6 from custom.data_home_items() t \gset
select md5(coalesce(string_agg(to_jsonb(c)::text, E'\n' order by to_jsonb(c)::text), '')) as d7
  from custom.data_home_changed_by((select jsonb_agg(jsonb_build_object('organization_id', z.o, 'kind', 'structure', 'ids', z.ids))
                                      from (select organization_id o, jsonb_agg(table_id) ids from custom.data_home_tables() group by 1) z)) c \gset
do $q$
declare o uuid; v text; acc text := '';
begin
  for o in select id from iam.organizations order by id loop
    begin
      select coalesce(string_agg(x::text, ',' order by x), '') into v
        from custom.query_visible_ids(o, custom.table_kernel_id()) x;
    exception when others then v := 'ERR ' || sqlstate;
    end;
    acc := md5(acc || o::text || ':' || v);
  end loop;
  perform set_config('perf4.qvi', acc, true);
end $q$;
select current_setting('perf4.qvi') as d8 \gset
reset role;
select set_config('perf4.' || :'phase' || '_' || :'seat',
                  :'d1' || '/' || :'d2' || '/' || :'d3' || '/' || :'d4' || '/' || :'d5' || '/' || :'d6' || '/' || :'d7' || '/' || :'d8', true) \g /dev/null
