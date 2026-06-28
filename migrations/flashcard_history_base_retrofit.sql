-- flashcard_history_base_retrofit
-- Strategy: personal (user_id owner; empty table; has created_at + updated_at)
-- flashcard_id FK may reference a now-renamed table — keep FK, additive only

-- Step 1: Add missing standard columns
ALTER TABLE public.flashcard_history
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS version         int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: Drop legacy updated_at trigger before backfill
DROP TRIGGER IF EXISTS set_updated_at ON public.flashcard_history;

-- Step 3: Backfill actor (table is empty — no-op but idempotent)
UPDATE public.flashcard_history SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.flashcard_history SET updated_by = user_id WHERE updated_by IS NULL;

-- Step 4: Backfill org (personal; table empty — no-op)
UPDATE public.flashcard_history f
SET organization_id = COALESCE(
  (SELECT o.id FROM public.organizations o
   WHERE o.created_by = f.user_id AND o.is_personal = true
   ORDER BY o.created_at LIMIT 1),
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
)
WHERE organization_id IS NULL;

-- Step 5: Attach _touch_row trigger
DROP TRIGGER IF EXISTS _touch_row ON public.flashcard_history;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.flashcard_history
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Step 6: Attach _stamp_actor trigger
DROP TRIGGER IF EXISTS _stamp_actor ON public.flashcard_history;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.flashcard_history
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 7: Attach _version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.flashcard_history;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.flashcard_history
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('flashcard_history');

-- Step 8: Register entity type (idempotent)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, notes)
VALUES ('flashcard_history', 'public', 'flashcard_history', 'Flashcard History', 'Per-user per-card review history tracking correct/incorrect counts')
ON CONFLICT (token) DO NOTHING;

-- Step 9: Self-verify (table empty so null counts will be 0)
DO $$
DECLARE
  v_touch bigint;
  v_stamp bigint;
BEGIN
  SELECT count(*) INTO v_touch FROM pg_trigger
    WHERE tgrelid='public.flashcard_history'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger
    WHERE tgrelid='public.flashcard_history'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;

  IF v_touch = 0 THEN
    RAISE EXCEPTION 'flashcard_history: _touch_row trigger not attached';
  END IF;
  IF v_stamp = 0 THEN
    RAISE EXCEPTION 'flashcard_history: _stamp_actor trigger not attached';
  END IF;
  RAISE NOTICE 'flashcard_history: retrofit OK (empty table; triggers attached)';
END $$;
