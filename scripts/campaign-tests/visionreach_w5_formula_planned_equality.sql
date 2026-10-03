-- VISION-REACH W5 — EVERY PLANNED FORMULA ANSWERS EXACTLY WHAT custom.formula_eval ANSWERS, ON
-- EVERY RECORD OF EVERY FORMULA FIELD IN THE DATABASE.
--
-- custom.formula_compile_sql writes a formula as ONE SQL expression (nested custom._fxc_apply
-- calls, with custom._fxc_eval handing an unplanned part back to formula_eval) so a filter, a
-- group, a measure or a date period over 5,000 records does not call custom.formula_eval 5,000
-- times. This suite holds it to the one evaluator. For EVERY formula Field of every organization
-- that the measure door (custom.agg_field_value_sql) plans, on EVERY live record of its Table:
--   1. the planned JSON value, as text, equals custom.derived_value's (handed the very values the
--      read path hands it) — so "1.50" vs "1.5", "" vs null, true vs "true" are all differences;
--   2. the door's own text (what a filter, a group and a measure compare) equals
--      custom.agg_value_text(custom.derived_value(…)).
-- One difference is a failure, named with the record and both answers. A planner that quietly
-- plans nothing cannot pass: at least one planned Field over at least one record is required, and
-- the counts are printed.
--
-- Read-only: one READ ONLY transaction, rolled back. Clone or main (production through the
-- session pooler, as postgres — the role that may call both custom.formula_eval and the planner).
-- Its edge-value twin, which builds its own Table on the clone:
-- visionreach_w5_formula_planned_edges.sql.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w5_formula_planned_equality.sql'
\set requires 'function:custom._fxc_apply'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin read only;
set local statement_timeout = '1800s';

do $t$
declare
  c_values constant text :=
    '(case when r.data ? ''_computed'' or r.data ? ''_derived'' '
    'then (r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
    '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'') '
    'else r.data end)';
  f         record;
  v_door    text;
  v_sql     text;
  v_fields  integer := 0;
  v_plan    integer := 0;
  v_handed  integer := 0;
  v_perrow  integer := 0;
  v_rows    bigint := 0;
  v_n       bigint;
  v_bad     text;
  v_fail    text[] := '{}';
begin
  for f in
    select fr.organization_id, (fr.data ->> 'entity_definition_id')::uuid as table_id, fr.data, fr.id
      from custom.record fr
     where fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and fr.data ->> 'type' = 'formula'
       and (fr.data ->> 'entity_definition_id') is not null
     order by fr.organization_id, fr.id
  loop
    v_fields := v_fields + 1;
    v_door := custom.agg_field_value_sql(f.organization_id, f.table_id, f.data ->> 'key');
    if v_door like '%custom.derived_value(%' or v_door like '%custom.record_value_one(%' then
      v_perrow := v_perrow + 1;
      continue;
    end if;
    continue when v_door not like '%custom._fxc_%' and v_door not like 'custom.agg_value_text(''%';
    v_sql := custom.formula_compile_sql(f.organization_id, f.data -> 'config' -> 'expr', c_values);
    if v_sql is null then
      v_fail := v_fail || format('field %s (%s): the door plans it but the planner answers nothing', f.id, f.data ->> 'key');
      continue;
    end if;
    v_plan := v_plan + 1;
    if v_sql like '%custom._fxc_eval(%' then
      v_handed := v_handed + 1;
    end if;
    execute format($q$
      select count(*),
             string_agg(format('record %%s: planned %%s / door %%s, formula_eval %%s',
                               r.id, coalesce(x.planned::text, 'SQL NULL'), coalesce(x.door, 'SQL NULL'),
                               coalesce(x.evaluated::text, 'SQL NULL')), '; ')
               filter (where x.planned::text is distinct from x.evaluated::text
                          or x.door is distinct from custom.agg_value_text(x.evaluated))
        from custom.record r
        cross join lateral (
          select %s as planned,
                 %s as door,
                 custom.derived_value(%L::uuid, r.id, %L::jsonb,
                   (r.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
                   || custom.computed_block(r.data -> '_computed') || custom.computed_block(r.data -> '_derived')) as evaluated
        ) x
       where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null
    $q$, v_sql, v_door, f.organization_id, f.data, f.organization_id, f.table_id)
    into v_n, v_bad;
    v_rows := v_rows + v_n;
    if v_bad is not null then
      v_fail := v_fail || format('field %s (%s = %s, table %s): %s', f.id, f.data ->> 'key',
                                 f.data -> 'config' ->> 'formula_text', f.table_id, left(v_bad, 600));
    end if;
  end loop;

  raise notice 'formula Fields: %; planned once: % (% with a part handed to formula_eval); worked out per record: %; records compared: %',
    v_fields, v_plan, v_handed, v_perrow, v_rows;
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
