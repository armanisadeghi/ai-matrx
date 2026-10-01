-- datahome3b2_the_data_home_names_each_tables_maker.sql — lane DATA-HOME-3B2, 2026-10-01.
--
-- The data home's Owner column had only the maker's id, so it read "You" for her own Tables and "—"
-- for everyone else's. custom.data_home now names the maker in the same call.
--
-- What must hold, from the seat's own chair (admin@admin.com by default; -v seat=test@test.com):
--   A. Every Table row of the home carries created_by_name (searched or not).
--   B. The name is the store's people door's own: custom.history_people(<the Table's organization>,
--      {created_by}) ->> name, null exactly when that door has no such member (or there is no maker).
--   C. Somebody else's Table is named: at least one row made by another person carries a name
--      (the reported defect: every such row read "—"). Skipped, by name, if the seat has none.
--   D. Naming costs at most 150 ms on top of the home (the naming step alone, best of three, on the
--      home's own rows) — the DATA-HOME-2 budget is not spent on it.
--
--   psql "<DSN>" -v ON_ERROR_STOP=1 [-v seat=test@test.com] -f scripts/campaign-tests/datahome3b2_the_data_home_names_each_tables_maker.sql
-- Read-only; everything happens inside one rolled-back transaction.

\set ON_ERROR_STOP on
\timing off

\set suite 'datahome3b2_the_data_home_names_each_tables_maker.sql'
\if :{?seat}
\else
  \set seat 'admin@admin.com'
\endif
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin isolation level repeatable read;
set local statement_timeout = '10min';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = :'seat'), 'role', 'authenticated')::text, true);

set local role authenticated;
create temp table _home on commit drop as select custom.data_home() as h;
create temp table _found on commit drop as select custom.data_home(null, 'a') as h;
reset role;

create temp table _rows on commit drop as
  select (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org,
         (e ->> 'created_by')::uuid as maker, e ? 'created_by_name' as has_key, e ->> 'created_by_name' as nm
    from _home, jsonb_array_elements(h -> 'tables') e;

-- A. EVERY ROW CARRIES THE KEY.
do $$
declare v_n int := (select count(*) from _rows); v_missing int;
begin
  if v_n = 0 then raise exception 'A FAILED: this seat''s home lists no Table (fixture)'; end if;
  select count(*) into v_missing from _rows where not has_key;
  if v_missing > 0 then
    raise exception 'A FAILED: % of % Table rows carry no created_by_name', v_missing, v_n;
  end if;
  select count(*) into v_missing from _found, jsonb_array_elements(h -> 'tables') e where not e ? 'created_by_name';
  if v_missing > 0 then
    raise exception 'A FAILED: % searched Table row(s) carry no created_by_name', v_missing;
  end if;
  raise notice 'A passed: all % Table rows (and every searched row) carry created_by_name', v_n;
end $$;

-- B. THE NAME IS THE PEOPLE DOOR'S OWN.
do $$
declare v_bad int; v_named int;
begin
  select count(*) into v_bad
    from _rows r
   where r.nm is distinct from
         case when r.maker is null then null
              else custom.history_people(r.org, array[r.maker]) #>> array[r.maker::text, 'name'] end;
  if v_bad > 0 then
    raise exception 'B FAILED: % Table row(s) name their maker differently from custom.history_people', v_bad;
  end if;
  select count(*) into v_named from _rows where nm is not null;
  raise notice 'B passed: every name is custom.history_people''s (% named, % without a member maker)',
    v_named, (select count(*) from _rows where nm is null);
end $$;

-- C. SOMEBODY ELSE'S TABLE IS NAMED.
do $$
declare v_me uuid := (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid; v_others int; v_named int;
begin
  select count(*), count(nm) into v_others, v_named from _rows where maker is not null and maker <> v_me;
  if v_others = 0 then
    raise notice 'C skipped: every Table this seat sees is her own';
  elsif v_named = 0 then
    raise exception 'C FAILED: none of % Tables made by somebody else names its maker', v_others;
  else
    raise notice 'C passed: % of % Tables made by somebody else name their maker', v_named, v_others;
  end if;
end $$;

-- D. NAMING COSTS AT MOST 150 MS.
do $$
declare t0 timestamptz; v_best numeric := 1e9; n int; v_t jsonb := (select h -> 'tables' from _home); v_out jsonb;
begin
  for n in 1..3 loop
    t0 := clock_timestamp();
    with mk as (
      select (e ->> 'organization_id')::uuid as org, array_agg(distinct (e ->> 'created_by')::uuid) as ids
        from jsonb_array_elements(v_t) e where e ->> 'created_by' is not null group by 1
    ), people as materialized (select mk.org, custom.history_people(mk.org, mk.ids) as m from mk)
    select jsonb_agg(t.e || jsonb_build_object('created_by_name', p.m #>> array[t.e ->> 'created_by', 'name'])
             order by t.o)
      into v_out from jsonb_array_elements(v_t) with ordinality as t(e, o)
      left join people p on p.org = (t.e ->> 'organization_id')::uuid;
    v_best := least(v_best, extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
  if v_best > 150 then
    raise exception 'D FAILED: naming % Tables took % ms (budget 150 ms)', jsonb_array_length(v_t), round(v_best);
  end if;
  raise notice 'D passed: naming % Tables takes % ms (best of three)', jsonb_array_length(v_t), round(v_best, 1);
end $$;

\echo 'GREEN'
rollback;
