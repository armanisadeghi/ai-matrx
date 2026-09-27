-- Inverse of databasics_a_filter_that_is_not_conditions_is_refused.sql: the body it replaced, byte for byte.
-- based-on: custom.record_filter_sql(jsonb) 5bde1ee47901fffe2bdc15c34fbd1ab3858dc10dcb7aa6b661917052451864ca

CREATE OR REPLACE FUNCTION custom.record_filter_sql(p_filter jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_where text[] := '{}';
  v_key   text;
begin
  -- S2-PRIME FILTER-GROUPS: A RULE EXPRESSION IS NOT A FLAT MAP, AND IS NEVER READ AS ONE. Read
  -- here, `{"op": "and", "args": [...]}` would become `op = 'and' and args = '[...]'` — a filter
  -- that silently matches nothing. It is compiled by the three-argument form, which knows the
  -- table its field ids belong to and which columns the reader may see.
  if custom.filter_is_rule(p_filter) then
    raise exception 'this filter is a Rule expression, and it has to be asked of a table'
      using errcode = '22023',
            hint = 'Call custom.record_filter_sql(organization, table, filter): it resolves every field id to that table''s own column and asks it over the reader''s visible columns. Nothing was read.';
  end if;

  -- A SCALAR IS AN EQUALITY. `null` IS UNSET. AN OBJECT IS A WINDOW. This is the shape
  -- `platform.saved_view.definition -> 'filters'` has always carried and the shape
  -- `custom.record_aggregate(p_filter)` has always taken — read here once, for both.
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      elsif jsonb_typeof(p_filter -> v_key) = 'null' then
        -- LIMITS-FIX 2026-09-21 — THE THIRD STATE. A tick box has three answers: yes, no,
        -- and nobody has said yet. Asking for `null` used to compare the missing value
        -- against the empty string and answer NO ROWS.
        v_where := array_append(v_where, format('(%s) is null', custom.agg_value_sql(v_key)));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- `true` rather than an empty string, so every caller writes `and (<this>)` and no caller
  -- has to remember whether the fragment brings its own conjunction.
  if cardinality(v_where) = 0 then
    return 'true';
  end if;
  return '(' || array_to_string(v_where, ' and ') || ')';
end;
$function$;
