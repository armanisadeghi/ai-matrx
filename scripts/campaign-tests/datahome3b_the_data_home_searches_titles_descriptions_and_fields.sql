-- LANE DATA-HOME-3B — THE DATA HOME SEARCHES TITLES, DESCRIPTIONS AND FIELDS, IN ITS ONE CALL.
--
-- THE REAL USE CASE (Arman, 2026-10-01: "the main data-v2 UI is horrible: no search"): a person types
-- "Service Calls" and the service-call tables come first; types the name of a column ("Furnace model")
-- and finds the one table that has it; and never, for any search, sees a table she may not open.
--
-- What must hold, from the seat's own chair (admin@admin.com by default; -v seat=test@test.com),
-- asked as `authenticated`, the way a browser asks:
--   A. custom.data_home(uuid, text) exists (p_search, defaulted);
--   B. unsearched (no argument, null, blank) the answer is the old one: every Table of
--      custom.data_home_tables(), no rank keys, no 'search' key;
--   C. a title match wins: every row matched in its title ranks above every row matched elsewhere; an
--      exact title is first; "Service Calls" inside the organization that keeps
--      "Rincon Plumbing — Service Calls" finds that table first (admin seat: it must exist);
--   D. a Field label that only one of her Tables carries finds that Table, matched_in = field,
--      matched_field = the label;
--   E. no search ever answers a Table outside her unsearched home — checked with a Table she may NOT
--      open (its title and a Field label of its own) and with broad one-letter searches;
--   F. an organization she cannot reach is refused (42501) naming custom.data_home; a search over 200
--      characters is refused (22023);
--   G. a search costs no more than the unsearched home (warm, best of three, the server's clock).
--
-- RUN IT (clone or production; always rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 [-v seat=test@test.com] -f scripts/campaign-tests/datahome3b_the_data_home_searches_titles_descriptions_and_fields.sql
-- ITS RED: before datahome3_a the two-argument door does not exist (A fails, psql exits 3).

\set ON_ERROR_STOP on
\timing off

\set suite 'datahome3b_the_data_home_searches_titles_descriptions_and_fields.sql'
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
select set_config('dh3.seat', :'seat', true);

select to_regprocedure('custom.data_home(uuid,text)') is not null as door_exists \gset
\if :door_exists
\else
  \echo 'RED'
  do $$ begin raise exception 'A FAILED: custom.data_home(uuid, text) does not exist — the data home cannot search'; end $$;
\endif

-- THE ORACLE (as the store's owner, still as her: the claims stand): her unsearched home, and the
-- Tables and Fields the checks below search for.
set local role authenticated;
create temp table _home on commit drop as select custom.data_home() as h;
create temp table _seen on commit drop as
  select (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org, e ->> 'table_name' as nm
    from _home, jsonb_array_elements(h -> 'tables') e;
reset role;
grant select on _seen to authenticated;

-- D's Field: a label (6+ letters) one of her Tables carries that no other Table she sees carries in a
-- label, a key, its title or its description. "Furnace model" when it is there.
create temp table _field on commit drop as
  with f as (
    select s.id as table_id, s.nm, lower(btrim(fr.data ->> 'label')) as l, btrim(fr.data ->> 'label') as label
      from _seen s
      join custom.record fr
        on fr.organization_id = s.org
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and fr.data ->> 'entity_definition_id' = s.id::text
     where length(btrim(coalesce(fr.data ->> 'label', ''))) >= 6
       and btrim(fr.data ->> 'label') ~ '^[A-Za-z][A-Za-z ]+$'
  ), everything as (
    select s.id, lower(coalesce(s.nm, '') || ' ' || coalesce(t.data ->> 'description', '') || ' ' ||
             coalesce((select string_agg(coalesce(x.data ->> 'label', '') || ' ' || coalesce(x.data ->> 'key', ''), ' ')
                         from custom.record x
                        where x.organization_id = s.org and x.table_id = custom.field_kernel_id()
                          and x.deleted_at is null and x.data ->> 'entity_definition_id' = s.id::text), '')) as txt
      from _seen s join custom.record t on t.organization_id = s.org and t.id = s.id
  )
  select f.table_id, f.nm, f.label
    from f
   where not exists (select 1 from everything e where e.id <> f.table_id and position(f.l in e.txt) > 0)
     and position(f.l in lower(f.nm)) = 0
   order by (f.l = 'furnace model') desc, length(f.l) desc, f.label
   limit 1;

-- E's Table: one she may NOT open — a live Table of an organization other than the ones she sees,
-- with a distinctive title and a Field label of its own (never Arman's organization).
create temp table _unseen on commit drop as
  select t.id, t.organization_id as org, btrim(t.data ->> 'name') as nm,
         (select btrim(fr.data ->> 'label') from custom.record fr
           where fr.organization_id = t.organization_id and fr.table_id = custom.field_kernel_id()
             and fr.deleted_at is null and fr.data ->> 'entity_definition_id' = t.id::text
             and length(btrim(coalesce(fr.data ->> 'label', ''))) >= 6
           order by fr.id limit 1) as label
    from custom.record t
   where t.table_id = custom.table_kernel_id()
     and t.data_class = 'table'
     and t.deleted_at is null
     and t.organization_id <> '3e790542-fdaf-40b2-8bf3-658bf94fe67f'
     and t.id not in (select id from _seen)
     and length(btrim(coalesce(t.data ->> 'name', ''))) >= 10
     and not exists (select 1 from _seen s where lower(s.nm) like '%' || lower(btrim(t.data ->> 'name')) || '%')
   order by (btrim(t.data ->> 'name') = 'Rincon Plumbing — Service Calls') desc, t.updated_at desc
   limit 1;
grant select on _field, _unseen to authenticated;
set local role authenticated;

-- B. UNSEARCHED = THE OLD ANSWER.
create function pg_temp._dh3_sorted(h jsonb) returns jsonb language sql immutable as $f$
  select jsonb_object_agg(k, (select coalesce(jsonb_agg(e order by e::text), '[]'::jsonb) from jsonb_array_elements(h -> k) e))
    from jsonb_object_keys(h) k
$f$;
do $$
declare v_diff int; v_h jsonb := (select h from _home);
begin
  select count(*) into v_diff from (
    (select table_id from custom.data_home_tables() except select id from _seen)
    union all
    (select id from _seen except select table_id from custom.data_home_tables())) d;
  if v_diff <> 0 then raise exception 'B FAILED: the unsearched home differs from custom.data_home_tables() on % Table(s)', v_diff; end if;
  if v_h ? 'search' or exists (select 1 from jsonb_array_elements(v_h -> 'tables') e where e ? 'match_rank') then
    raise exception 'B FAILED: the unsearched home carries search keys';
  end if;
  -- the same rows, compared as sets (jsonb_agg over a set-returning door has no order to promise)
  if pg_temp._dh3_sorted(custom.data_home(null, '   ')) <> pg_temp._dh3_sorted(v_h) or pg_temp._dh3_sorted(custom.data_home(null, null)) <> pg_temp._dh3_sorted(v_h) then
    raise exception 'B FAILED: a blank or null search answers differently from no search';
  end if;
  raise notice 'B passed: unsearched = custom.data_home_tables() (% Tables), blank = null = none', (select count(*) from _seen);
end $$;

-- C. A TITLE MATCH WINS.
do $$
declare
  v_t jsonb; v_last_name int; v_first_other int; v_rincon uuid; v_rincon_org uuid; v_first text;
  v_admin boolean := current_setting('dh3.seat') = 'admin@admin.com'; v_q text;
begin
  v_t := custom.data_home(null, 'Service Calls') -> 'tables';
  if jsonb_array_length(v_t) = 0 then raise exception 'C FAILED: "Service Calls" finds nothing'; end if;
  select max(o) filter (where e ->> 'matched_in' = 'name'), min(o) filter (where e ->> 'matched_in' <> 'name')
    into v_last_name, v_first_other
    from jsonb_array_elements(v_t) with ordinality as a(e, o);
  if v_first_other is not null and v_last_name is not null and v_first_other < v_last_name then
    raise exception 'C FAILED: a row matched outside its title (position %) ranks above a title match (position %)', v_first_other, v_last_name;
  end if;
  if exists (select 1 from _seen where lower(nm) = 'service calls')
     and lower(v_t -> 0 ->> 'table_name') <> 'service calls' then
    raise exception 'C FAILED: the exact title "Service Calls" is not first (first: %)', v_t -> 0 ->> 'table_name';
  end if;
  select id, org into v_rincon, v_rincon_org from _seen where nm = 'Rincon Plumbing — Service Calls' limit 1;
  if v_rincon is null then
    if v_admin then raise exception 'C FAILED: admin@admin.com does not see "Rincon Plumbing — Service Calls" — the case this suite is for'; end if;
    raise notice 'C: this seat does not see "Rincon Plumbing — Service Calls" (E checks it never appears)';
  else
    v_first := custom.data_home(v_rincon_org, 'Service Calls') -> 'tables' -> 0 ->> 'table_name';
    if v_first is distinct from 'Rincon Plumbing — Service Calls' then
      raise exception 'C FAILED: "Service Calls" in its organization finds "%" first, not "Rincon Plumbing — Service Calls"', v_first;
    end if;
    v_first := custom.data_home(null, 'Rincon Plumbing — Service Calls') -> 'tables' -> 0 ->> 'table_name';
    if v_first is distinct from 'Rincon Plumbing — Service Calls' then
      raise exception 'C FAILED: its own full title finds "%" first', v_first;
    end if;
  end if;
  -- best match first, always: over a broad search the ranks never rise down the list
  for v_q in select unnest(array['service', 'calls', 'name', 'Service Calls']) loop
    if exists (select 1 from (select (e ->> 'match_rank')::int as r, lag((e ->> 'match_rank')::int) over (order by o) as prev
                                from jsonb_array_elements(custom.data_home(null, v_q) -> 'tables') with ordinality as a(e, o)) x
                where x.r > x.prev) then
      raise exception 'C FAILED: searching "%" lists a better match below a worse one', v_q;
    end if;
  end loop;
  raise notice 'C passed: "Service Calls" → % first of %; title matches all rank above other matches; best match first',
    v_t -> 0 ->> 'table_name', jsonb_array_length(v_t);
end $$;

-- D. A FIELD FINDS ITS TABLE.
do $$
declare v_f record; v_row jsonb;
begin
  select * into v_f from _field;
  if v_f is null then raise exception 'D FAILED: no Table of this seat has a Field label to search for (fixture)'; end if;
  select e into v_row from jsonb_array_elements(custom.data_home(null, v_f.label) -> 'tables') e
   where (e ->> 'table_id')::uuid = v_f.table_id;
  if v_row is null then
    raise exception 'D FAILED: searching the Field "%" does not find its Table "%"', v_f.label, v_f.nm;
  end if;
  if v_row ->> 'matched_in' <> 'field' or lower(v_row ->> 'matched_field') <> lower(v_f.label) then
    raise exception 'D FAILED: "%" found "%" but says matched_in=% matched_field=%', v_f.label, v_f.nm,
      v_row ->> 'matched_in', v_row ->> 'matched_field';
  end if;
  raise notice 'D passed: the Field "%" finds "%" (matched_in field, rank %)', v_f.label, v_f.nm, v_row ->> 'match_rank';
end $$;

-- E. NO SEARCH ANSWERS A TABLE SHE MAY NOT OPEN.
do $$
declare v_u record; v_q text; v_out int; v_n int := 0;
begin
  select * into v_u from _unseen;
  for v_q in select q from unnest(array[v_u.nm, v_u.label, 'Rincon Plumbing — Service Calls', 'a', 'e', 'service', 'calls', 'name']) q where q is not null loop
    select count(*) into v_out
      from jsonb_array_elements(custom.data_home(null, v_q) -> 'tables') e
     where (e ->> 'table_id')::uuid not in (select id from _seen);
    if v_out > 0 then
      raise exception 'E FAILED: searching "%" answered % Table(s) outside her home', v_q, v_out;
    end if;
    select count(*) into v_out
      from jsonb_array_elements(custom.data_home(null, v_q) -> 'items') e
     where not ((select h from _home) -> 'items') @> jsonb_build_array(e - 'match_rank' - 'matched_in' - 'matched_field');
    if v_out > 0 then
      raise exception 'E FAILED: searching "%" answered % item(s) outside her home', v_q, v_out;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_u.id is null then raise exception 'E FAILED: no Table outside this seat''s home to search for (fixture)'; end if;
  raise notice 'E passed: % searches, incl. the unseen "%" and its Field "%", answered nothing outside her home', v_n, v_u.nm, v_u.label;
end $$;

-- F. REFUSALS IN THE DOOR'S OWN NAME.
do $$
declare v_ok boolean := false;
begin
  begin
    perform custom.data_home('00000000-0000-4000-8000-00000000d3b0'::uuid, 'Service Calls');
  exception when insufficient_privilege then
    v_ok := sqlerrm like '%custom.data_home%';
    if not v_ok then raise exception 'F FAILED: refused, but not in custom.data_home''s name: %', sqlerrm; end if;
  end;
  if not v_ok then raise exception 'F FAILED: an unreachable organization was answered'; end if;
  v_ok := false;
  begin
    perform custom.data_home(null, repeat('x', 201));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'F FAILED: a 201-character search was not refused (22023)'; end if;
  raise notice 'F passed: unreachable organization refused (42501, custom.data_home); 201 characters refused (22023)';
end $$;

-- G. A SEARCH COSTS NO MORE THAN THE HOME.
do $$
declare t0 timestamptz; v_home numeric := 1e9; v_search numeric := 1e9; v_field numeric := 1e9; n int;
        v_label text := (select label from _field);
begin
  for n in 0..3 loop
    t0 := clock_timestamp(); perform custom.data_home();
    if n > 0 then v_home := least(v_home, extract(epoch from clock_timestamp() - t0) * 1000); end if;
    t0 := clock_timestamp(); perform custom.data_home(null, 'Service Calls');
    if n > 0 then v_search := least(v_search, extract(epoch from clock_timestamp() - t0) * 1000); end if;
    t0 := clock_timestamp(); perform custom.data_home(null, v_label);
    if n > 0 then v_field := least(v_field, extract(epoch from clock_timestamp() - t0) * 1000); end if;
  end loop;
  if greatest(v_search, v_field) > v_home * 1.10 + 50 then
    raise exception 'G FAILED: a search took % ms (title) / % ms (field) against % ms for the unsearched home',
      round(v_search), round(v_field), round(v_home);
  end if;
  raise notice 'G passed: warm best of three — home % ms, "Service Calls" % ms, Field search % ms',
    round(v_home), round(v_search), round(v_field);
end $$;

\echo 'GREEN'
rollback;
