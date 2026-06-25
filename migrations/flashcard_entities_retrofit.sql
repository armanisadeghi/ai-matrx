-- flashcard_entities_retrofit.sql
-- Wave-3 ADDITIVE Step-1 retrofit (no RLS flip, no drops, no NOT NULL).
-- Base-1 ENTITIES: flashcard_data, flashcard_sets (both top-level, personal org, owner=user_id).
-- SKIPPED (out of scope for this additive pass):
--   flashcard_history       -> Base-3 SRS/review log (per scope step 3)
--   flashcard_images        -> child attachment, no owner/org entity
--   flashcard_set_relations -> Base-2 join (flashcard_id+set_id); apply_rls(...,'join') in the later RLS pass
-- Litter (project_id) left in place per scope. _mirror_proj trigger on flashcard_data is preserved
-- (retrofit_entity only drops _touch_row/_stamp_actor/legacy set_updated_at).
-- No created_by collision (neither table had created_by). No VARCHAR-version collision (neither had version).
-- Idempotent: retrofit_entity uses ADD COLUMN IF NOT EXISTS + IS NULL-guarded backfills + DROP/CREATE triggers.

DO $$
DECLARE r text;
BEGIN
  -- Base-1 entity: flashcard cards. owner=user_id, personal org. Legacy trigger: set_updated_at.
  r := platform.retrofit_entity('flashcard_data', 'flashcard',     'personal', 'user_id', NULL, NULL, 'set_updated_at');
  RAISE NOTICE '%', r;

  -- Base-1 entity: flashcard sets (PK is set_id, not id — harmless, routine never references the PK).
  r := platform.retrofit_entity('flashcard_sets', 'flashcard_set', 'personal', 'user_id', NULL, NULL, 'set_updated_at');
  RAISE NOTICE '%', r;
END $$;

-- Self-verify (rolls back the whole migration on failure).
DO $$
DECLARE
  v_null_org_data int; v_null_cb_data int;
  v_null_org_sets int; v_null_cb_sets int;
  v_trig_data int; v_trig_sets int;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL),
         count(*) FILTER (WHERE created_by IS NULL)
    INTO v_null_org_data, v_null_cb_data FROM public.flashcard_data;
  SELECT count(*) FILTER (WHERE organization_id IS NULL),
         count(*) FILTER (WHERE created_by IS NULL)
    INTO v_null_org_sets, v_null_cb_sets FROM public.flashcard_sets;

  SELECT count(*) INTO v_trig_data FROM pg_trigger
    WHERE tgrelid = 'public.flashcard_data'::regclass AND tgname IN ('_touch_row','_stamp_actor') AND NOT tgisinternal;
  SELECT count(*) INTO v_trig_sets FROM pg_trigger
    WHERE tgrelid = 'public.flashcard_sets'::regclass AND tgname IN ('_touch_row','_stamp_actor') AND NOT tgisinternal;

  IF v_null_org_data > 0 OR v_null_org_sets > 0 THEN
    RAISE EXCEPTION 'flashcard retrofit: null org remains (data=%, sets=%)', v_null_org_data, v_null_org_sets;
  END IF;
  IF v_null_cb_data > 0 OR v_null_cb_sets > 0 THEN
    RAISE EXCEPTION 'flashcard retrofit: null created_by remains (data=%, sets=%)', v_null_cb_data, v_null_cb_sets;
  END IF;
  IF v_trig_data <> 2 OR v_trig_sets <> 2 THEN
    RAISE EXCEPTION 'flashcard retrofit: triggers not attached (data=%, sets=%)', v_trig_data, v_trig_sets;
  END IF;

  -- assert the preserved _mirror_proj trigger on flashcard_data still exists
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.flashcard_data'::regclass AND tgname='_mirror_proj' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'flashcard retrofit: _mirror_proj trigger on flashcard_data was lost';
  END IF;
END $$;
