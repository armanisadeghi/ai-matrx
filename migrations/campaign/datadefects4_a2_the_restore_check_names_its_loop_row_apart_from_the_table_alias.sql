-- lane: DATA-DEFECTS-4
-- lock: custom
-- based-on: custom._restore_check(uuid, uuid[], timestamp with time zone[]) 6f3cca982db889fe4653f8f0e43683d4326805c849c4908920350e0363d815a9
--
-- The inverse is `migrations/inverse/datadefects4_a2_the_restore_check_names_its_loop_row_apart_from_the_table_alias_down.sql`.
--
-- FIX TO datadefects4_a: custom._restore_check named its loop row `r`, the same word its set-based query uses as
-- the alias of custom.record, so plpgsql read the alias as the unassigned variable ("record r is not assigned yet").
-- The loop row is now `w`. No behaviour change otherwise.

CREATE OR REPLACE FUNCTION custom._restore_check(p_organization_id uuid, p_ids uuid[], p_ats timestamptz[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- DATA-DEFECTS-4 (2026-10-10): THE ONE SET-BASED QUESTION A RESTORE ASKS OF THE ORDINARY RECORDS IT BRINGS
  -- BACK. The row triggers (field validation, rules, choice words, unique rule ...) stand aside for an update
  -- that changes only archive bookkeeping, so a restore is judged HERE, once per step, against the table's
  -- CURRENT definition. Answers {held: {id: why}, flagged: {id: why}}:
  --   · HELD   — a unique value another live row (or an earlier row of this step) took since: the row stays
  --              archived with the store's own sentence (restore_left), exactly what the trigger refused before;
  --   · FLAGGED — a value that no longer fits the column (type, shape, a retired choice), a value with no field
  --              any more, a validation rule it no longer satisfies: the row COMES BACK and is named, so
  --              nothing is lost and nothing invalid is hidden. A restore is not an edit: `required` and value
  --              rules declared after the archive never refuse it (custom.validate_values already skips them
  --              for a restore); they are not flagged either.
  w        record;
  v_held   jsonb := '{}'::jsonb;
  v_flag   jsonb := '{}'::jsonb;
  v_why    text;
  v_tf     text;
  v_src    text;
  v_table  uuid;
  v_rtype  text;
  v_have   boolean := false;
  v_ck_rtype text;
  v_fields custom.record[];
  v_rules  custom.record[];
  v_ctx    jsonb;
  g        custom.record;
  v_run    jsonb;
  v_bad    text[];
begin
  select coalesce(jsonb_object_agg(u.id::text, u.why), '{}'::jsonb) into v_held
    from (
      with b as (
        select r.id, r.table_id, r.data, o.n
          from unnest(p_ids, p_ats) with ordinality as o(id, at, n)
          join custom.record r on r.organization_id = p_organization_id and r.id = o.id and r.deleted_at = o.at
         where r.data_class = 'record' and r.table_id is not null
           and r.table_id not in (custom.table_kernel_id(), custom.field_kernel_id(), custom.rule_kernel_id(), custom.merge_field_kernel_id())
           and jsonb_typeof(r.data) = 'object'),
      uf as (
        select b.id, b.table_id, b.data, b.n, f ->> 'key' as k, coalesce(nullif(f ->> 'label', ''), f ->> 'key') as lbl,
               lower(btrim(b.data ->> (f ->> 'key'))) as v
          from b
         cross join lateral jsonb_array_elements(custom.table_unique_rule_fields(p_organization_id, b.table_id)) f)
      select distinct on (uf.id) uf.id,
             format('Another record here already has %s "%s", and %s has to be different on every record.', uf.lbl, btrim(uf.data ->> uf.k), uf.lbl) as why
        from uf
       where uf.v is not null and uf.v <> ''
         and (exists (select 1 from custom.record x
                       where x.organization_id = p_organization_id and x.table_id = uf.table_id
                         and x.deleted_at is null and x.id <> uf.id and lower(btrim(x.data ->> uf.k)) = uf.v)
              or exists (select 1 from uf u2
                          where u2.table_id = uf.table_id and u2.k = uf.k and u2.v = uf.v and u2.n < uf.n))
       order by uf.id) u;

  for w in
    select o.id, o.n, x.table_id, x.data
      from unnest(p_ids, p_ats) with ordinality as o(id, at, n)
      join custom.record x on x.organization_id = p_organization_id and x.id = o.id and x.deleted_at = o.at
     where x.data_class = 'record' and x.table_id is not null
       and x.table_id not in (custom.table_kernel_id(), custom.field_kernel_id(), custom.rule_kernel_id(), custom.merge_field_kernel_id())
       and jsonb_typeof(x.data) = 'object'
       and not (v_held ? o.id::text)
     order by o.n
  loop
    if v_table is distinct from w.table_id then
      v_table := w.table_id;
      v_tf  := custom.table_type_field(p_organization_id, w.table_id);
      v_src := custom.table_column_source(p_organization_id, w.table_id);
      v_have := false;
    end if;
    v_rtype := case when v_tf is not null then w.data ->> v_tf end;
    if not v_have or v_rtype is distinct from v_ck_rtype then
      select array_agg(f) into v_fields from custom.applicable_fields(p_organization_id, w.table_id, v_rtype) f;
      select coalesce(array_agg(t), '{}'::custom.record[]) into v_rules
        from custom.table_rules(p_organization_id, w.table_id, 'validate', v_rtype) t;
      v_have := true; v_ck_rtype := v_rtype;
    end if;

    -- A. the values against the table's columns as they are NOW (types, shape, choices; not required, not value rules)
    if v_fields is not null then
      perform set_config('custom.validating_record', w.id::text, true);
      perform set_config('custom.validating_restore', '1', true);
      begin
        perform custom.validate_values(p_organization_id, v_fields, w.data, v_rtype);
      exception when others then
        get stacked diagnostics v_why = message_text;
        v_flag := v_flag || jsonb_build_object(w.id::text, left(v_why, 400));
      end;
      perform set_config('custom.validating_restore', '', true);
    end if;

    -- B. a value whose column is gone
    if v_src = 'fields' and not (v_flag ? w.id::text) then
      v_bad := custom.undeclared_keys(p_organization_id, w.table_id, w.data);
      if v_bad is not null and cardinality(v_bad) > 0 then
        v_flag := v_flag || jsonb_build_object(w.id::text,
          format('It holds %s with no column of that name now.', (select string_agg(format('"%s"', x), ', ' order by x) from unnest(v_bad) x)));
      end if;
    end if;

    -- C. the table's validation rules, as they are now
    if cardinality(v_rules) > 0 and not (v_flag ? w.id::text) then
      v_ctx := jsonb_build_object('previous_values', w.data, 'record_id', to_jsonb(w.id),
                                  'table_id', to_jsonb(w.table_id), 'actor_level', 'null'::jsonb);
      foreach g in array v_rules loop
        v_run := custom.rule_run(p_organization_id, g.id, w.data, v_ctx);
        if custom.rule_truth(v_run -> 'answer') is false then
          v_flag := v_flag || jsonb_build_object(w.id::text,
            left(coalesce(nullif(g.data ->> 'message', ''), g.data ->> 'name', 'a rule of this table'), 400));
          exit;
        end if;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('held', v_held, 'flagged', v_flag);
end
$function$;;
