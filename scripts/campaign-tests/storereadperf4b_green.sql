-- LANE STORE-READ-PERF-4 (4b) — AN ARCHIVED ORGANIZATION OPENS NOTHING THROUGH THE STORE'S OWN ARMS.
-- Guard for migrations/campaign/storereadperf4b_an_archived_organization_opens_nothing_through_the_stores_own_arms.sql.
-- One rolled-back REPEATABLE READ transaction, the body before the file (its inverse first when live)
-- against the file's:
--   A. census 13 (custom.list_door_disagreements) over every open organization: before, the pairs it
--      names are all in ARCHIVED organizations (RED); after, none (GREEN);
--   B. NOTHING ELSE MOVES: custom.has_visibility and custom.reaches_directly at viewer for both seats
--      over every record of every live organization they are in, identical before and after;
--   C. THE ARCHIVE IS CLOSED: for every person holding a membership, grant or portal seat in an
--      archived organization, every record there answers no after, exactly as the kernel answers.
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storereadperf4b_green.sql
\set ON_ERROR_STOP on
\set QUIET on
\set suite 'storereadperf4b_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin isolation level repeatable read;
set local statement_timeout = 0;
set local transaction_timeout = 0;
set local lock_timeout = '20s';
select position('ARCHIVED ORGANIZATION IS CLOSED, TO EVERYONE' in pg_get_functiondef('custom.reaches_directly'::regproc)) > 0 as file_is_live \gset
\if :file_is_live
\echo 'the file is live here: its inverse is applied first, in this transaction'
\i migrations/inverse/storereadperf4b_an_archived_organization_opens_nothing_through_the_stores_own_arms_down.sql
\endif

create temp table live_pairs as
  select s.id as person, r.id as rid
    from auth.users s
    join iam.organization_member m on m.user_id = s.id
    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
    join custom.record r on r.organization_id = o.id and r.deleted_at is null
   where s.email in ('admin@admin.com', 'test@test.com');
create temp table arch_pairs as
  with arch as (select id from iam.organizations where archived_at is not null),
  people as (
    select m.user_id as person, m.organization_id as org from iam.organization_member m where m.organization_id in (select id from arch)
    union select pp.user_id, pp.organization_id from custom.portal_principal pp where pp.organization_id in (select id from arch) and pp.user_id is not null
    union select g.granted_to_user_id, r.organization_id from iam.permissions g join custom.record r on r.id = g.resource_id
           where r.organization_id in (select id from arch) and g.granted_to_user_id is not null)
  select p.person, r.id as rid from people p join custom.record r on r.organization_id = p.org and r.deleted_at is null;
select (select count(*) from live_pairs) as live_n, (select count(*) from arch_pairs) as arch_n \gset
\echo 'pairs: live' :live_n ' archived' :arch_n

create temp table c13_old as select * from custom.list_door_disagreements(null, null, 200, false);
create temp table live_old as select person, rid, custom.has_visibility(person, 'record', rid, 'viewer') hv,
       custom.reaches_directly(person, 'record', rid, 'viewer') rd from live_pairs;
create temp table arch_old as select person, rid, custom.has_visibility(person, 'record', rid, 'viewer') hv,
       iam.has_access_for(person, 'record', rid, 'viewer') kernel from arch_pairs;

\i migrations/campaign/storereadperf4b_an_archived_organization_opens_nothing_through_the_stores_own_arms.sql

create temp table c13_new as select * from custom.list_door_disagreements(null, null, 200, false);
create temp table live_new as select person, rid, custom.has_visibility(person, 'record', rid, 'viewer') hv,
       custom.reaches_directly(person, 'record', rid, 'viewer') rd from live_pairs;
create temp table arch_new as select person, rid, custom.has_visibility(person, 'record', rid, 'viewer') hv from arch_pairs;

create temp table verdict (clause text, ok boolean, said text);
insert into verdict select 'A-before', count(*) > 0 and bool_and(o.archived_at is not null),
  format('%s pairs named before, %s in archived organizations', count(*), count(*) filter (where o.archived_at is not null))
  from c13_old c join iam.organizations o on o.id = c.organization_id;
insert into verdict select 'A-after', count(*) = 0, format('%s pairs named after', count(*)) from c13_new;
insert into verdict select 'B', count(*) filter (where o.hv is distinct from n.hv or o.rd is distinct from n.rd) = 0,
  format('%s live (seat, record) pairs, %s differ', count(*), count(*) filter (where o.hv is distinct from n.hv or o.rd is distinct from n.rd))
  from live_old o join live_new n using (person, rid);
insert into verdict select 'C', count(*) filter (where n.hv) = 0 and count(*) filter (where o.kernel) = 0,
  format('%s archived (person, record) pairs: before %s open by the store, %s by the kernel; after %s open', count(*),
         count(*) filter (where o.hv), count(*) filter (where o.kernel), count(*) filter (where n.hv))
  from arch_old o join arch_new n using (person, rid);
select clause, case when ok then 'GREEN' else 'RED' end verdict, said from verdict order by clause;
select bool_and(ok) as all_green from verdict \gset
rollback;
\if :all_green
\echo 'GREEN'
\else
\echo 'RED'
select 1 / 0 as red;
\endif
