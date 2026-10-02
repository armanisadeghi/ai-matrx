-- chair-step: this puts custom.query_rollup_sum back to the body visionreach_w2c_a_rollup_that_reaches_no_such_field_refuses.sql was written against (the W3 masking body): a roll-up that reaches no record carrying the field answers 0 again, and the walk runs twice.
-- lane: VISION-REACH
-- guard: custom/system_enabled
-- based-on: custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text) 2cffacc02d360770ab85c60db608612df9b3954ef935f1c3b255ed7f6a8e4e46

CREATE OR REPLACE FUNCTION custom.query_rollup_sum(p_organization_id uuid, p_roots uuid[], p_field_key text, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_max_depth integer DEFAULT 33, p_required text DEFAULT 'viewer'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_rollup_sum');
  -- VISION-REACH W3 (2026-10-02): ADDING UP A COLUMN IS READING IT. Before this, a member who may
  -- not read a confidential Field got its total from this door. Every Table the walk reaches is
  -- asked the aggregate door's own question (custom.agg_fields_readable_assert, the check
  -- custom.agg_sql makes for a measure), so a column she may not read is refused by its name.
  perform custom.agg_fields_readable_assert(p_organization_id, t.table_id, array[p_field_key], p_required)
     from (select distinct r.table_id
             from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
             join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id
            where r.table_id is not null) t;
  return (
-- The value is read out of the Value ENVELOPE when there is one (`{"value": …}`) and out of
  -- the plain key when there is not, which is the same reading every other surface does.
  -- VISION-REACH W2: a key the record does not STORE (a formula, lookup or roll-up column, worked
  -- out when the record is read) is read through the read path's own one-column answer, so a
  -- roll-up of a formula is its real total and never a silent 0.
  select coalesce(sum(nullif(
           case when not (r.data ? p_field_key)
                  then custom.agg_value_text(custom.record_value_one(p_organization_id, r.id, p_field_key))
                when jsonb_typeof(r.data -> p_field_key) = 'object'
                      and (r.data -> p_field_key) ? 'value'
                then r.data -> p_field_key ->> 'value'
                else r.data ->> p_field_key end, '')::numeric), 0)
    from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
    join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id
  );
end;
$function$;
