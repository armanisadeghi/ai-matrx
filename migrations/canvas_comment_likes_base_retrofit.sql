-- canvas_comment_likes_base_retrofit
-- Base-3 ledger; child of canvas_comments (has organization_id)
-- retrofit_entity already live (parent via comment_id FK, null_org=0)

ALTER TABLE public.canvas_comment_likes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS set_updated_at ON public.canvas_comment_likes;

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('canvas_comment_like','public','canvas_comment_likes','Canvas Comment Like',3,false,false,true,
   'Append-only like on a canvas comment. Base-3 ledger; org denormalized from canvas_comments via comment_id FK.')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_null_org bigint; v_null_creator bigint; v_touch boolean; v_stamp boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL),
         count(*) FILTER (WHERE created_by IS NULL)
  INTO v_null_org, v_null_creator FROM public.canvas_comment_likes;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.canvas_comment_likes'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.canvas_comment_likes'::regclass) INTO v_stamp;
  IF v_null_org > 0     THEN RAISE EXCEPTION 'canvas_comment_likes: % rows null organization_id', v_null_org; END IF;
  IF v_null_creator > 0 THEN RAISE EXCEPTION 'canvas_comment_likes: % rows null created_by', v_null_creator; END IF;
  IF NOT v_touch        THEN RAISE EXCEPTION 'canvas_comment_likes: _touch_row trigger missing'; END IF;
  IF NOT v_stamp        THEN RAISE EXCEPTION 'canvas_comment_likes: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'canvas_comment_likes VERIFIED: null_org=%, null_creator=%, triggers=OK', v_null_org, v_null_creator;
END $$;
