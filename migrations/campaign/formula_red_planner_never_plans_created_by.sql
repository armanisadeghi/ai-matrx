-- target: branch,production
-- additive: yes
-- BODY REPLACED: a Created by / Last changed by column is never planned. Its formula is {"op": "fx.created_by"} (or
--   fx.modified_by) with config.system naming the stamp; the answer comes from the record's own stamps in
--   custom.formula_value, not from formula_eval's node catalogue. custom._fxc_context_free (the gate that says "this
--   formula needs nothing of its record but its values") did not list these two ops like it lists AUTONUMBER,
--   CREATED_TIME and MODIFIED_TIME, so the planner wrote them as a context-free part, handed them to formula_eval with no
--   record, and got an empty answer where the row-by-row path names the person
--   (scripts/campaign-tests/visionreach_w3_formula_compile_equality.sql). Now they are not planned: NULL keeps the per-row
--   path. Predates FORMULA-2 (the gate is unchanged by it).
--   Locks: pg_proc row. Nothing stored is rewritten.
--   Inverse: migrations/inverse/formula_red_planner_never_plans_created_by_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: FORMULA-RED
-- based-on: custom._fxc_context_free(jsonb) f63940ad3bb1cb82f3f65ecd8e670be2a4b5543a2ff1990c03bfccffb1311cd7

CREATE OR REPLACE FUNCTION custom._fxc_context_free(p_expr jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Does this formula (part) need nothing of its record but the record's values? Constants,
  -- columns and the formula language's own functions do — except AUTONUMBER, CREATED_TIME,
  -- MODIFIED_TIME, and the Created by / Last changed by stamps (fx.created_by, fx.modified_by), which read the record itself. Anything else is a Rule node, whose answer can
  -- depend on the record's parent, its siblings or who is acting (custom.rule_context).
  with recursive n(e) as (
    select p_expr
    union all
    select a.value
      from n, jsonb_array_elements(case when jsonb_typeof(n.e) = 'object' and jsonb_typeof(n.e -> 'args') = 'array'
                                        then n.e -> 'args' else '[]'::jsonb end) a
  )
  -- The Rule nodes that read nothing but the values (custom.rule_eval): arithmetic and comparisons,
  -- joining words, AND / OR, present, length, matches. NOT is left out: its answer for an unknown
  -- depends on why the Rule is asked (p_context.purpose).
  select coalesce(bool_and(
           jsonb_typeof(n.e) = 'object'
           and ((select array_agg(k order by k) from jsonb_object_keys(n.e) k) in (array['const'], array['field'])
                or (left(coalesce(n.e ->> 'op', ''), 3) = 'fx.'
                    and (n.e ->> 'op') not in ('fx.autonumber', 'fx.created_time', 'fx.modified_time', 'fx.created_by', 'fx.modified_by')
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k) in (array['op'], array['args', 'op']))
                or ((n.e ->> 'op') in ('add', 'sub', 'mul', 'div', 'lt', 'lte', 'gt', 'gte', 'eq', 'ne',
                                       'and', 'or', 'present', 'length', 'matches')
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k) = array['args', 'op'])
                or ((n.e ->> 'op') = 'concat'
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k)
                        in (array['args', 'op'], array['args', 'op', 'separator'])))), false)
    from n;
$function$
