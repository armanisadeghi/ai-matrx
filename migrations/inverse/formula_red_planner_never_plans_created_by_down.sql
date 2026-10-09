-- target: branch,production
-- additive: yes
-- INVERSE of formula_red_planner_never_plans_created_by.sql: puts back custom._fxc_context_free as it was.
-- guard: custom/system_enabled
-- lock: custom
-- lane: FORMULA-RED
-- based-on: custom._fxc_context_free(jsonb) 2878e4b74b0e707c304e6e38409005ceab6a1ac55aa9a4f3cc39b0c15475b991

CREATE OR REPLACE FUNCTION custom._fxc_context_free(p_expr jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Does this formula (part) need nothing of its record but the record's values? Constants,
  -- columns and the formula language's own functions do — except AUTONUMBER, CREATED_TIME and
  -- MODIFIED_TIME, which read the record itself. Anything else is a Rule node, whose answer can
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
                    and (n.e ->> 'op') not in ('fx.autonumber', 'fx.created_time', 'fx.modified_time')
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k) in (array['op'], array['args', 'op']))
                or ((n.e ->> 'op') in ('add', 'sub', 'mul', 'div', 'lt', 'lte', 'gt', 'gte', 'eq', 'ne',
                                       'and', 'or', 'present', 'length', 'matches')
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k) = array['args', 'op'])
                or ((n.e ->> 'op') = 'concat'
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k)
                        in (array['args', 'op'], array['args', 'op', 'separator'])))), false)
    from n;
$function$
