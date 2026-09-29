-- LANE STORE-READ-PERF-3 — WHICH TABLES SHE SEES IS ASKED ONCE PER GROUP, FOR EVERY ORGANIZATION.
-- Guard for migrations/campaign/storereadperf3b_which_tables_she_sees_is_asked_once_per_group.sql.
--
-- THE REAL USE CASE: the data home (/data-v2) opens on everything a person can see across ALL her
-- organizations. admin@admin.com is in 47, test@test.com in 14 — two of them share only what is
-- shared. Every answer below is asked from her seat (`authenticated`), as a browser asks.
--
-- What must hold, in ONE rolled-back transaction (the bodies before the file — the inverse is \i'd
-- first when the file is already live — then the file's):
--   A. SAME ANSWERS. For both seats: custom.query_visible_ids(org, Table kernel) for EVERY
--      organization on the database (the ids, or the refusal, byte for byte); custom.data_home_tables,
--      custom.data_home_items, custom.data_home_changed_by (the Tables listing's asks and every other
--      listing's), and custom.hub_changed_by('structure') over every Table and structure id (up to
--      500 an organization, Tables first) of every organization she is in. Full rows, not a sample.
--   B. THE HELPER IS THE LADDER. custom.tables_seen_once_per_group(person, every organization) =
--      custom.has_visibility(person, 'record', Table, 'viewer') for EVERY person who belongs to any
--      organization and EVERY live Table on the database, in one statement.
--   C. FASTER. Each of the four data home calls, warm, median of three, for both seats, costs at
--      most 0.7x what the bodies before the file cost in the same run. RED on the old bodies (1.0x).
--   Plants (-v plant=...): `named` lets a Table a grant names share its group's answer; `arm4`
--   drops arm 4 — each must turn B (and A) RED; `old` answers the new side with the bodies before
--   the file — C must turn RED (and B cannot run: the helper is gone).
--
-- RUN IT (dev clone only; always rolled back; about 3 minutes):
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storereadperf3b_green.sql
\set ON_ERROR_STOP on
\set suite 'storereadperf3b_green.sql'
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

select to_regproc('custom.tables_seen_once_per_group') is not null as file_is_live \gset
\if :file_is_live
\echo 'the file is live here: its inverse is applied first, in this transaction'
\i migrations/inverse/storereadperf3b_which_tables_she_sees_is_asked_once_per_group_down.sql
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
declare s record; o record; v text; a_t jsonb; a_i jsonb; t0 timestamptz; n int; i int; lab text;
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
    -- C: warm timings (the first call of each is the warm-up)
    foreach lab in array array['tables', 'items', 'changed_by_tables', 'changed_by_items'] loop
      for i in 1 .. 4 loop
        t0 := clock_timestamp();
        if lab = 'tables' then select count(*) into n from custom.data_home_tables();
        elsif lab = 'items' then select count(*) into n from custom.data_home_items();
        elsif lab = 'changed_by_tables' then select count(*) into n from custom.data_home_changed_by(a_t);
        else select count(*) into n from custom.data_home_changed_by(a_i);
        end if;
        if i > 1 then
          insert into tim values (p_phase, s.email, lab, extract(epoch from clock_timestamp() - t0) * 1000);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

set local role authenticated;
select pg_temp.capture('old');
reset role;

\i migrations/campaign/storereadperf3b_which_tables_she_sees_is_asked_once_per_group.sql

-- PLANTS: the file's helper with one of its rules broken, in this transaction only.
select :'plant' = 'named' as plant_named, :'plant' = 'arm4' as plant_arm4 \gset
select md5(pg_get_functiondef('custom.tables_seen_once_per_group'::regproc)) as body_before \gset
\if :plant_named
\echo 'PLANT named: a Table a grant names shares its group''s answer'
do $p$ begin execute replace(pg_get_functiondef('custom.tables_seen_once_per_group'::regproc),
  'when v_solo or t.id in (select named.id from named) or', 'when v_solo or'); end $p$;
\endif
\if :plant_arm4
\echo 'PLANT arm4: arm 4 is never asked'
do $p$ begin execute replace(pg_get_functiondef('custom.tables_seen_once_per_group'::regproc),
  'if cardinality(v_left_id) > 0 then', 'if false then'); end $p$;
\endif
select (:'plant' not in ('named', 'arm4')) = (md5(pg_get_functiondef('custom.tables_seen_once_per_group'::regproc)) = :'body_before') as plant_took \gset
\if :plant_took
\else
\echo 'the plant did not change the helper body - the plant text no longer matches the file'
select 1 / 0 as plant_missing;
\endif

select :'plant' = 'old' as plant_old \gset
\if :plant_old
\echo 'PLANT old: the bodies before the file answer the "new" side (clause C must go RED)'
\i migrations/inverse/storereadperf3b_which_tables_she_sees_is_asked_once_per_group_down.sql
\endif

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

-- C
insert into verdict
select 'C', bool_and(n.med <= 0.7 * o.med),
       string_agg(format('%s %s %s -> %s ms (%sx)', o.seat, o.door, round(o.med, 1), round(n.med, 1), round(n.med / o.med, 2)), '; ' order by o.seat, o.door)
  from (select seat, door, percentile_cont(0.5) within group (order by ms)::numeric med from tim where phase = 'old' group by 1, 2) o
  join (select seat, door, percentile_cont(0.5) within group (order by ms)::numeric med from tim where phase = 'new' group by 1, 2) n using (seat, door);

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
