-- canvas_scores_base_retrofit
-- Base-3 ledger; child of shared_canvas_items; retrofit_entity already live (personal, null_org=0)

ALTER TABLE public.canvas_scores
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS set_updated_at ON public.canvas_scores;

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('canvas_score','public','canvas_scores','Canvas Score',3,false,false,true,
   'Score/attempt record for a shared canvas item. Base-3 ledger; user_id nullable (guest attempts).')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_null_org bigint; v_null_creator bigint; v_touch boolean; v_stamp boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL),
         count(*) FILTER (WHERE created_by IS NULL)
  INTO v_null_org, v_null_creator FROM public.canvas_scores;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.canvas_scores'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.canvas_scores'::regclass) INTO v_stamp;
  IF v_null_org > 0     THEN RAISE EXCEPTION 'canvas_scores: % rows null organization_id', v_null_org; END IF;
  IF v_null_creator > 0 THEN RAISE EXCEPTION 'canvas_scores: % rows null created_by', v_null_creator; END IF;
  IF NOT v_touch        THEN RAISE EXCEPTION 'canvas_scores: _touch_row trigger missing'; END IF;
  IF NOT v_stamp        THEN RAISE EXCEPTION 'canvas_scores: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'canvas_scores VERIFIED: null_org=%, null_creator=%, triggers=OK', v_null_org, v_null_creator;
END $$;
