-- LANE SCOPES-READS-ACCESS — THE ACCESS KERNEL'S LIST OF SCOPES READS THE RECORD STORE (chair ruling 2026-09-29 (6)):
-- shadow compare on the dev clone, rolled back.
--
-- iam.accessible_entity_ids('scope', level, depth, include_public) is every list of scopes the kernel answers (the old
-- scope row security itself asks it). For every signed-in person and every level (viewer, editor, admin), with and
-- without the public arm, the list is computed with the old body, the new body is applied inside the same REPEATABLE
-- READ transaction, and the list is computed again; the sorted id arrays must be equal. RED: a planted divergence (one
-- scope's creator changed in the store only) must change that creator's list.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_the_kernel_lists_scopes_from_the_store_compare.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?world_until}
\else
\echo 'pass -v world_until=<the clone promotion time from common-docs/operations/clone/CLONE-REF>'
\quit
\endif

set transaction_timeout = '40min';
begin isolation level repeatable read;
set local statement_timeout = 0;
set local lock_timeout = '30s';

-- the world: scopes as the clone copied them (another lane's later scopes have no store twin on the clone)
create temp table k_world on commit drop as select s.id from context.scopes s where s.created_at <= :'world_until'::timestamptz;
create temp table k_ans (side text, uid uuid, lvl text, pub boolean, ids uuid[], primary key (side, uid, lvl, pub)) on commit drop;

create function pg_temp.k_run(p_side text) returns int language plpgsql as $f$
declare u record; l text; p boolean; n int := 0; v uuid[];
begin
  for u in select id from auth.users order by id loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    foreach l in array array['viewer', 'editor', 'admin'] loop
      foreach p in array array[true, false] loop
        v := array(select x from unnest(iam.accessible_entity_ids('scope', l::public.permission_level, 0, p)) x
                    where x in (select id from k_world) order by 1);
        insert into k_ans values (p_side, u.id, l, p, v);
        n := n + 1;
      end loop;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  return n;
end $f$;

select clock_timestamp() as old_start, pg_temp.k_run('old') as lists, clock_timestamp() as old_end;
\i migrations/campaign/scopesaccess_the_kernel_lists_scopes_from_the_store.sql
select clock_timestamp() as new_start, pg_temp.k_run('new') as lists, clock_timestamp() as new_end;

-- RED: a scope handed, in the store only, to a person outside its organization — her list must gain it
savepoint k_planted;
create temp table k_plant on commit drop as
  select s.id, s.organization_id,
         (select u.id from auth.users u where not exists (select 1 from iam.memberships m where m.user_id = u.id
             and m.container_id = s.organization_id and m.deleted_at is null) order by u.id limit 1) as outsider
    from context.scopes s join custom.record r on r.id = s.id
   where s.deleted_at is null and s.id in (select id from k_world) order by s.id limit 1;
update custom.record set created_by = (select outsider from k_plant) where id = (select id from k_plant);
do $red$
declare v_before uuid[]; v_after uuid[];
begin
  select ids into v_before from k_ans where side = 'new' and uid = (select outsider from k_plant) and lvl = 'viewer' and pub;
  perform set_config('request.jwt.claims', json_build_object('sub', (select outsider from k_plant), 'role', 'authenticated')::text, true);
  v_after := array(select x from unnest(iam.accessible_entity_ids('scope', 'viewer'::public.permission_level, 0, true)) x
                    where x in (select id from k_world) order by 1);
  perform set_config('request.jwt.claims', '', true);
  if v_after is not distinct from v_before then
    raise exception 'RED FAILED: the planted creator change did not move her list';
  end if;
  raise notice 'RED: the planted creator change moved her list (% -> % scopes)', cardinality(v_before), cardinality(v_after);
end $red$;
rollback to savepoint k_planted;

select o.lvl, o.pub, count(*) as lists, count(*) filter (where o.ids is distinct from n.ids) as mismatches,
       sum(cardinality(o.ids)) as scopes_listed
  from k_ans o join k_ans n on n.side = 'new' and n.uid = o.uid and n.lvl = o.lvl and n.pub = o.pub
 where o.side = 'old' group by 1, 2 order by 1, 2;
do $green$
declare v int;
begin
  select count(*) into v from k_ans o join k_ans n on n.side = 'new' and n.uid = o.uid and n.lvl = o.lvl and n.pub = o.pub
   where o.side = 'old' and o.ids is distinct from n.ids;
  if v > 0 then raise exception 'RED: % lists of scopes differ', v; end if;
  raise notice 'GREEN: every person''s list of scopes is the same at every level, with and without the public arm';
end $green$;
rollback;
