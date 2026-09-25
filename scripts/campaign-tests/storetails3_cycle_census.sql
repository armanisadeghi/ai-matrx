-- LANE STORE-TAILS-3 — THE GUARD: NO LIVE WORKED-OUT COLUMN READS ITSELF ROUND A CIRCLE.
--
-- A formula, lookup or rollup reads other columns (formula leaves by id or same-table key; a
-- lookup's or rollup's relation column and the far column it picks or adds up), across tables and
-- through other worked-out columns. A column whose walk comes back to itself has no answer: before
-- storetails3_a_worked_out_column_never_reads_itself.sql such a read recursed until the stack ran
-- out. New circles are refused at declare time; this counts the ones already stored.
--
-- SELF-CONTAINED: it reads only `custom.record` with its own recursive walk (the STORE-LEAK-FORMULA
-- census's step graph, live columns only — a retired column is never worked out). Writes nothing.
-- It also reports, as information, how many pairs of tables point at each other through a lookup
-- or rollup in each direction (the shape that overflowed WITHOUT being a circle).
--
-- RED: any live worked-out column on a circle — each named with its table. GREEN: none.

\set ON_ERROR_STOP on
\timing off

do $census$
declare
  v_bad   bigint;
  v_all   bigint;
  v_pairs bigint;
  v_list  text;
begin
  with recursive
  fk as (select '11111111-0000-4000-8000-000000000002'::uuid as id),
  fld as materialized (
    select f.organization_id as org, f.id, f.data,
           f.data ->> 'entity_definition_id' as tbl, f.data ->> 'key' as key
      from custom.record f, fk
     where f.table_id = fk.id and f.data_class <> 'kernel' and f.deleted_at is null),
  worked as materialized (
    select * from fld
     where data ->> 'type' = 'formula'
       and (data -> 'config' ?| array['expr', 'pick', 'agg'])),
  refs as (
    select w.org, w.id, w.tbl, v #>> '{}' as ref
      from worked w,
           jsonb_path_query(coalesce(w.data -> 'config' -> 'expr', 'null'::jsonb), 'strict $.**.field') v
     where jsonb_typeof(v) = 'string'
    union
    select w.org, w.id, w.tbl, v #>> '{}'
      from worked w,
           jsonb_path_query(coalesce(w.data -> 'config' -> 'expr', 'null'::jsonb), 'strict $.**.parent_field') v
     where jsonb_typeof(v) = 'string'),
  step(org, id, input_id) as (
    select r.org, r.id, i.id from refs r join fld i on i.org = r.org and i.id::text = lower(r.ref)
    union
    select r.org, r.id, i.id from refs r join fld i on i.org = r.org and i.tbl = r.tbl and i.key = r.ref
    union
    select w.org, w.id, v.id
      from worked w join fld v on v.org = w.org and v.tbl = w.tbl and v.key = w.data -> 'config' ->> 'via'
    union
    select w.org, w.id, far.id
      from worked w
      join fld v   on v.org = w.org and v.tbl = w.tbl and v.key = w.data -> 'config' ->> 'via'
      join fld far on far.org = w.org and far.tbl = v.data ->> 'relation_target'
                  and far.key = coalesce(w.data -> 'config' ->> 'pick', w.data -> 'config' ->> 'of')),
  closure(org, id, input_id) as (
    select org, id, input_id from step
    union
    select c.org, c.id, s.input_id
      from closure c join step s on s.org = c.org and s.id = c.input_id)
  select count(distinct (c.org, c.id)),
         string_agg(distinct format('%s / %s › %s', c.org, coalesce(t.data ->> 'name', w.tbl),
                                    coalesce(w.data ->> 'label', w.data ->> 'key')), E'\n    ')
    into v_bad, v_list
    from closure c
    join worked w on w.org = c.org and w.id = c.id
    left join custom.record t on t.organization_id = w.org and t.id::text = w.tbl
   where c.input_id = c.id;

  select count(*) into v_all
    from custom.record f
   where f.table_id = '11111111-0000-4000-8000-000000000002'::uuid and f.data_class <> 'kernel'
     and f.deleted_at is null and f.data ->> 'type' = 'formula'
     and (f.data -> 'config' ?| array['expr', 'pick', 'agg']);

  -- INFORMATION: pairs of tables that point at each other through a lookup/rollup both ways.
  with fld as (
    select f.organization_id as org, f.data ->> 'entity_definition_id' as tbl, f.data
      from custom.record f
     where f.table_id = '11111111-0000-4000-8000-000000000002'::uuid and f.data_class <> 'kernel'
       and f.deleted_at is null),
  far as (
    select w.org, w.tbl as from_tbl, v.data ->> 'relation_target' as to_tbl
      from fld w join fld v on v.org = w.org and v.tbl = w.tbl and v.data ->> 'key' = w.data -> 'config' ->> 'via'
     where w.data ->> 'type' = 'formula' and w.data -> 'config' ?| array['pick', 'agg'])
  select count(*) into v_pairs
    from (select distinct a.org, least(a.from_tbl, a.to_tbl), greatest(a.from_tbl, a.to_tbl)
            from far a join far b on b.org = a.org and b.from_tbl = a.to_tbl and b.to_tbl = a.from_tbl
           where a.from_tbl <> a.to_tbl) x;

  if v_bad > 0 then
    raise exception 'STORE-TAILS-3 CYCLE GUARD RED: % of % live worked-out columns read themselves round a circle (% pairs of tables point at each other through lookups/rollups):%    %',
                    v_bad, v_all, v_pairs, E'\n', v_list
      using errcode = '23514',
            hint = 'A formula, lookup or rollup that reads itself has no answer; custom.far_value refuses it on read with a sentence. Point one column of each circle at something outside it.';
  end if;
  raise notice 'STORE-TAILS-3 CYCLE GUARD GREEN: none of % live worked-out columns reads itself round a circle (% pairs of tables point at each other through lookups/rollups both ways — the shape that overflowed without being a circle)',
    v_all, v_pairs;
end
$census$;
