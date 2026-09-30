-- LANE SCOPES-READS-ACCESS — THE ACCESS KERNEL ANSWERS A SCOPE TYPE FROM ITS TABLE (chair ruling 2026-09-29 (6)):
-- shadow compare on the dev clone, rolled back.
--
-- platform.entity_row_access_attrs('context', 'scope_types', id) — the row facts the kernel decides a scope type with —
-- for every scope type and thirty ids that are nothing: old body, then the new body applied inside the same REPEATABLE
-- READ transaction, answers compared. The clone predates the nameless-author carry (lane SCOPES-STORE-HOMES, production
-- 03:09Z; Step 1's Copy again), so the fixture first gives each Table its old row's creator, as that carry does on
-- production — the file itself refuses where that is not yet true. RED: a planted store-only creator change.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_the_kernel_answers_a_scope_type_from_the_store_compare.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

set transaction_timeout = '20min';
begin isolation level repeatable read;
set local statement_timeout = 0;
set local lock_timeout = '30s';

\if :{?world_until}
\else
\echo 'pass -v world_until=<the clone promotion time from common-docs/operations/clone/CLONE-REF>'
\quit
\endif
-- the world as the clone copied it: a scope type another lane made on the clone later has no Table there (the clone
-- runs no follow); inside this rolled-back transaction it is taken out, with its scopes and fields
delete from context.context_item_values v using context.scopes s, context.scope_types st
 where v.scope_id = s.id and s.scope_type_id = st.id and st.created_at > :'world_until'::timestamptz;
delete from context.scopes s using context.scope_types st where s.scope_type_id = st.id and st.created_at > :'world_until'::timestamptz;
delete from context.context_items i using context.scope_types st where i.scope_type_id = st.id and st.created_at > :'world_until'::timestamptz;
delete from context.scope_types st where st.created_at > :'world_until'::timestamptz;
-- the carried copy, as the nameless-author carry leaves it on production
update custom.record t set created_by = s.created_by
  from context.scope_types s where t.id = s.id and t.organization_id = s.organization_id and t.created_by is distinct from s.created_by;

create temp table a_ids on commit drop as
  select id from context.scope_types union all select gen_random_uuid() from generate_series(1, 30);
create temp table a_ans (side text, id uuid, v jsonb) on commit drop;
insert into a_ans select 'old', i.id, (select to_jsonb(a) from platform.entity_row_access_attrs('context', 'scope_types', i.id) a) from a_ids i;
\i migrations/campaign/scopesaccess_the_kernel_answers_a_scope_type_from_the_store.sql
insert into a_ans select 'new', i.id, (select to_jsonb(a) from platform.entity_row_access_attrs('context', 'scope_types', i.id) a) from a_ids i;

savepoint a_planted;
update custom.record set created_by = (select id from auth.users order by id limit 1)
 where id = (select id from context.scope_types order by id limit 1)
   and created_by is distinct from (select id from auth.users order by id limit 1);
do $red$
declare v_now jsonb;
begin
  select to_jsonb(a) into v_now from platform.entity_row_access_attrs('context', 'scope_types', (select id from context.scope_types order by id limit 1)) a;
  if v_now is not distinct from (select x.v from a_ans x where x.side = 'old' and x.id = (select id from context.scope_types order by id limit 1)) then
    raise exception 'RED FAILED: the planted creator change did not reach the kernel''s answer';
  end if;
  raise notice 'RED: the planted creator change moved the answer';
end $red$;
rollback to savepoint a_planted;

select count(*) as answers, count(*) filter (where o.v is distinct from n.v) as mismatches,
       count(*) filter (where (o.v ->> 'o_found')::boolean) as found
  from a_ans o join a_ans n on n.side = 'new' and n.id = o.id where o.side = 'old';
do $green$
begin
  if exists (select 1 from a_ans o join a_ans n on n.side = 'new' and n.id = o.id where o.side = 'old' and o.v is distinct from n.v) then
    raise exception 'RED: a scope type''s row facts differ';
  end if;
  raise notice 'GREEN: every scope type (and every id that is nothing) answers the same';
end $green$;
rollback;
