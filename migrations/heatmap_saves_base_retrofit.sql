-- heatmap_saves_base_retrofit
-- Base-1 entity; user_id is TEXT (not UUID) — retrofit_entity can't cast; manual retrofit
-- 0 rows total; legacy trigger: trigger_update_heatmap_saves_updated_at
-- has is_public boolean → also add visibility column (keep is_public per instructions)

-- Step 1: Drop legacy updated_at trigger before adding columns
DROP TRIGGER IF EXISTS trigger_update_heatmap_saves_updated_at ON public.heatmap_saves;

-- Step 2: Additive std cols
ALTER TABLE public.heatmap_saves
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version         int         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility      text        NOT NULL DEFAULT 'private';

-- Step 3: Backfill visibility from is_public (table empty; idempotent no-op)
UPDATE public.heatmap_saves
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END
WHERE visibility = 'private' OR visibility IS NULL;

-- Step 4: Attach standard triggers
CREATE OR REPLACE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.heatmap_saves
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE OR REPLACE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.heatmap_saves
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 5: Register entity_type
INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('heatmap_save','public','heatmap_saves','Heatmap Save',1,true,true,true,
   'User-saved geographic heatmap config. user_id is TEXT (legacy); org backfilled via personal org. has is_public → visibility col added (both kept).')
ON CONFLICT (token) DO NOTHING;

-- Step 6: Self-verify
DO $$
DECLARE
  v_null_org  bigint;
  v_touch     boolean;
  v_stamp     boolean;
  v_legacy    boolean;
  v_vis_col   boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL) INTO v_null_org FROM public.heatmap_saves;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.heatmap_saves'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.heatmap_saves'::regclass) INTO v_stamp;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trigger_update_heatmap_saves_updated_at' AND tgrelid='public.heatmap_saves'::regclass) INTO v_legacy;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='heatmap_saves' AND column_name='visibility') INTO v_vis_col;

  IF v_null_org > 0 THEN RAISE EXCEPTION 'heatmap_saves: % rows null organization_id', v_null_org; END IF;
  IF NOT v_touch    THEN RAISE EXCEPTION 'heatmap_saves: _touch_row trigger missing'; END IF;
  IF NOT v_stamp    THEN RAISE EXCEPTION 'heatmap_saves: _stamp_actor trigger missing'; END IF;
  IF v_legacy       THEN RAISE EXCEPTION 'heatmap_saves: legacy trigger still present'; END IF;
  IF NOT v_vis_col  THEN RAISE EXCEPTION 'heatmap_saves: visibility column missing'; END IF;
  RAISE NOTICE 'heatmap_saves VERIFIED: 0 rows, triggers=OK, visibility=OK, legacy=dropped';
END $$;
