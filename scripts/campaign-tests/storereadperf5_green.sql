-- LANE STORE-READ-PERF-5 — THE SCOPE SCREENS ASK ONLY WHAT THEY SHOW: SAME ANSWERS.
-- Guard for migrations/campaign/storereadperf5_the_scope_screens_ask_only_what_they_show.sql.
--
-- In ONE rolled-back REPEATABLE READ transaction, the bodies before the file (its inverse first when
-- it is live) against the file's, from each seat (`authenticated`, admin@admin.com and test@test.com),
-- byte for byte:
--   A. custom.query_visible_ids(org, Table kernel) for EVERY organization (ids or refusal), and
--      custom.query_visible_ids(org, Table) for every scope Table of her organizations;
--      custom.context_tree over all her organizations; custom.context_values over every scope of every
--      scope type of her organizations (pages of 200, the door's cap); custom.context_archived_types for
--      EVERY organization (answer or refusal); with custom/scope_readers_read_the_store ON (set in this
--      transaction only): public.get_scope_tree for every organization (answer or refusal) and
--      public.get_user_full_context for herself.
--   B. custom.seen_among = custom.levels_of's "s": both seats over every scope of every live
--      organization; every other member of an organization that keeps a scope type over her own
--      organizations' scopes.
-- FIXTURES (rolled back with everything else), so each plant has something to get wrong: a Table in
-- her Table list made my_team by a teammate (the teammates part is read), a scope made only_me by
-- someone else, and a scope granted to her by name in an organization that shows only what is shared.
-- This transaction writes (the DDL, the fixtures, the captures), so every statement memo is OFF here;
-- the memo path is the one storereadperf5_timing.sql times, in READ COMMITTED with nothing written.
--   Plants (-v plant=...): ctx      the "shown to" helper never hands back the teammates (A goes RED)
--                          named    seen_among answers a named record from its class (B goes RED)
--                          archived the archived read keeps a candidate the old filter dropped (A RED)
--
-- RUN IT (dev clone only; always rolled back; several minutes):
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storereadperf5_green.sql
\set ON_ERROR_STOP on
\set suite 'storereadperf5_green.sql'
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
begin isolation level repeatable read;
set local statement_timeout = 0;
set local transaction_timeout = 0;
set local lock_timeout = '10s';

select to_regprocedure('custom.seen_among(uuid,uuid[])') is not null as file_is_live \gset
\if :file_is_live
\echo 'the file is live here: its inverse is applied first, in this transaction'
\i migrations/inverse/storereadperf5_the_scope_screens_ask_only_what_they_show_down.sql
\endif

-- The DB read switch ON for this transaction only (rolled back): the two switched readers answer
-- from the store, which is the path this file changes.
select platform.feature_knob_set('custom', 'scope_readers_read_the_store', 'true'::jsonb) \g /dev/null

create temp table seats on commit drop as
  select u.id, u.email from auth.users u where u.email in ('admin@admin.com', 'test@test.com');
create temp table all_orgs on commit drop as select id from iam.organizations;
create temp table ctx_tables on commit drop as
  select t.organization_id as org, t.id from custom.record t
   where t.table_id = custom.table_kernel_id() and t.deleted_at is null and t.data ->> 'kept_for' = 'context';
create temp table seat_ctx on commit drop as
  select s.email, c.org, c.id
    from seats s join iam.organization_member m on m.user_id = s.id join ctx_tables c on c.org = m.organization_id;
-- Every scope of every scope Table, in pages of 200 (the values door's cap), worked out here as the
-- owner: the seats read nothing but the doors.
create temp table ctx_pages on commit drop as
  select z.tbl, (z.n - 1) / 200 + 1 as page, array_agg(z.id order by z.id) as ids
    from (select r.table_id as tbl, r.id, row_number() over (partition by r.table_id order by r.id) as n
            from ctx_tables c join custom.record r on r.organization_id = c.org and r.table_id = c.id and r.deleted_at is null) z
   group by 1, 2;
create temp table ans (phase text, seat text, door text, k text, payload text) on commit drop;
grant select on seats, all_orgs, ctx_tables, seat_ctx, ctx_pages to authenticated;
grant all on ans to authenticated;

-- FIXTURES (rolled back). (1) A live Table test@test.com's Table list shows in an organization where
-- admin@admin.com is her teammate becomes shown_to = my_team, created by admin@admin.com: the list reads
-- the teammates part of the "shown to" context for it. (2) A scope she sees becomes only_me, created by
-- admin@admin.com. (3) She is granted viewer on one scope of an organization that shows her only what is
-- shared (admin's Workspace): a NAMED record, which walks alone.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'test@test.com'), 'role', 'authenticated')::text, true) \g /dev/null
create temp table fx_team_org on commit drop as
  select e.key::uuid as org from jsonb_each(platform.shown_to_context('record')) e
   where e.value -> 't' ? (select id::text from auth.users where email = 'admin@admin.com')
   order by 1 limit 1;
create temp table fx_team on commit drop as
  select o.org, v.v as id from fx_team_org o cross join lateral custom.query_visible_ids(o.org, custom.table_kernel_id()) v(v)
   order by 2 limit 1;
create temp table fx_seen on commit drop as
  select (e ->> 'id')::uuid as id, (e ->> 'organization_id')::uuid as org
    from jsonb_array_elements(custom.context_tree(array(
           select m.organization_id from iam.organization_member m
            where m.user_id = (select id from auth.users where email = 'test@test.com'))) -> 'scopes') e
   order by 2, 1 limit 1;
create temp table fx_shared_org on commit drop as
  select '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid as org;
create temp table fx_named on commit drop as
  select r.organization_id as org, r.id
    from custom.record t join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
   where t.organization_id = (select org from fx_shared_org) and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
     and not (r.id in (select (e ->> 'id')::uuid from jsonb_array_elements(custom.context_tree(array[(select org from fx_shared_org)]) -> 'scopes') e))
   order by r.id limit 1;
select set_config('request.jwt.claims', '', true) \g /dev/null
update custom.record r set shown_to = 'my_team'::platform.shown_to, created_by = (select id from auth.users where email = 'admin@admin.com')
  from fx_team f where r.organization_id = f.org and r.id = f.id;
update custom.record r set shown_to = 'only_me'::platform.shown_to, created_by = (select id from auth.users where email = 'admin@admin.com')
  from fx_seen f where r.organization_id = f.org and r.id = f.id;
insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
select 'record', f.id, (select id from auth.users where email = 'test@test.com'), 'viewer', 'active',
       (select id from auth.users where email = 'admin@admin.com')
  from fx_named f;
select (select count(*) from fx_team) as fx_team, (select count(*) from fx_seen) as fx_seen, (select count(*) from fx_named) as fx_named \gset
\echo 'fixtures: my_team Table' :fx_team ', only_me scope' :fx_seen ', named (granted) scope' :fx_named
select :fx_team = 1 and :fx_seen = 1 and :fx_named = 1 as fixtures_ok \gset
\if :fixtures_ok
\else
\echo 'a fixture found nothing to stand on - the plants below could not go red'
select 1 / 0 as fixture_missing;
\endif

create function pg_temp.capture(p_phase text) returns void language plpgsql as $$
declare s record; o record; v text; o_ids uuid[]; ids uuid[]; i int;
begin
  for s in select * from seats loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, true);
    for o in select id from all_orgs loop
      begin
        select coalesce(string_agg(x::text, ',' order by x), '') into v
          from custom.query_visible_ids(o.id, custom.table_kernel_id()) x;
      exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
      end;
      insert into ans values (p_phase, s.email, 'query_visible_ids(kernel)', o.id::text, v);
      begin
        v := custom.context_archived_types(o.id)::text;
      exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
      end;
      insert into ans values (p_phase, s.email, 'context_archived_types', o.id::text, v);
      begin
        v := public.get_scope_tree(o.id)::text;
      exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
      end;
      insert into ans values (p_phase, s.email, 'get_scope_tree', o.id::text, v);
    end loop;
    for o in select c.org, c.id from seat_ctx c where c.email = s.email loop
      begin
        select coalesce(string_agg(x::text, ',' order by x), '') into v
          from custom.query_visible_ids(o.org, o.id) x;
      exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
      end;
      insert into ans values (p_phase, s.email, 'query_visible_ids(scope Table)', o.id::text, v);
      for i, ids in select p.page, p.ids from ctx_pages p where p.tbl = o.id order by p.page loop
        begin
          v := custom.context_values(ids)::text;
        exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
        end;
        insert into ans values (p_phase, s.email, 'context_values', o.id::text || '#' || i, v);
      end loop;
    end loop;
    select array_agg(m.organization_id) into o_ids from iam.organization_member m
      join iam.organizations x on x.id = m.organization_id and x.archived_at is null where m.user_id = s.id;
    insert into ans select p_phase, s.email, 'context_tree', null, custom.context_tree(o_ids)::text;
    insert into ans select p_phase, s.email, 'get_user_full_context', null, public.get_user_full_context(null)::text;
  end loop;
end $$;

set local role authenticated;
select pg_temp.capture('old');
reset role;

\i migrations/campaign/storereadperf5_the_scope_screens_ask_only_what_they_show.sql

-- PLANTS: the file's bodies with one of their rules broken, in this transaction only.
select md5(string_agg(pg_get_functiondef(p), '' order by p)) as body_before
  from unnest(array['custom._record_shown_to_ctx(uuid[],uuid)', 'custom.seen_among(uuid,uuid[])',
                    'custom.context_archived_types(uuid)']::regprocedure[]) p \gset
select :'plant' = 'ctx' as plant_ctx, :'plant' = 'named' as plant_named, :'plant' = 'archived' as plant_archived \gset
\if :plant_ctx
\echo 'PLANT ctx: the shown-to helper never hands back the teammates'
do $p$ begin execute replace(pg_get_functiondef('custom._record_shown_to_ctx(uuid[],uuid)'::regprocedure),
  'x.shown_to = ''my_team''::platform.shown_to) then', 'x.shown_to = ''my_team''::platform.shown_to and false) then'); end $p$;
\endif
\if :plant_named
\echo 'PLANT named: seen_among answers a named record from its class'
do $p$ begin execute replace(pg_get_functiondef('custom.seen_among(uuid,uuid[])'::regprocedure),
  'v_key := case when v_fk or r.named then null', 'v_key := case when v_fk then null'); end $p$;
\endif
\if :plant_archived
\echo 'PLANT archived: the archived read keeps every candidate, rendered kept_for or not'
do $p$ begin execute replace(pg_get_functiondef('custom.context_archived_types(uuid)'::regprocedure),
  'where d.doc ->> ''kept_for'' = ''context'') z);', 'where true) z);'); end $p$;
do $p$ begin execute replace(pg_get_functiondef('custom.context_archived_types(uuid)'::regprocedure),
  'and r.data ->> ''kept_for'' = ''context'';', ';'); end $p$;
\endif
select (:'plant' = 'none') = (md5(string_agg(pg_get_functiondef(p), '' order by p)) = :'body_before') as plant_took
  from unnest(array['custom._record_shown_to_ctx(uuid[],uuid)', 'custom.seen_among(uuid,uuid[])',
                    'custom.context_archived_types(uuid)']::regprocedure[]) p \gset
\if :plant_took
\else
\echo 'the plant did not change the body - the plant text no longer matches the file'
select 1 / 0 as plant_missing;
\endif

set local role authenticated;
select pg_temp.capture('new');
reset role;

create temp table verdict (clause text, ok boolean, said text) on commit drop;
insert into verdict
select 'A', count(*) filter (where o.payload is distinct from n.payload) = 0,
       format('%s answers compared (%s refusals among them), %s differ: %s', count(*),
              count(*) filter (where o.payload like 'ERR%'),
              count(*) filter (where o.payload is distinct from n.payload),
              coalesce(string_agg(distinct o.seat || '/' || o.door, ', ') filter (where o.payload is distinct from n.payload), '-'))
  from ans o join ans n on n.seat = o.seat and n.door = o.door and n.k is not distinct from o.k
                       and o.phase = 'old' and n.phase = 'new';

-- B: seen_among against levels_of's "s": both seats over every scope of every live organization, and
-- every other member of an organization that keeps a scope type over the scopes of the organizations
-- she belongs to (what get_scope_tree and get_user_full_context ask about her).
create temp table oracle_asks on commit drop as
  select s.id as person, array_agg(r.id) as ids
    from seats s
    cross join ctx_tables t
    join iam.organizations o on o.id = t.org and o.archived_at is null
    join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
   group by s.id
  union all
  select m.user_id, array_agg(r.id)
    from (select distinct user_id, organization_id from iam.organization_member
           where organization_id in (select org from ctx_tables)
             and user_id not in (select id from seats)) m
    join ctx_tables t on t.org = m.organization_id
    join iam.organizations o on o.id = t.org and o.archived_at is null
    join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
   group by m.user_id;
-- Each person's two answers are worked out ONCE (materialized: a scalar subquery pulled into the
-- outer query would be asked again at every reference).
create temp table oracle_answers on commit drop as
  select a.person, cardinality(a.ids) as asked,
         custom.levels_of(a.person, a.ids) as lv, custom.seen_among(a.person, a.ids) as seen
    from oracle_asks a;
create temp table oracle on commit drop as
  with ls as materialized (
    select o.person, e.key::uuid as id from oracle_answers o, jsonb_each(o.lv) e where (e.value ->> 's')::boolean),
  ss as materialized (select o.person, x as id from oracle_answers o, unnest(o.seen) x)
  select o.person, o.asked,
         (select count(*) from ss where ss.person = o.person
             and not exists (select 1 from ls where ls.person = ss.person and ls.id = ss.id)) as extra,
         (select count(*) from ls where ls.person = o.person
             and not exists (select 1 from ss where ss.person = ls.person and ss.id = ls.id)) as missing,
         (select count(*) from ls where ls.person = o.person) as seen
    from oracle_answers o;
insert into verdict
select 'B', coalesce(sum(extra + missing), 0) = 0,
       format('%s people, %s (person, scope) pairs asked, %s seen by levels_of, %s differ',
              count(*), sum(asked), sum(seen), sum(extra + missing))
  from oracle;

select o.seat, o.door, o.k, left(o.payload, 300) as old_payload, left(n.payload, 300) as new_payload
  from ans o join ans n on n.seat = o.seat and n.door = o.door and n.k is not distinct from o.k
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
