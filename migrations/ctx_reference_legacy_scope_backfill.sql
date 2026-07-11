-- ctx_reference_legacy_scope_backfill.sql
--
-- Second half of ctx_context_reference_cells.sql's backfill note: the 3
-- pre-existing value_type='reference' items (client, practice_area, ame_qme)
-- had their item-definition config backfilled there (allowed_reference_types,
-- allowed_scope_type_ids), but their existing CELL VALUES still carried the
-- old value_reference_id/value_reference_type shape, not a canonical
-- ```matrx kind:"reference" fence in value_text. That left them rendering as
-- raw "-> <uuid>" text instead of chips on read-only surfaces.
--
-- This migrates every still-legacy current value on those 3 items into a
-- fence, through context.write_context_value so validation + the
-- context_value_refs reverse index run exactly like any other write.
-- Idempotent: only touches rows where value_text IS NULL AND value_reference_id
-- IS NOT NULL (i.e. never touches a cell already on the new shape).
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus).

DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT civ.id, civ.context_item_id, civ.scope_id, civ.value_reference_id, civ.value_reference_type
      FROM context.context_item_values civ
      JOIN context.context_items ci ON ci.id = civ.context_item_id
     WHERE ci.id IN (
             '91399c45-a00d-43f0-a3ec-7e8334afc434', -- client
             '892715ce-4151-48ce-9c15-8d3c008dca04', -- practice_area
             'fea205df-901a-4c5a-9101-1ce89fa9634d'  -- ame_qme
           )
       AND civ.is_current = true
       AND civ.value_text IS NULL
       AND civ.value_reference_id IS NOT NULL
       AND civ.value_reference_type IS NOT NULL
  LOOP
    PERFORM context.write_context_value(
      p_item_id => v_row.context_item_id,
      p_scope_id => v_row.scope_id,
      p_value_text => '```matrx' || chr(10) || jsonb_pretty(jsonb_build_object(
          'matrx_version', 1,
          'kind', 'reference',
          'type', v_row.value_reference_type,
          'items', jsonb_build_array(jsonb_build_object('id', v_row.value_reference_id))
        )) || chr(10) || '```',
      p_change_summary => 'Backfill: migrate legacy value_reference_id/value_reference_type to canonical reference fence',
      p_source_type => 'manual'
    );
  END LOOP;
END $$;
