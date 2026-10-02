-- LANE SCOPES-TREE-PAGED — THE PAGED DOORS ANSWER THE SAME ROWS AS THE WHOLE TREE.
-- Guard for migrations/campaign/scopestreepaged_the_tree_paints_its_types_first.sql.
--
-- From each seat (`authenticated`: admin@admin.com, test@test.com), over every live organization she
-- belongs to, in ONE rolled-back transaction (the file applied inside it when it is not live):
--   A. custom.context_tree_types(orgs, false) = custom.context_tree(orgs).types, element for element.
--   B. custom.context_tree_types(orgs, true): each type = the same object + scope_count, and scope_count
--      = the number of scopes custom.context_tree answers for that type.
--   C. every type: custom.context_tree_type_scopes pages of 200 AND pages of 7, concatenated, = that
--      type's scopes in custom.context_tree's answer, in its order, object for object; total = count.
--   D. custom.context_tree_search(orgs, q, 500) for q in a set of real texts plus '%' and '_' (literal
--      characters, never wildcards) = the whole tree's scopes whose name holds q (case-insensitive),
--      same ids, same total.
--   E. an organization she is not a member of: each door refuses with the SQLSTATE custom.context_tree
--      refuses with.
-- Plants (-v plant=...): count (scope_count + 1), order (pages ordered by id), escape ('%' unescaped),
-- empty (both seats' organization lists emptied, so nothing is compared): each must go RED.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0. A run
-- that compared no scope type for a seat is RED, never "0 differences" — a pass over an empty tree is
-- unmeasured (lane SCOPES-ON-THE-STORE M2, 2026-10-02: the web parity harness passed over 0
-- organizations on clone-20261001 for exactly that reason).
--
-- RUN IT (dev clone only; rolled back):
--   cd matrx-frontend && psql "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/scopestreepaged_same_rows_as_the_tree.sql
\set ON_ERROR_STOP on
\set suite 'scopestreepaged_same_rows_as_the_tree.sql'
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
begin;
set local statement_timeout = 0;
set local lock_timeout = '10s';
select to_regprocedure('custom.context_tree_types(uuid[],boolean)') is null as file_absent \gset
\if :file_absent
\echo 'the file is not live here: applied inside this transaction'
\i migrations/campaign/scopestreepaged_the_tree_paints_its_types_first.sql
\endif

-- PLANTS: the helper's own body, one phrase changed, re-created inside this transaction.
create function pg_temp.plant(p_from text, p_to text) returns void language plpgsql as $$
declare d text := pg_get_functiondef('custom._ctx_tree_part(uuid,uuid[],uuid[],text,uuid[],text,integer,integer)'::regprocedure);
begin
  if position(p_from in d) = 0 then raise exception 'plant: phrase not found: %', p_from; end if;
  execute replace(d, p_from, p_to);
end $$;
select case :'plant'
  when 'count'  then pg_temp.plant('coalesce(cnt.n, 0))', 'coalesce(cnt.n, 0) + 1)')::text
  when 'order'  then pg_temp.plant('coalesce((m.data ->> ''sort_order'')::numeric, 0), m.data ->> ''name'', m.id) as rn', 'm.id) as rn')::text
  when 'escape' then pg_temp.plant('''%'', ''\%''', '''%'', ''%''')::text
  else 'none' end as planted \gset
\echo 'plant:' :plant

create temp table seats on commit drop as
  select u.id, u.email,
         array(select m.organization_id from iam.organization_member m
                 join iam.organizations o on o.id = m.organization_id and o.archived_at is null
                where m.user_id = u.id order by 1) as orgs
    from auth.users u where u.email in ('admin@admin.com', 'test@test.com');
select :'plant' = 'empty' as plant_empty \gset
\if :plant_empty
update seats set orgs = '{}';
\endif
create temp table bad (seat text, check_name text, k text, detail text) on commit drop;
create temp table done (seat text, check_name text, n int) on commit drop;
grant select on seats to authenticated;
grant all on bad, done to authenticated;

create function pg_temp.run() returns void language plpgsql as $$
declare s record; whole jsonb; lst jsonb; cnt jsonb; t jsonb; want jsonb; got jsonb; page jsonb;
        off int; q text; n int; other uuid; st_whole text; st_new text; ps int;
begin
  for s in select * from seats loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, true);
    whole := custom.context_tree(s.orgs);
    lst := custom.context_tree_types(s.orgs, false);
    cnt := custom.context_tree_types(s.orgs, true);
    -- A
    if lst -> 'types' is distinct from whole -> 'types' then
      insert into bad values (s.email, 'A types', '', format('%s vs %s types', jsonb_array_length(lst->'types'), jsonb_array_length(whole->'types')));
    end if;
    insert into done values (s.email, 'A types', jsonb_array_length(whole -> 'types'));
    -- B + C
    n := 0;
    for t in select e from jsonb_array_elements(cnt -> 'types') e loop
      n := n + 1;
      want := coalesce((select jsonb_agg(sc order by o) from jsonb_array_elements(whole -> 'scopes') with ordinality x(sc, o)
                         where sc ->> 'scope_type_id' = t ->> 'id'), '[]'::jsonb);
      if (t - 'scope_count') is distinct from (select e from jsonb_array_elements(whole -> 'types') e where e ->> 'id' = t ->> 'id') then
        insert into bad values (s.email, 'B type object', t ->> 'id', 'differs');
      end if;
      if (t ->> 'scope_count')::int <> jsonb_array_length(want) then
        insert into bad values (s.email, 'B scope_count', t ->> 'id', format('%s vs %s', t ->> 'scope_count', jsonb_array_length(want)));
      end if;
      foreach ps in array array[200, 7] loop
        got := '[]'::jsonb; off := 0;
        loop
          page := custom.context_tree_type_scopes((t ->> 'id')::uuid, off, ps);
          if (page ->> 'total')::int <> jsonb_array_length(want) then
            insert into bad values (s.email, 'C total', t ->> 'id', format('page %s: %s vs %s', ps, page ->> 'total', jsonb_array_length(want)));
          end if;
          got := got || (page -> 'scopes');
          exit when page ->> 'next_offset' is null;
          off := (page ->> 'next_offset')::int;
        end loop;
        if got is distinct from want then
          insert into bad values (s.email, 'C pages', t ->> 'id', format('pages of %s: %s vs %s scopes', ps, jsonb_array_length(got), jsonb_array_length(want)));
        end if;
      end loop;
    end loop;
    insert into done values (s.email, 'B+C types paged', n);
    -- D
    foreach q in array array['a', 're', 'Clinic', 'pt', 'TAG', '%', '_', 'zzqx no such name'] loop
      want := coalesce((select jsonb_agg(sc ->> 'id' order by sc ->> 'id') from jsonb_array_elements(whole -> 'scopes') sc
                         where strpos(lower(sc ->> 'name'), lower(q)) > 0), '[]'::jsonb);
      page := custom.context_tree_search(s.orgs, q, 500);
      got := coalesce((select jsonb_agg(sc ->> 'id' order by sc ->> 'id') from jsonb_array_elements(page -> 'scopes') sc), '[]'::jsonb);
      if jsonb_array_length(want) <= 500 and got is distinct from want then
        insert into bad values (s.email, 'D search', q, format('%s vs %s ids', jsonb_array_length(got), jsonb_array_length(want)));
      end if;
      if (page ->> 'total')::int <> jsonb_array_length(want) then
        insert into bad values (s.email, 'D search total', q, format('%s vs %s', page ->> 'total', jsonb_array_length(want)));
      end if;
      -- every answered scope object is the tree's own object
      if exists (select 1 from jsonb_array_elements(page -> 'scopes') sc
                  where sc is distinct from (select w from jsonb_array_elements(whole -> 'scopes') w where w ->> 'id' = sc ->> 'id')) then
        insert into bad values (s.email, 'D search object', q, 'an answered scope differs from the tree''s');
      end if;
    end loop;
    insert into done values (s.email, 'D searches', 8);
    -- E
    for other in select o.id from iam.organizations o
     where o.archived_at is null and not (o.id = any (s.orgs))
       and not exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = s.id)
     order by o.id limit 25 loop
      begin perform custom.context_tree(array[other]); st_whole := 'ok';
      exception when others then st_whole := sqlstate; end;
      begin perform custom.context_tree_types(array[other], true); st_new := 'ok';
      exception when others then st_new := sqlstate; end;
      if st_new <> st_whole then insert into bad values (s.email, 'E refusal types', other::text, st_new || ' vs ' || st_whole); end if;
      begin perform custom.context_tree_search(array[other], 'a', 10); st_new := 'ok';
      exception when others then st_new := sqlstate; end;
      if st_new <> st_whole then insert into bad values (s.email, 'E refusal search', other::text, st_new || ' vs ' || st_whole); end if;
      begin perform custom.context_tree_type_scopes(
              (select t2.id from custom.record t2 where t2.organization_id = other and t2.table_id = custom.table_kernel_id()
                  and t2.deleted_at is null and t2.data ->> 'kept_for' = 'context' limit 1), 0, 10);
            st_new := 'ok';
      exception when others then st_new := sqlstate; end;
      if st_new <> st_whole and st_new <> 'ok' then insert into bad values (s.email, 'E refusal type_scopes', other::text, st_new || ' vs ' || st_whole); end if;
      insert into done values (s.email, 'E refusal (' || st_whole || ')', 1);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

select pg_temp.run();
\set QUIET off
select seat, check_name, sum(n) as n from done group by 1, 2 order by 1, 2;
select seat, check_name, k, detail from bad order by 1, 2, 3 limit 40;
select count(*) as differences from bad \gset
\if :{?differences}
\endif
-- Both seats must have had scope types to compare: a seat with none measured nothing.
select count(*) as measured_seats from (select seat from done where check_name = 'A types' group by seat having sum(n) > 0) m \gset
select case when :differences = 0 and :measured_seats = 2 then 'GREEN — 0 differences over both seats (plant ' || :'plant' || ')'
            when :measured_seats < 2 then 'RED — UNMEASURED: ' || (2 - :measured_seats) || ' seat(s) had no scope type to compare (plant ' || :'plant' || ')'
            else 'RED — ' || :differences || ' differences (plant ' || :'plant' || ')' end as verdict \gset
\echo :verdict
select :differences = 0 and :measured_seats = 2 as green \gset
\if :green
rollback;
\else
rollback;
do $$ begin raise exception 'scopestreepaged_same_rows_as_the_tree.sql is RED: the paged doors did not answer the same rows as the whole tree for both seats (or a seat had nothing to compare) — see the rows above.'; end $$;
\endif
