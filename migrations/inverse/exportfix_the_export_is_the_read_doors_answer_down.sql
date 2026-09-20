-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE INVERSE of migrations/campaign/exportfix_the_export_is_the_read_doors_answer.sql: it puts
-- `custom.io_export` back exactly as it stood on the main database on 2026-09-20, in which the
-- page and the withheld-column map were built by ONE select with a LEFT JOIN LATERAL of
-- `jsonb_each(_hidden)` onto the page — so the export emitted every row once per withheld
-- column (20 rows for the 10 `custom.read_record` opens), and raised 22023 "field name must not
-- be null" for every reader the store withholds nothing from, which is 250 of the 256
-- (member, Table) pairs census 13 measured. `p_required` was accepted and never read.
--
-- `scripts/campaign-tests/exportfix_red.sql` executes these bytes inside a rolled-back
-- transaction and requires the census to name the same rows again.

CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols   text[];
  v_token  text;
  v_rows   jsonb;
  v_held   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES BOTH QUESTIONS NOW: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  select coalesce(jsonb_agg(x.doc order by x.ord), '[]'::jsonb),
         coalesce(jsonb_object_agg(h.key, h.value), '{}'::jsonb)
    into v_rows, v_held
    from (select row_number() over () as ord,
                 (select coalesce(jsonb_object_agg(c, coalesce(rr.document -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc,
                 rr.document -> '_hidden' as hidden
            from custom.read_records(p_organization_id, p_table_id, false,
                                     greatest(1, least(coalesce(p_limit, 10000), 100000)), 0) rr) x
    left join lateral jsonb_each(coalesce(x.hidden, '{}'::jsonb)) h on true;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$

;
