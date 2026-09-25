-- LANE STORE-TAILS-3 — THE GUARD: NO WORKED-OUT COLUMN IS HANDED TO AN AGENT MORE FREELY THAN WHAT IT READS.
--
-- `context_policy` is the organization's word on whether an agent is given a column's values:
-- include < summarize < on_request < exclude (a missing word reads include; an unknown word is the
-- strictest). A formula, lookup or rollup over a column the organization keeps out of
-- conversations must be kept out at least as firmly — the same rule STORE-LEAK-FORMULA's guard
-- checks for sensitivity, walked the same way (this file is that guard with the four
-- agent-visibility words in place of the four sensitivity words).
--
-- SELF-CONTAINED ON PURPOSE: it reads only `custom.record` with its own recursive walk, so it
-- runs the same on a database that has never heard of the fix (that is how it is proven RED on
-- production before the repair). It writes nothing. Archived columns count.
--
-- RED: any worked-out column, live or archived, whose context_policy ranks below the strictest
--      column it reads — each named. GREEN: none.

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
           coalesce(array_position(array['include','summarize','on_request','exclude'],
                                   coalesce(w.data ->> 'context_policy', 'include')), 4) as own_rank,
           coalesce(array_position(array['include','summarize','on_request','exclude'],
                                   coalesce(i.data ->> 'context_policy', 'include')), 4) as input_rank
      from worked w
      join closure c on c.org = w.org and c.id = w.id
      join fld i on i.org = c.org and i.id = c.input_id)
  select count(distinct (org, id)),
         string_agg(distinct format('%s / table %s / %s (%s) reads %s (%s)',
                                    org, data ->> 'entity_definition_id',
                                    coalesce(data ->> 'label', data ->> 'key'), data ->> 'context_policy',
                                    coalesce(idata ->> 'label', idata ->> 'key'), idata ->> 'context_policy'),
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
    raise exception 'STORE-TAILS-3 AGENT-VISIBILITY GUARD RED: % of % worked-out columns (live and archived) are handed to agents more freely than a column they read, so an agent is given the input through them:%    %',
                    v_bad, v_all, E'\n', v_list
      using errcode = '23514',
            hint = 'A formula, lookup or rollup column is kept from agents at least as firmly as the strictest column it reads (include < summarize < on_request < exclude). Repair: storetails3_every_worked_out_column_is_kept_from_agents_like_its_inputs.sql.';
  end if;
  raise notice 'STORE-TAILS-3 AGENT-VISIBILITY GUARD GREEN: all % worked-out columns (live and archived) are kept from agents at least as firmly as every column they read', v_all;
end
$census$;
