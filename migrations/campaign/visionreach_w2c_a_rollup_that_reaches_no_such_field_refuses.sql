-- target: branch,production
-- additive: yes
--   It REPLACES one body, custom.query_rollup_sum, declared below with the body it was written against
--   (the VISION-REACH W3 masking body, so visionreach_w3_query_doors_mask_fields.sql applies FIRST).
--   No table, column, trigger, policy, grant or row is touched. Locks: pg_proc row lock only.
--   Inverse: migrations/inverse/visionreach_w2c_a_rollup_that_reaches_no_such_field_refuses_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text) f4dc983d79fb75a1f6cc8c9f342b0b12058133e84c05be079dc8f18a24443e10
--
-- LANE 5 VISION-REACH, WAVE 2 (verifier finding) — A ROLL-UP THAT REACHES NO SUCH FIELD IS REFUSED, NEVER 0.
--
-- THE DEFECT (measured on production and the clone, 2026-10-02): custom.query_rollup_sum with the two
-- patients Dr. Okafor referred as roots answered 0 for `copay`, `write_off` and the formula
-- `expected_copay_total`, for the member and the owner alike, while those patients' visits hold $130 of
-- copay. Cause: custom.query_rollup walks OUTWARD (association source -> target, the relations the roots
-- HOLD). A visit holds the `patient` relation, so the walk from a patient reaches only the patient; a
-- patient has no `copay`; `coalesce(sum(null), 0)` turned "this walk never reached a record that has the
-- field" into 0 — the silent zero the W2 comment above the sum says never happens.
--
-- THE FIX: the walk is read ONCE (it used to run twice, once for the mask check and once for the sum),
-- and when no record it reaches carries the field — no reached Table declares it and no reached record
-- stores it — the door refuses in a sentence (22023) that says which way a roll-up walks and which door
-- answers the other direction. A zero over records that DO carry the field stays a real 0.
CREATE OR REPLACE FUNCTION custom.query_rollup_sum(p_organization_id uuid, p_roots uuid[], p_field_key text, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_max_depth integer DEFAULT 33, p_required text DEFAULT 'viewer'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_ids    uuid[];
  v_tables uuid[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_rollup_sum');
  -- THE WALK, ONCE: every record the roll-up reaches that this reader may see.
  select coalesce(array_agg(k.record_id), '{}'::uuid[]) into v_ids
    from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k;
  select coalesce(array_agg(distinct r.table_id), '{}'::uuid[]) into v_tables
    from custom.record r
   where r.organization_id = p_organization_id and r.id = any (v_ids) and r.table_id is not null;
  -- VISION-REACH W3 (2026-10-02): ADDING UP A COLUMN IS READING IT. Every Table the walk reaches is
  -- asked the aggregate door's own question (custom.agg_fields_readable_assert, the check
  -- custom.agg_sql makes for a measure), so a column she may not read is refused by its name.
  perform custom.agg_fields_readable_assert(p_organization_id, t, array[p_field_key], p_required)
     from unnest(v_tables) t;
  -- VISION-REACH W2c: A ZERO FROM A WALK THAT NEVER REACHED THE FIELD IS A WRONG ANSWER, NOT A ZERO.
  if not exists (select 1
                   from custom.record f
                  where f.organization_id = p_organization_id
                    and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null
                    and (f.data ->> 'entity_definition_id')::uuid = any (v_tables)
                    and f.data ->> 'key' = p_field_key)
     and not exists (select 1
                       from custom.record r
                      where r.organization_id = p_organization_id
                        and r.id = any (v_ids)
                        and r.data ? p_field_key) then
    raise exception 'None of the % record(s) this roll-up reaches has a "%" field, so there is nothing to add up; 0 would be a wrong answer.',
                    cardinality(v_ids), p_field_key
      using errcode = '22023',
            detail = 'rollup_field_not_reached:' || p_field_key,
            hint = 'A roll-up starts at the roots and follows the relations THEY hold, outward. To total the records that point AT these roots (the visits of these patients), ask custom.record_aggregate on the table that holds them, filtered by its relation field.';
  end if;
  return (
  -- The value is read out of the Value ENVELOPE when there is one (`{"value": …}`) and out of
  -- the plain key when there is not, which is the same reading every other surface does.
  -- VISION-REACH W2: a key the record does not STORE (a formula, lookup or roll-up column, worked
  -- out when the record is read) is read through the read path's own one-column answer, so a
  -- roll-up of a formula is its real total.
  select coalesce(sum(nullif(
           case when not (r.data ? p_field_key)
                  then custom.agg_value_text(custom.record_value_one(p_organization_id, r.id, p_field_key))
                when jsonb_typeof(r.data -> p_field_key) = 'object'
                      and (r.data -> p_field_key) ? 'value'
                then r.data -> p_field_key ->> 'value'
                else r.data ->> p_field_key end, '')::numeric), 0)
    from custom.record r
   where r.organization_id = p_organization_id and r.id = any (v_ids)
  );
end;
$function$;
