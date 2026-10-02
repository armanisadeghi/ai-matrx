-- chair-step: this puts custom.record_filter_sql(uuid, uuid, jsonb) back to the body visionreach_w3_a_condition_across_a_relation.sql was written against (a <relation>.<field> filter key is refused as not a field key again).
-- lane: VISION-REACH
-- guard: custom/system_enabled
-- based-on: custom.record_filter_sql(uuid, uuid, jsonb) 02899242db74846e70064e6f61280c6b984a75c6adf978aedf4125104929901e

CREATE OR REPLACE FUNCTION custom.record_filter_sql(p_organization_id uuid, p_table_id uuid, p_filter jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_who     uuid;
  v_level   public.permission_level;
  v_visible text[];
  v_mask    jsonb;
  v_sql     text;
  v_key     text;
  v_val     text;
begin
  if not custom.filter_is_rule(p_filter) then
    -- S2-PRIME AGG-FIELD-READ: a flat question may not narrow by a column its reader may not read
    -- — "the jobs whose cost is 2,600" answers the cost. Refused by the column's name, as the
    -- aggregate refuses measuring it. (A Rule expression treats such a column as undecided.)
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      perform custom.agg_fields_readable_assert(p_organization_id, p_table_id,
                array(select jsonb_object_keys(p_filter)), 'viewer');
    end if;
    v_sql := custom.record_filter_sql(p_filter);
    -- VISION-REACH W3 (2026-10-02): A FILTER ON A WORKED-OUT COLUMN reads it as the record read
    -- reads it. A formula, lookup or roll-up column has no stored value, so `{"copay_tier":
    -- "High copay"}` matched no row (the stored `r.data` holds nothing under that key). Each such
    -- key's stored-value reading in the one fragment is swapped for the read path's own answer
    -- (custom.agg_field_value_sql — the same expression the aggregate measures with); a plain
    -- stored column is untouched, so no other filter gets slower.
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' and v_sql <> 'true' then
      for v_key in select k from jsonb_object_keys(p_filter) k loop
        v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
        if v_val <> custom.agg_value_sql(v_key) then
          v_sql := replace(v_sql, custom.agg_value_sql(v_key), '(' || v_val || ')');
        end if;
      end loop;
    end if;
    return v_sql;
  end if;

  -- WHICH COLUMNS THIS READER MAY SEE, asked the way the read door asks it: the reader's level
  -- on the TABLE, then the fields at that level. The server lane (no principal) sees every column.
  v_who := custom.query_principal();
  if v_who is not null then
    v_level := custom.effective_level(v_who, p_organization_id, p_table_id);
    -- READ-MASK-ONCE: the one mask's answer, memoised for the statement.
    v_mask := custom.read_mask_for(v_who, p_organization_id, p_table_id, v_level, 'read');
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
  end if;

  return format('(custom.rule_truth(%s) is true)',
                custom.rule_filter_node_sql(p_organization_id, p_table_id, p_filter,
                                            custom.choice_field_map(p_organization_id, p_table_id),
                                            v_visible));
end;
$function$

;
