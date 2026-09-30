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
--   B. custom.seen_among = custom.levels_of's "s" for every scope of every live organization, for both
--      seats and every member of an organization that keeps a scope type.
-- FIXTURES (rolled back with everything else), so the "shown to" context has something to get wrong:
-- one scope test@test.com sees becomes shown_to = my_team (created by a teammate of hers, the
-- teammates part is read), one becomes only_me (created by someone else), and an archived scope type
-- whose rendered document the mask reads.
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
create temp table ans (phase text, seat text, door text, k text, payload text) on commit drop;
grant select on seats, all_orgs, ctx_tables, seat_ctx to authenticated;
grant all on ans to authenticated;

-- FIXTURES. Two scopes test@test.com sees in an organization she shares with admin@admin.com.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'test@test.com'), 'role', 'authenticated')::text, true) \g /dev/null
create temp table fx_seen on commit drop as
  select (e ->> 'id')::uuid as id, (e ->> 'organization_id')::uuid as org
    from jsonb_array_elements(custom.context_tree(array(
           select m.organization_id from iam.organization_member m
            where m.user_id = (select id from auth.users where email = 'test@test.com')
              and m.organization_id in (select organization_id from iam.organization_member
                                         where user_id = (select id from auth.users where email = 'admin@admin.com')))) -> 'scopes') e
   order by 2, 1 limit 2;
select set_config('request.jwt.claims', '', true) \g /dev/null
update custom.record r
   set shown_to = case when r.id = (select min(id::text)::uuid from fx_seen) then 'my_team' else 'only_me' end::platform.shown_to,
       created_by = (select id from auth.users where email = 'admin@admin.com')
  from fx_seen f where r.organization_id = f.org and r.id = f.id;
select count(*) as fixture_scopes from fx_seen \gset
\echo 'shown-to fixture:' :fixture_scopes 'scopes test@test.com sees made my_team / only_me, created by admin@admin.com'

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
      select coalesce(array_agg(r.id order by r.id), '{}') into ids
        from custom.record r where r.organization_id = o.org and r.table_id = o.id and r.deleted_at is null;
      i := 1;
      while i <= greatest(cardinality(ids), 1) loop
        begin
          v := custom.context_values(ids[i:i + 199])::text;
        exception when others then v := 'ERR ' || sqlstate || ' ' || sqlerrm;
        end;
        insert into ans values (p_phase, s.email, 'context_values', o.id::text || '#' || i, v);
        i := i + 200;
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

-- B: seen_among against levels_of's "s", every scope of every live organization, for both seats and
-- every member of an organization that keeps a scope type.
create temp table oracle_people on commit drop as
  select id from seats
  union
  select m.user_id from iam.organization_member m
   where m.organization_id in (select org from ctx_tables);
create temp table all_scopes on commit drop as
  select array_agg(r.id) as ids
    from ctx_tables t join iam.organizations o on o.id = t.org and o.archived_at is null
    join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null;
create temp table oracle on commit drop as
  select p.id as person,
         (select count(*) from unnest(custom.seen_among(p.id, a.ids)) x
           where not coalesce((l.lv -> x::text ->> 's')::boolean, false)) as extra,
         (select count(*) from jsonb_each(l.lv) e
           where (e.value ->> 's')::boolean and not (e.key::uuid = any (custom.seen_among(p.id, a.ids)))) as missing,
         (select count(*) from jsonb_each(l.lv) e where (e.value ->> 's')::boolean) as seen
    from oracle_people p cross join all_scopes a
    cross join lateral (select custom.levels_of(p.id, a.ids) as lv) l;
insert into verdict
select 'B', coalesce(sum(extra + missing), 0) = 0,
       format('%s people x %s scopes, %s (person, scope) pairs seen by levels_of, %s differ',
              count(*), (select cardinality(ids) from all_scopes), sum(seen), sum(extra + missing))
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
