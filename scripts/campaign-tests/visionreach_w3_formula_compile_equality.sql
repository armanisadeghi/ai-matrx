-- VISION-REACH W3 — A FORMULA PLANNED ONCE ANSWERS EXACTLY WHAT custom.formula_eval ANSWERS.
--
-- custom.formula_compile_sql writes an arithmetic formula as ONE SQL expression so an aggregate,
-- a filter or a date period over 5,000 records does not call custom.formula_eval 5,000 times. This
-- suite holds it to the one evaluator: for EVERY formula Field in the database that the planner
-- accepts (every organization), on EVERY live record of its Table, the planned expression and
-- custom.derived_value (-> custom.formula_value -> custom.formula_eval, handed the same values the
-- aggregate hands it) must give the same text. One difference is a failure, named with the record.
--
-- It also prints how many formula Fields there are and how many were planned, so a planner that
-- quietly accepts nothing cannot pass by comparing zero rows: at least one planned Field over at
-- least one record is required.
--
-- Read-only (one transaction, ROLLBACK). Clone or main.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w3_formula_compile_equality.sql'
\set requires 'function:custom.formula_compile_sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '900s';

do $t$
declare
  c_values constant text :=
    '(case when r.data ? ''_computed'' or r.data ? ''_derived'' '
    'then (r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
    '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'') '
    'else r.data end)';
  f        record;
  v_sql    text;
  v_fields integer := 0;
  v_plan   integer := 0;
  v_rows   bigint := 0;
  v_n      bigint;
  v_bad    text;
  v_fail   text[] := '{}';
begin
  for f in
    select fr.organization_id, (fr.data ->> 'entity_definition_id')::uuid as table_id, fr.data, fr.id
      from custom.record fr
     where fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and fr.data ->> 'type' = 'formula'
       and (fr.data ->> 'entity_definition_id') is not null
  loop
    v_fields := v_fields + 1;
    continue when custom.parity_type(f.data) <> 'formula'
               or coalesce(f.data ->> 'compute_on', '') <> 'read'
               or jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) <> 0;
    v_sql := custom.formula_compile_sql(f.organization_id, f.data -> 'config' -> 'expr', c_values);
    continue when v_sql is null;
    v_plan := v_plan + 1;
    execute format($q$
      select count(*),
             string_agg(format('record %%s: planned %%s, formula_eval %%s', r.id, x.planned, x.evaluated), '; ')
               filter (where x.planned is distinct from x.evaluated)
        from custom.record r
        cross join lateral (
          select custom.agg_value_text(to_jsonb(%s)) as planned,
                 custom.agg_value_text(custom.derived_value(%L::uuid, r.id, %L::jsonb, %s)) as evaluated
        ) x
       where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null
    $q$, v_sql, f.organization_id, f.data, c_values, f.organization_id, f.table_id)
    into v_n, v_bad;
    v_rows := v_rows + v_n;
    if v_bad is not null then
      v_fail := v_fail || format('field %s (%s, table %s): %s', f.id, f.data ->> 'key', f.table_id, left(v_bad, 600));
    end if;
  end loop;

  raise notice 'formula Fields: %; planned once: %; records compared: %', v_fields, v_plan, v_rows;
  if v_plan = 0 or v_rows = 0 then
    raise exception 'RED — nothing was compared (% planned Fields, % records); the suite proves nothing', v_plan, v_rows;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % planned formula Field(s) disagree with custom.formula_eval:\n  %',
      cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — every planned formula answers exactly what custom.formula_eval answers, on every record.';
end
$t$;

rollback;
