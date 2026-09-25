-- LANE STORE-LEAK-FORMULA — THE GUARD: NO WORKED-OUT COLUMN IS LESS SENSITIVE THAN WHAT IT READS.
--
-- VERIFIER-18 finding 1 (HIGH, data leak). On Rooms, *Budget* is confidential, so a Viewer sees
-- "—" in it; *Budget with contingency* (`{Budget} * 1.1`) sat beside it as `internal` with
-- `depends_on: []`, so the same Viewer read 19,800 and the hidden budget was one division away.
--
-- THIS CHECK IS SELF-CONTAINED ON PURPOSE. It reads only `custom.record` and walks every live
-- formula, lookup and rollup column's inputs with its own recursive query, so it runs the same on
-- a database that has never heard of the fix (that is how it was proven RED on production before
-- the repair) as on one that has. It writes nothing.
--
-- WHAT IT READS AS AN INPUT (the same list `custom.field_inputs` answers):
--   formula  every `field` / `parent_field` / `previous.field` leaf of `config.expr` — a Field id
--            (REC-17), or, for the older shape, a key of the same table;
--   lookup   the relation column `config.via` and the far table's `config.pick`;
--   rollup   the relation column `config.via` and the far table's `config.of`.
-- A retired input still counts (conservative: an archived table comes back with its columns).
-- Inputs of inputs count too (a formula over a formula over Budget is as sensitive as Budget).
--
-- RANK: public < internal < confidential < restricted (FLD-12's four words, in order).
--
-- ARCHIVED COLUMNS COUNT. An archived table comes back with "Bring it back" exactly as it was, so
-- a leak parked in the archive is a leak waiting for one click (VERIFIER-18's Rooms is archived).
--
-- RED: any worked-out column, live or archived, whose `sensitivity` ranks below the strongest column it reads.
--      The failure names every one (organization, table, column, its word, the input and its word).
-- GREEN: none.

\set ON_ERROR_STOP on
\timing off

do $census$
declare
  v_bad   bigint;
  v_all   bigint;
  v_list  text;
begin
  with recursive
  fk as (select '11111111-0000-4000-8000-000000000002'::uuid as id),
  -- Every Field definition once (live and retired), so every join below is a hash join.
  fld as materialized (
    select f.organization_id as org, f.id, f.data, f.deleted_at,
           f.data ->> 'entity_definition_id' as tbl, f.data ->> 'key' as key
      from custom.record f, fk
     where f.table_id = fk.id and f.data_class <> 'kernel'),
  worked as materialized (
    select * from fld
     where data ->> 'type' = 'formula'
       and (data -> 'config' ?| array['expr', 'pick', 'agg'])),
  refs as (
    select w.org, w.id, w.tbl, v #>> '{}' as ref
      from worked w,
           jsonb_path_query(coalesce(w.data -> 'config' -> 'expr', 'null'::jsonb),
                            'strict $.**.field') v
     where jsonb_typeof(v) = 'string'
    union
    select w.org, w.id, w.tbl, v #>> '{}'
      from worked w,
           jsonb_path_query(coalesce(w.data -> 'config' -> 'expr', 'null'::jsonb),
                            'strict $.**.parent_field') v
     where jsonb_typeof(v) = 'string'),
  -- One step: a worked-out column -> each column it reads directly.
  step(org, id, input_id) as (
    -- a formula leaf that names a Field by id (REC-17)
    select r.org, r.id, i.id
      from refs r join fld i on i.org = r.org and i.id::text = lower(r.ref)
    union
    -- a formula leaf in the older shape, naming a column of the same table by key
    select r.org, r.id, i.id
      from refs r join fld i on i.org = r.org and i.tbl = r.tbl and i.key = r.ref
    union
    -- lookup / rollup: the relation column it reads through
    select w.org, w.id, v.id
      from worked w join fld v on v.org = w.org and v.tbl = w.tbl and v.key = w.data -> 'config' ->> 'via'
    union
    -- lookup / rollup: the far column
    select w.org, w.id, far.id
      from worked w
      join fld v   on v.org = w.org and v.tbl = w.tbl and v.key = w.data -> 'config' ->> 'via'
      join fld far on far.org = w.org and far.tbl = v.data ->> 'relation_target'
                  and far.key = coalesce(w.data -> 'config' ->> 'pick', w.data -> 'config' ->> 'of')),
  closure(org, id, input_id, depth) as (
    select org, id, input_id, 1 from step where input_id <> id
    union
    select c.org, c.id, s.input_id, c.depth + 1
      from closure c join step s on s.org = c.org and s.id = c.input_id
     where c.depth < 12 and s.input_id <> c.id),
  ranked as (
    select w.org, w.id, w.data, i.id as input_id, i.data as idata,
           array_position(array['public','internal','confidential','restricted'],
                          coalesce(w.data ->> 'sensitivity', 'internal')) as own_rank,
           coalesce(array_position(array['public','internal','confidential','restricted'],
                                   i.data ->> 'sensitivity'), 4) as input_rank
      from worked w
      join closure c on c.org = w.org and c.id = w.id
      join fld i on i.org = c.org and i.id = c.input_id)
  select count(distinct (org, id)),
         string_agg(distinct format('%s / table %s / %s (%s) reads %s (%s)',
                                    org, data ->> 'entity_definition_id',
                                    coalesce(data ->> 'label', data ->> 'key'), data ->> 'sensitivity',
                                    coalesce(idata ->> 'label', idata ->> 'key'), idata ->> 'sensitivity'),
                    E'\n    ')
    into v_bad, v_list
    from ranked
   where input_rank > own_rank;
  -- (an archived column counts: "Bring it back" restores it as it was, leak and all)

  select count(*) into v_all
    from custom.record f
   where f.table_id = '11111111-0000-4000-8000-000000000002'::uuid and f.data_class <> 'kernel'
     and f.data ->> 'type' = 'formula'
     and (f.data -> 'config' ?| array['expr', 'pick', 'agg']);

  if v_bad > 0 then
    raise exception 'STORE-LEAK-FORMULA GUARD RED: % of % worked-out columns (live and archived) are less sensitive than a column they read, so a reader who may not read the input reads it through them:%    %',
                    v_bad, v_all, E'\n', v_list
      using errcode = '23514',
            hint = 'A formula, lookup or rollup column is at least as sensitive as the strongest column it reads. Repair: storeleakformula_a_worked_out_column_is_as_sensitive_as_what_it_reads.sql.';
  end if;
  raise notice 'STORE-LEAK-FORMULA GUARD GREEN: all % worked-out columns (live and archived) are at least as sensitive as every column they read', v_all;
end
$census$;
