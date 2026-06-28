-- user_stats_base_retrofit
-- Strategy: personal (user_id IS the PK — singleton per user, empty table)
-- No id col, no created_at — add both. Has updated_at + set_updated_at trigger.

-- Step 1: Add missing standard columns
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS id              uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version         int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: Drop legacy updated_at trigger before backfill
DROP TRIGGER IF EXISTS set_updated_at ON public.user_stats;

-- Step 3: Backfill actor (empty table — no-op)
UPDATE public.user_stats SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.user_stats SET updated_by = user_id WHERE updated_by IS NULL;

-- Step 4: Backfill org (personal; empty — no-op)
UPDATE public.user_stats s
SET organization_id = COALESCE(
  (SELECT o.id FROM public.organizations o
   WHERE o.created_by = s.user_id AND o.is_personal = true
   ORDER BY o.created_at LIMIT 1),
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
)
WHERE organization_id IS NULL;

-- Step 5: Attach _touch_row trigger
DROP TRIGGER IF EXISTS _touch_row ON public.user_stats;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Step 6: Attach _stamp_actor trigger
DROP TRIGGER IF EXISTS _stamp_actor ON public.user_stats;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 7: Attach _version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.user_stats;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('user_stat');

-- Step 8: Register entity type (idempotent)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, notes)
VALUES ('user_stat', 'public', 'user_stats', 'User Stats', 'Gamification + social stats singleton per user (xp, level, streak, scores, counts)')
ON CONFLICT (token) DO NOTHING;

-- Step 9: Self-verify (empty table)
DO $$
DECLARE
  v_touch bigint;
  v_stamp bigint;
BEGIN
  SELECT count(*) INTO v_touch FROM pg_trigger
    WHERE tgrelid='public.user_stats'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger
    WHERE tgrelid='public.user_stats'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;

  IF v_touch = 0 THEN
    RAISE EXCEPTION 'user_stats: _touch_row trigger not attached';
  END IF;
  IF v_stamp = 0 THEN
    RAISE EXCEPTION 'user_stats: _stamp_actor trigger not attached';
  END IF;
  RAISE NOTICE 'user_stats: retrofit OK (empty table; triggers attached)';
END $$;
