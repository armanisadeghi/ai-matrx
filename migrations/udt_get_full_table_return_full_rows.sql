-- udt_get_full_table_return_full_rows.sql
--
-- Makes `public.get_full_table(jsonb)` ADOPTABLE. Third and final step for this
-- RPC today (after the 42803 repair and the runtime probe).
--
-- ── WHY: the primitive existed, worked, and still could not be used ─────────
-- Mapping the frontend showed the RPC has 0 callers but its CAPABILITY —
-- "a dataset's schema + size without loading the dataset" — has 8 live
-- consumers, every one of which pays for a full-table materialization or a
-- hand-rolled reconstruction to get it:
--
--   components/user-generated-table-data/UserTableViewer.tsx:485  the primary
--     dataset surface. Calls get_user_table_complete (ALL rows, no LIMIT),
--     destructures ONLY {table, fields, row_count}, never reads .data, then
--     makes a SECOND round-trip for the page it renders. Opening any dataset
--     materializes the entire dataset and throws it away.
--   features/resource-manager/resource-picker/TablesResourcePicker.tsx:117
--   app/(public)/free/zip-code-heatmap/components/TableDataSource.tsx:142
--   components/user-generated-table-data/TableSettingsModal.tsx:76
--   utils/user-table-utls/table-utils.ts:325 (getTableDetails → AppendToTableDialog,
--     SaveTableModal — fields only)
--   components/user-generated-table-data/ExportTableModal.tsx:64  already
--     hand-rolls a direct udt_dataset_fields query, with the comment
--     "Fetch fields separately since the paginated endpoint doesn't include them"
--   features/matrx-envelope/referenceResolvers.ts:243  two parallel queries
--     rebuilding "table name + columns in field_order" by hand
--
-- ── THE BLOCKER: it stripped exactly the keys those consumers read ──────────
--   table:   `to_jsonb(t) - 'row_ordering_config'`
--            UserTableViewer.tsx:509 reads
--            currentTableInfo?.row_ordering_config?.default_sort to apply a
--            dataset's saved default sort. Swapping to get_full_table as it was
--            shaped would have SILENTLY broken saved sort on the primary surface.
--            The full row also carries validation_mode, which TableSettingsModal
--            wants and which get_user_table_complete never returned either.
--   columns: `to_jsonb(tf) - 'validation_rules' - 'default_value'`
--            exactly the two keys ExportTableModal's hand-rolled query selects.
--
-- So it was shaped for nobody. Both tables are small, plain metadata rows (no
-- blobs, no embeddings — verified against information_schema), so the whole row
-- is the right payload and the subtractions bought nothing.
--
-- Changing the shape is FREE and cannot regress a caller, because there are no
-- callers. Doing it now, BEFORE anyone adopts it, is the cheap moment; doing it
-- after would be a breaking change to every adopter.
--
-- This migration does NOT convert the consumers — that touches a live primary
-- surface and needs per-callsite verification in a browser (saved sort,
-- pagination totals, export column set). It makes the primitive correct so that
-- work is a drop-in.
--
-- The probe is tightened in the same change to assert the previously-stripped
-- keys are present, so the shape cannot quietly regress to the unusable form.
--
-- Idempotent. Safe to re-run.

create or replace function public.get_full_table(ref jsonb)
returns jsonb
language plpgsql
stable
as $function$
DECLARE
  v_table_id uuid;
  v_table_name text;
  j jsonb;
BEGIN
  v_table_id := (ref->>'table_id')::uuid;
  v_table_name := ref->>'table_name';

  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION 'Table not found or name mismatch';
  END IF;

  j := jsonb_build_object(
    -- Full row. row_ordering_config in particular is load-bearing: it carries
    -- default_sort, which the dataset viewer applies on first load.
    'table',
    (
      SELECT to_jsonb(t)
      FROM workbench.udt_datasets t
      WHERE t.id = v_table_id
    ),
    -- Full field rows, in field_order. validation_rules and default_value are
    -- needed by export and by any column-editing surface.
    'columns',
    (
      SELECT COALESCE(
               jsonb_agg(to_jsonb(tf) ORDER BY tf.field_order, tf.created_at),
               '[]'::jsonb)
      FROM workbench.udt_dataset_fields tf
      WHERE tf.table_id = v_table_id
    ),
    -- COUNT(*), not the length of a materialized row array. This is the whole
    -- reason to call this instead of get_user_table_complete.
    'row_count',
    (
      SELECT COUNT(*)::int
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
    )
  );

  RETURN j;
END;
$function$;

-- Tighten the probe: shape regressions must fail as loudly as a raise.
update audit.function_runtime_probe
set probe_sql = $probe$select case
  when (select count(*) from workbench.udt_dataset_fields) = 0 then 1
  else 1 / (case when (
      select jsonb_typeof(probe.res->'columns') = 'array'
         and probe.res->'table' is not null
         and jsonb_typeof(probe.res->'row_count') = 'number'
         and jsonb_array_length(probe.res->'columns') = probe.n
         and (probe.res->'table') ? 'row_ordering_config'
         and (probe.res->'table') ? 'validation_mode'
         and (probe.res->'columns'->0) ? 'validation_rules'
         and (probe.res->'columns'->0) ? 'default_value'
         and (probe.res->'columns'->0) ? 'field_order'
      from (
        select public.get_full_table(jsonb_build_object('table_id', tf.table_id)) as res,
               count(*)::int as n
        from workbench.udt_dataset_fields tf
        group by tf.table_id
        order by count(*) desc
        limit 1
      ) probe
    ) then 1 else 0 end)
  end$probe$,
    note = 'Executes the RPC against the live dataset with the most fields and asserts the FULL envelope: columns array length matches the real field count and in field_order, plus the keys consumers depend on (table.row_ordering_config for saved default sort, table.validation_mode, columns[].validation_rules/default_value/field_order). Guards both the 42803 aggregate-ordering regression and a regression back to the stripped, unadoptable shape. Read-only.'
where function_signature = 'public.get_full_table(jsonb)';

select audit.refresh();

do $assert$
declare v_res jsonb; v_id uuid; v_real int; v_fail int;
begin
  select tf.table_id into v_id
  from workbench.udt_dataset_fields tf
  group by tf.table_id order by count(*) desc limit 1;

  if v_id is null then
    raise notice 'No dataset with fields; shape assertions skipped.';
  else
    v_res := public.get_full_table(jsonb_build_object('table_id', v_id));

    if not ((v_res->'table') ? 'row_ordering_config') then
      raise exception 'table payload is missing row_ordering_config — the dataset viewer''s saved default sort would break on adoption.';
    end if;
    if not ((v_res->'table') ? 'validation_mode') then
      raise exception 'table payload is missing validation_mode.';
    end if;
    if not ((v_res->'columns'->0) ? 'validation_rules')
       or not ((v_res->'columns'->0) ? 'default_value') then
      raise exception 'column payload is missing validation_rules/default_value — export would still need its hand-rolled query.';
    end if;
    -- Still no rows: that is the entire point of this RPC.
    if (v_res ? 'data') or (v_res ? 'rows') then
      raise exception 'get_full_table must not return row data.';
    end if;
  end if;

  select count(*) into v_fail from audit.broken_functions
   where level = 'runtime_error' and signature like '%get_full_table%';
  if v_fail > 0 then
    raise exception 'The tightened get_full_table probe FAILED during refresh.';
  end if;

  select count(*) into v_real from audit.broken_functions where severity = 'real';
  if v_real <> 0 then
    raise exception 'Expected 0 real findings, found %.', v_real;
  end if;
end $assert$;
