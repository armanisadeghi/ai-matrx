-- LANE STORE-READ-PERF-4 — THE SCOPE TREE AND THE DATA HOME ASK SHARED ANSWERS: SAME ANSWERS.
-- Guard for migrations/campaign/storereadperf4_the_scope_tree_and_the_data_home_ask_shared_answers.sql.
--
-- In ONE rolled-back REPEATABLE READ transaction, the bodies before the file (its inverse first when
-- it is live) against the file's, from each seat (`authenticated`), byte for byte:
--   A. custom.query_visible_ids(org, Table kernel) for EVERY organization (ids or refusal);
--      custom.data_home (the home's one call), data_home_tables, data_home_items,
--      data_home_changed_by (the Tables listing's asks and every other listing's),
--      hub_changed_by('structure') over every Table and structure id of her organizations;
--      custom.context_tree over all her organizations, context_items over every scope type she
--      could name, context_values over the first 200 scopes of those types.
--   B. custom.tables_seen_once_per_group = custom.has_visibility for every member of every
--      organization with a Table and both seats over every Table.
-- This transaction writes (the DDL, the captures), so every statement memo is OFF here: this proves
-- the bodies. storereadperf4_memo.sql proves the memo path equals this path, in one snapshot, on
-- the clone with the file live. The timing is storereadperf4_timing.sql.
--   Plant (-v plant=fieldgroup): every Field shares its group's answer even when a grant names it.
--
-- RUN IT (dev clone only; always rolled back; several minutes):
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storereadperf4_green.sql
\set ON_ERROR_STOP on
\set suite 'storereadperf4_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?plant}
\else
\set plant none
\endif
\set QUIET on
-- ONE SNAPSHOT: the clone is shared, and a peer's write between the two captures would read as a
-- difference (MIRROR-LIVE-FORM measured exactly that).
begin isolation level repeatable read;
set local statement_timeout = 0;
set local transaction_timeout = 0;
set local lock_timeout = '10s';

select exists (select 1 from pg_proc where oid = 'custom.carrying_edges_in'::regproc and prosrc ~ 'STORE-READ-PERF-4') as file_is_live \gset
\if :file_is_live
\echo 'the file is live here: its inverse is applied first, in this transaction'
\i migrations/inverse/storereadperf4_the_scope_tree_and_the_data_home_ask_shared_answers_down.sql
\endif

create temp table seats on commit drop as
  select u.id, u.email from auth.users u where u.email in ('admin@admin.com', 'test@test.com');
create temp table all_orgs on commit drop as select id from iam.organizations;
create temp table hub_ids on commit drop as
  select s.email, x.organization_id as org,
         (array_agg(x.id order by (x.table_id = custom.table_kernel_id()) desc, x.id))[1:500] as ids
    from seats s
    join iam.organization_member m on m.user_id = s.id
    join custom.record x on x.organization_id = m.organization_id
     and (x.table_id = custom.table_kernel_id() or x.data_class <> 'record')
   group by 1, 2;
create temp table ans (phase text, seat text, door text, org uuid, payload text) on commit drop;
create temp table tim (phase text, seat text, door text, ms numeric) on commit drop;
create temp table ctx_types on commit drop as
  select s.email, t.id from seats s join iam.organization_member m on m.user_id = s.id
    join custom.record t on t.organization_id = m.organization_id and t.table_id = custom.table_kernel_id()
   and t.deleted_at is null and t.data ->> 'kept_for' = 'context';
create temp table ctx_scopes on commit drop as
  select c.email, r.id from (select email, (array_agg(r.id order by r.id))[1:200] ids
                               from ctx_types c join custom.record r on r.table_id = c.id and r.deleted_at is null group by 1) c
  cross join lateral unnest(c.ids) r(id);
grant select on ctx_types, ctx_scopes to authenticated;
grant all on ans, tim to authenticated;
grant select on seats, all_orgs, hub_ids to authenticated;

create function pg_temp.asks(p_items boolean) returns jsonb language sql as $$
  select case when not p_items then
    (select jsonb_agg(jsonb_build_object('organization_id', z.o, 'kind', 'structure', 'ids', z.ids))
       from (select organization_id o, jsonb_agg(table_id) ids from custom.data_home_tables() group by 1) z)
  else
    (select coalesce(jsonb_agg(jsonb_build_object('organization_id', z.o, 'kind', z.k, 'ids', z.ids)), '[]')
       from (select organization_id o,
                    case kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal' else 'structure' end k,
                    jsonb_agg(item_id) ids
               from custom.data_home_items() where kind <> 'share' group by 1, 2) z)
  end $$;

create function pg_temp.capture(p_phase text) returns void language plpgsql as $$
declare s record; o record; v text; a_t jsonb; a_i jsonb; t0 timestamptz; n int; i int; lab text; o_ids uuid[]; t_ids uuid[]; c_ids uuid[];
begin
  for s in select * from seats loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, true);
    for o in select id from all_orgs loop
      begin
        select coalesce(string_agg(x::text, ',' order by x), '') into v
          from custom.query_visible_ids(o.id, custom.table_kernel_id()) x;
      exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
      end;
      insert into ans values (p_phase, s.email, 'query_visible_ids', o.id, v);
    end loop;
    -- custom.data_home's three lists carry no ORDER BY (the page orders them by its own knob), so
    -- they are compared as sets of rows: every element, sorted.
    insert into ans select p_phase, s.email, 'data_home', null,
      (select string_agg(k || ':' || coalesce((select string_agg(e::text, E'\n' order by e::text)
                                                 from jsonb_array_elements(h -> k) e), ''), E'\n' order by k)
         from (select custom.data_home() as h) d, unnest(array['tables', 'items', 'changed_by']) k);
    select array_agg(m.organization_id) into o_ids from iam.organization_member m
      join iam.organizations x on x.id = m.organization_id and x.archived_at is null where m.user_id = s.id;
    insert into ans select p_phase, s.email, 'context_tree', null, custom.context_tree(o_ids)::text;
    select coalesce(array_agg(t.id), '{}') into t_ids from ctx_types t where t.email = s.email;
    insert into ans select p_phase, s.email, 'context_items', null, custom.context_items(t_ids)::text;
    select coalesce(array_agg(t.id), '{}') into c_ids from ctx_scopes t where t.email = s.email;
    insert into ans select p_phase, s.email, 'context_values', null, custom.context_values(c_ids)::text;
    insert into ans select p_phase, s.email, 'data_home_tables', null,
      coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '') from custom.data_home_tables() t;
    insert into ans select p_phase, s.email, 'data_home_items', null,
      coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '') from custom.data_home_items() t;
    a_t := pg_temp.asks(false); a_i := pg_temp.asks(true);
    insert into ans select p_phase, s.email, 'changed_by_tables', null,
      coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '') from custom.data_home_changed_by(a_t) t;
    insert into ans select p_phase, s.email, 'changed_by_items', null,
      coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '') from custom.data_home_changed_by(a_i) t;
    for o in select h.org as id, h.ids from hub_ids h where h.email = s.email loop
      begin
        select coalesce(string_agg(to_jsonb(c)::text, E'\n' order by to_jsonb(c)::text), '') into v
          from custom.hub_changed_by(o.id, 'structure', o.ids) c;
      exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
      end;
      insert into ans values (p_phase, s.email, 'hub_changed_by_structure', o.id, v);
    end loop;
  end loop;
end $$;


-- THE FIELD FIXTURE (rolled back with everything else): on three scope types test@test.com sees,
-- the name column becomes Confidential and the slug column Restricted, and one Restricted slug is
-- granted to her at admin — so the field decision says no at viewer, yes at a higher level, and yes
-- through a grant, and grouping Fields has something to get wrong.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'test@test.com'), 'role', 'authenticated')::text, true) \g /dev/null
create temp table fx_types on commit drop as
  select (e ->> 'id')::uuid as tbl, (e ->> 'organization_id')::uuid as org
    from jsonb_array_elements(custom.context_tree(array(
           select m.organization_id from iam.organization_member m
            where m.user_id = (select id from auth.users where email = 'test@test.com'))) -> 'types') e
   limit 3;
select set_config('request.jwt.claims', '', true) \g /dev/null
create temp table fx on commit drop as
  select f.id as fid, f.organization_id as org, t.tbl, f.data ->> 'key' as k
    from fx_types t
    join custom.record f
      on f.organization_id = t.org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = t.tbl::text and substr(f.id::text, 15, 1) = '5'
     and f.data ->> 'key' in ('slug', 'name');
update custom.record r
   set data = jsonb_set(r.data, '{sensitivity}', to_jsonb(case when fx.k = 'slug' then 'restricted' else 'confidential' end))
  from fx where r.organization_id = fx.org and r.id = fx.fid;
insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
select 'record', fx.fid, (select id from auth.users where email = 'test@test.com'), 'admin', 'active',
       (select id from auth.users where email = 'admin@admin.com')
  from fx where fx.k = 'slug' order by fx.fid limit 1;
select count(*) as fixture_fields from fx \gset
\echo 'field fixture:' :fixture_fields 'column Fields made Confidential / Restricted, one granted'

set local role authenticated;
select pg_temp.capture('old');
reset role;

\i migrations/campaign/storereadperf4_the_scope_tree_and_the_data_home_ask_shared_answers.sql

-- PLANTS: the file's helper with one of its rules broken, in this transaction only.
select md5(pg_get_functiondef('custom.context_tree'::regproc)) as body_before \gset
select :'plant' = 'fieldgroup' as plant_fieldgroup \gset
\if :plant_fieldgroup
\echo 'PLANT fieldgroup: a Field a grant names shares its group''s answer'
do $p$ begin execute replace(pg_get_functiondef('custom.context_tree'::regproc),
  'exists (select 1 from iam.permissions p where p.resource_type = ''record'' and p.resource_id = f.id)', 'false'); end $p$;
\endif
select (:'plant' <> 'fieldgroup') = (md5(pg_get_functiondef('custom.context_tree'::regproc)) = :'body_before') as plant_took \gset
\if :plant_took
\else
\echo 'the plant did not change the body - the plant text no longer matches the file'
select 1 / 0 as plant_missing;
\endif

select false as plant_old \gset

set local role authenticated;
select pg_temp.capture('new');
reset role;

-- A
create temp table verdict (clause text, ok boolean, said text) on commit drop;
insert into verdict
select 'A', count(*) filter (where o.payload is distinct from n.payload) = 0,
       format('%s answers compared (%s query_visible_ids ids), %s differ: %s', count(*),
              sum(coalesce(cardinality(string_to_array(nullif(case when o.payload like 'ERR%' then '' else o.payload end, ''), ',')), 0))
                filter (where o.door = 'query_visible_ids'),
              count(*) filter (where o.payload is distinct from n.payload),
              coalesce(string_agg(distinct o.seat || '/' || o.door, ', ') filter (where o.payload is distinct from n.payload), '-'))
  from ans o join ans n on n.seat = o.seat and n.door = o.door and n.org is not distinct from o.org
                       and o.phase = 'old' and n.phase = 'new';

\if :plant_old
insert into verdict values ('B', true, 'not asked: plant old has no helper');
\else
-- B: every member of every organization that holds a Table, over every live Table of every
-- organization she belongs to or holds a grant in; and both seats over EVERY live Table.
create temp table oracle_scope on commit drop as
  select m.user_id as person, m.organization_id as org
    from iam.organization_member m
   where exists (select 1 from custom.record t where t.organization_id = m.organization_id
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null)
  union
  select g.granted_to_user_id, t.organization_id
    from iam.permissions g
    join custom.record t on t.id = g.resource_id and t.table_id = custom.table_kernel_id()
   where g.resource_type = 'record' and g.granted_to_user_id is not null
  union
  select s.id, t.organization_id
    from seats s
    cross join (select distinct organization_id from custom.record
                 where table_id = custom.table_kernel_id() and deleted_at is null) t;
create temp table oracle on commit drop as
with helper as (
  select p.person, g.organization_id as org, g.id as tbl, g.seen
    from (select person, array_agg(org) as orgs from oracle_scope group by 1) p
    cross join lateral custom.tables_seen_once_per_group(p.person, p.orgs) g)
select sc.person, t.organization_id as org, t.id as tbl,
       custom.has_visibility(sc.person, 'record', t.id, 'viewer'::public.permission_level) as ladder,
       h.seen as helper
  from oracle_scope sc
  join custom.record t on t.organization_id = sc.org and t.table_id = custom.table_kernel_id() and t.deleted_at is null
  left join helper h on h.person = sc.person and h.org = t.organization_id and h.tbl = t.id;
insert into verdict
select 'B', count(*) filter (where helper is distinct from ladder) = 0,
       format('%s (person, Table) pairs, %s people, %s seen by the ladder, %s differ',
              count(*), count(distinct person), count(*) filter (where ladder), count(*) filter (where helper is distinct from ladder))
  from oracle;

\endif

select o.seat, o.door, o.org, left(o.payload, 300) as old_payload, left(n.payload, 300) as new_payload
  from ans o join ans n on n.seat = o.seat and n.door = o.door and n.org is not distinct from o.org
                       and o.phase = 'old' and n.phase = 'new'
 where o.payload is distinct from n.payload limit 10;
\pset format aligned
select clause, case when ok then 'GREEN' else 'RED' end as verdict, said from verdict order by clause;
select bool_and(ok) as all_green from verdict \gset
rollback;
\if :all_green
\echo 'GREEN'
\else
\echo 'RED'
select 1 / 0 as red;
\endif
