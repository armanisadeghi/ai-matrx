-- ctx_matter_qme_report_reference.sql
--
-- First real consumer of Context Reference Cells (see ctx_context_reference_cells.sql):
-- the Matter "QME Report" context item becomes a `reference` cell that points at
-- `file`, allowing up to 10 PDFs (a matter can have several QME/AME reports over
-- its life). Also backfills the one pre-existing live value — a bare file uuid in
-- `value_text` left over from the old `value_type='object'` shape — into the
-- canonical ```matrx kind:"reference" fence, going through `context.write_context_value`
-- so validation + the `context_value_refs` reverse index run exactly like any other write.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

-- 1) Item definition: object -> reference, file only, up to 10 -----------------
UPDATE context.context_items
   SET value_type = 'reference',
       allowed_reference_types = ARRAY['file'],
       max_items = 10,
       allowed_scope_type_ids = NULL,
       custom_component = NULL,
       description = 'The QME (or AME) medical-legal report PDF(s) for this matter.'
 WHERE id = '46771d48-6ef6-4a89-bb5a-8c3ec004e50e'
   AND value_type <> 'reference';

-- 2) Backfill the one live legacy value (bare file uuid) into a canonical fence -
DO $$
DECLARE
  v_item_id uuid := '46771d48-6ef6-4a89-bb5a-8c3ec004e50e';
  v_row record;
BEGIN
  FOR v_row IN
    SELECT civ.id, civ.scope_id, civ.value_text
      FROM context.context_item_values civ
     WHERE civ.context_item_id = v_item_id
       AND civ.is_current = true
       AND civ.value_text IS NOT NULL
       AND civ.value_text !~ '```matrx'
  LOOP
    -- Legacy cells here were always a single bare file uuid (never comma-lists).
    IF v_row.value_text ~ '^[0-9a-fA-F-]{36}$' THEN
      PERFORM context.write_context_value(
        p_item_id => v_item_id,
        p_scope_id => v_row.scope_id,
        p_value_text => '```matrx' || chr(10) || jsonb_pretty(jsonb_build_object(
            'matrx_version', 1,
            'kind', 'reference',
            'type', 'file',
            'items', jsonb_build_array(jsonb_build_object('file_id', v_row.value_text))
          )) || chr(10) || '```',
        p_change_summary => 'Backfill: migrate legacy bare file-id value to canonical reference fence',
        p_source_type => 'manual'
      );
    END IF;
  END LOOP;
END $$;
