-- AP3-PHASEB-U4 RED (G3 sort list, G4 count switch) against the bodies U4 replaced, rolled back:
-- the pre-U4 platform.entity_list_scoped (re-created from migration ap3_u1_entity_read_doors, md5 checked) and the
-- compiler's question keys without "total" (that one U4 splice reversed in the transaction).
-- Expect: three sort keys -> only the first applied, the other two in sort_ignored; the page order is then NOT the
-- three-key order (seq_matches_3key false); a question with "total": false refused ("not part of a question").
-- Run as postgres (Supabase MCP execute_sql). The green twin is ap3_u4_sort_count_green.sql.
begin;
do $old$
declare v_s text; v_p int; v_e int;
begin
  select statements[1] into v_s from supabase_migrations.schema_migrations where name = 'ap3_u1_entity_read_doors';
  v_p := strpos(v_s, 'create or replace function platform.entity_list_scoped(');
  v_e := v_p + strpos(substr(v_s, v_p), E'\n$f$;') + 3;
  execute substr(v_s, v_p, v_e - v_p);
  if md5(pg_get_functiondef('platform.entity_list_scoped(text,jsonb,jsonb,text,text,text[],boolean,jsonb,text,boolean,boolean,integer,integer,text,boolean,jsonb)'::regprocedure))
     <> '6fe515ff8497c33791e6227bdb479b54' then
    raise exception 'the pre-U4 door was not restored exactly';
  end if;
  v_s := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
  if strpos(v_s, $a$'archived','cursor','total'])) then$a$) = 0 then raise exception 'the U4 key list was not found'; end if;
  execute replace(v_s, $a$'archived','cursor','total'])) then$a$, $a$'archived','cursor'])) then$a$);
end $old$;
create temp table _c(k text, v text) on commit drop;
grant all on _c to authenticated;
set local role authenticated;
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
insert into _c
with page as (
  select platform.entity_list_scoped('party', '{"kind":"all","organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}',
           p_sort => '[{"column":"last_name","dir":"desc"},{"column":"headline","dir":"asc"},{"column":"created_at","dir":"desc"},{"column":"first_name"}]',
           p_page_size => 500) p)
select 'sort', jsonb_build_object('applied', p -> 'sort_applied', 'ignored', p -> 'sort_ignored', 'seq_matches_3key',
       (select md5(string_agg(r ->> 'id', ',' order by o)) from jsonb_array_elements(p -> 'rows') with ordinality e(r, o))
       = (select md5(string_agg(x.id::text, ',' order by nullif(lower(x.last_name), '') desc nulls last, nullif(x.last_name, '') desc nulls last,
                                nullif(lower(x.headline), '') asc nulls last, nullif(x.headline, '') asc nulls last, x.created_at desc nulls last, x.id))
            from crm.party x where x.id::text in (select r ->> 'id' from jsonb_array_elements(p -> 'rows') r)))::text
  from page;
select set_config('mx.api_fast', '1', true);
do $$
begin
  begin
    insert into _c select 'drill_rows_total_false', coalesce(platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}',
      '{"scope":"all","limit":5,"total":false}') ->> 'total', 'null (skipped)');
  exception when others then insert into _c values ('drill_rows_total_false', 'ERR ' || sqlstate || ' ' || sqlerrm); end;
  begin
    insert into _c select 'plan_counts:total_false', (strpos(platform._drill_plan(null, '{"kind":"entity","token":"party","api":true}',
      '{"scope":"all","limit":5,"total":false}', 'rows') ->> 'sql', 'count(*)') > 0)::text;
  exception when others then insert into _c values ('plan_counts:total_false', 'ERR ' || sqlstate || ' ' || sqlerrm); end;
  insert into _c select 'plan_counts:total_omitted', (strpos(platform._drill_plan(null, '{"kind":"entity","token":"party","api":true}',
      '{"scope":"all","limit":5}', 'rows') ->> 'sql', 'count(*)') > 0)::text;
  insert into _c select 'door_total_false', coalesce(platform.entity_list_scoped('party', '{"kind":"all"}', p_page_size => 5, p_with_total => false) ->> 'total', 'null');
end $$;
select k, v from _c order by k;
rollback;
