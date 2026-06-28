-- canvas_views_base_retrofit
-- Base-3 ledger; child of shared_canvas_items; user_id nullable (anon views)
-- retrofit_entity already live (personal, null_org=0)

ALTER TABLE public.canvas_views
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS set_updated_at ON public.canvas_views;

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('canvas_view','public','canvas_views','Canvas View',3,false,false,true,
   'Analytics view/impression for a shared canvas item. Base-3 ledger; user_id nullable (anon); system org for anon rows.')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_null_org bigint; v_touch boolean; v_stamp boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL) INTO v_null_org FROM public.canvas_views;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.canvas_views'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.canvas_views'::regclass) INTO v_stamp;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'canvas_views: % rows null organization_id', v_null_org; END IF;
  IF NOT v_touch    THEN RAISE EXCEPTION 'canvas_views: _touch_row trigger missing'; END IF;
  IF NOT v_stamp    THEN RAISE EXCEPTION 'canvas_views: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'canvas_views VERIFIED: null_org=%, triggers=OK', v_null_org;
END $$;
