-- workbench_udt_canonical_step3_registry.sql
-- ---------------------------------------------------------------------------
-- STEP 3 of 4 — point the sharing registry at the canonical columns for the
-- four UDT entities, so sharing routes through the visibility ENUM path rather
-- than the legacy two-state make_resource_public path.
--
--   owner_column     : 'user_id'   -> 'created_by'
--   is_public_column : 'is_public' -> NULL
--
-- WHY is_public_column BECOMES NULL, not 'visibility':
--   The column is typed as "the legacy BOOLEAN public flag, if any".
--   public.get_share_capabilities probes the live table for a `visibility` /
--   `card_visibility` column FIRST and only falls back to is_public_column, so
--   once step 1 added `visibility` these four already report
--   public_state_kind='enum'. Leaving a non-NULL boolean here is what wrongly
--   routes a canonical table through make_resource_public — the exact defect
--   fixed for content_ir_kind_instance (D117) and documented on the data_store
--   and scope rows in utils/permissions/registry.ts.
--
-- owner_column moves now, while created_by and user_id are still guaranteed
-- equal by the step-1 bridge trigger. Doing it in the same change as the step-4
-- column drop would leave a window where the registry names a column that no
-- longer exists.
-- ---------------------------------------------------------------------------

UPDATE platform.shareable_resource_registry
   SET owner_column     = 'created_by',
       is_public_column = NULL,
       updated_at       = now()
 WHERE resource_type IN ('workbook', 'udt_document', 'dataset', 'structured_list');

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM platform.shareable_resource_registry
  WHERE resource_type IN ('workbook', 'udt_document', 'dataset', 'structured_list')
    AND (owner_column <> 'created_by' OR is_public_column IS NOT NULL);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'step3: % registry row(s) did not take the canonical columns', v_bad;
  END IF;
END $$;
