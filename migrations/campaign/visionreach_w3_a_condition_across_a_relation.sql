-- target: branch,production
-- additive: yes
--   It REPLACES one body, declared below with the body it was written against. No table, column,
--   trigger, policy, grant or row of anybody's data is touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/visionreach_w3_a_condition_across_a_relation_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.record_filter_sql(uuid, uuid, jsonb) e73ea25ca1d064727fa8a01aa3a9b2488aef3533d4dc15f4e2897be605799d35
--
-- LANE 5 VISION-REACH, WAVE 3 — A CONDITION ACROSS A RELATION IS ASKED OF THE STORE, NOT PAGED.
--
-- THE DEFECT: "the total copay of the visits of patients Dr. Samuel Okafor referred" was answered by
-- the records tool reading EVERY page of the Patients table into Python, matching there, and sending
-- the matching patient ids back to custom.record_aggregate as an OR of equalities — cost growing with
-- the size of the related table, and a refusal past 5,000 matching patients.
--
-- THE FIX: a flat filter key `<relation>.<field>` (custom.record_filter_sql, so the aggregate, the
-- filtered read door and drill-down all take it) is one sub-select over the related table: the
-- related records this reader may see (custom.visible_predicate_sql on THAT table), narrowed by the
-- related field through this same function — its readability refusal and its formula reading — and
-- the relation column itself checked readable here. A key without a dot is unchanged.

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
  v_across  jsonb := '{}'::jsonb;
  v_head    text;
  v_tail    text;
  v_rel     jsonb;
  v_target  uuid;
  v_inner   text;
  v_parts   text[] := '{}';
begin
  if not custom.filter_is_rule(p_filter) then
    -- S2-PRIME AGG-FIELD-READ: a flat question may not narrow by a column its reader may not read
    -- — "the jobs whose cost is 2,600" answers the cost. Refused by the column's name, as the
    -- aggregate refuses measuring it. (A Rule expression treats such a column as undecided.)
    -- VISION-REACH W3 (2026-10-02): A CONDITION ACROSS A RELATION, ASKED OF THE STORE.
    -- `{"patient.referring_physician": "Dr. Samuel Okafor"}` — a key `<relation>.<field>` — means
    -- "this record's relation points at a record whose field is that". It used to be answered by
    -- reading EVERY page of the related table into the records tool and sending its matching ids
    -- back as a list (capped at 5,000). It is now one sub-select here: the related records this
    -- reader may see (custom.visible_predicate_sql on THAT table), narrowed by the related field
    -- through this same function (its readability check, its formula reading), the relation
    -- column itself checked readable on this table.
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_across
        from jsonb_each(p_filter) e where strpos(e.key, '.') > 0;
      if v_across <> '{}'::jsonb then
        p_filter := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                       from jsonb_each(p_filter) e where strpos(e.key, '.') = 0);
        for v_key in select k from jsonb_object_keys(v_across) k loop
          v_head := custom.agg_assert_key(split_part(v_key, '.', 1));
          v_tail := substr(v_key, char_length(v_head) + 2);
          select f.data into v_rel
            from custom.record f
           where f.organization_id = p_organization_id
             and f.table_id = custom.field_kernel_id()
             and f.deleted_at is null
             and (f.data ->> 'entity_definition_id')::uuid = p_table_id
             and f.data ->> 'key' = v_head
           limit 1;
          if v_rel is null or v_rel ->> 'type' <> 'relation' or nullif(v_rel ->> 'relation_target', '') is null then
            raise exception '"%" is not a relation of this table, so "%" cannot reach a field through it.', v_head, v_key
              using errcode = '22023',
                    hint = 'A condition across a relation is written <relation key>.<field key of the table it points at>. Nothing was read.';
          end if;
          v_target := (v_rel ->> 'relation_target')::uuid;
          perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, array[v_head], 'viewer');
          v_inner := custom.record_filter_sql(p_organization_id, v_target,
                       custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, v_target),
                                                      jsonb_build_object(v_tail, v_across -> v_key)));
          v_parts := v_parts || format(
            'exists (select 1 from jsonb_array_elements_text(case jsonb_typeof(%1$s) when ''array'' then %1$s '
            'when ''null'' then ''[]''::jsonb else jsonb_build_array(%1$s) end) x(id) '
            'where x.id in (select r.id::text from custom.record r where r.organization_id = %2$L::uuid '
            'and r.table_id = %3$L::uuid and r.deleted_at is null '
            'and coalesce(r.metadata ->> ''quarantine'', ''false'') <> ''true'' and %4$s and %5$s))',
            format('(case when jsonb_typeof(r.data -> %1$L) = ''object'' and (r.data -> %1$L) ? ''value'' '
                   'then r.data -> %1$L -> ''value'' else r.data -> %1$L end)', v_head),
            p_organization_id, v_target,
            custom.visible_predicate_sql(custom.query_principal(), p_organization_id, v_target,
                                         'viewer'::public.permission_level, 'r'),
            v_inner);
        end loop;
      end if;
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
    if cardinality(v_parts) > 0 then
      v_sql := '(' || v_sql || ' and ' || array_to_string(v_parts, ' and ') || ')';
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
$function$;
