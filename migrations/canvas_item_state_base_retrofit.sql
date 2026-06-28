-- canvas_item_state_base_retrofit
-- Strategy: parent (hangs off canvas_items which has organization_id)
-- Composite PK (canvas_id, user_id) — add id uuid col for standard compatibility
-- Drop both legacy triggers: canvas_item_state_touch_trg + set_updated_at
-- Applied as canvas_item_state_base_retrofit_v2 due to migration timestamp collision on first attempt

-- Step 1: Add id uuid col + missing standard columns
ALTER TABLE public.canvas_item_state
  ADD COLUMN IF NOT EXISTS id              uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS version         int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: Drop legacy triggers before backfill
DROP TRIGGER IF EXISTS canvas_item_state_touch_trg ON public.canvas_item_state;
DROP TRIGGER IF EXISTS set_updated_at ON public.canvas_item_state;

-- Step 3: Backfill actor (empty table — no-op)
UPDATE public.canvas_item_state SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.canvas_item_state SET updated_by = user_id WHERE updated_by IS NULL;

-- Step 4: Backfill org from parent canvas_items
UPDATE public.canvas_item_state s
SET organization_id = ci.organization_id
FROM public.canvas_items ci
WHERE ci.id = s.canvas_id
  AND s.organization_id IS NULL
  AND ci.organization_id IS NOT NULL;

-- Fallback for any rows where parent had no org
UPDATE public.canvas_item_state
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
WHERE organization_id IS NULL;

-- Step 5: Attach _touch_row trigger
DROP TRIGGER IF EXISTS _touch_row ON public.canvas_item_state;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.canvas_item_state
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Step 6: Attach _stamp_actor trigger
DROP TRIGGER IF EXISTS _stamp_actor ON public.canvas_item_state;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.canvas_item_state
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 7: Attach _version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.canvas_item_state;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.canvas_item_state
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('canvas_item_state');

-- Step 8: Register entity type (idempotent)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, notes, is_component)
VALUES ('canvas_item_state', 'public', 'canvas_item_state', 'Canvas Item State', 'Per-user per-canvas-item UI state; child of canvas_items', true)
ON CONFLICT (token) DO NOTHING;

-- Step 9: Self-verify (empty table)
DO $$
DECLARE
  v_touch bigint;
  v_stamp bigint;
BEGIN
  SELECT count(*) INTO v_touch FROM pg_trigger
    WHERE tgrelid='public.canvas_item_state'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger
    WHERE tgrelid='public.canvas_item_state'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;

  IF v_touch = 0 THEN
    RAISE EXCEPTION 'canvas_item_state: _touch_row trigger not attached';
  END IF;
  IF v_stamp = 0 THEN
    RAISE EXCEPTION 'canvas_item_state: _stamp_actor trigger not attached';
  END IF;
  RAISE NOTICE 'canvas_item_state: retrofit OK (empty table; triggers attached)';
END $$;
