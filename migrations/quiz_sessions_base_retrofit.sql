-- quiz_sessions_base_retrofit
-- Strategy: personal (has organization_id already, user_id is owner)
-- Has is_public → add visibility + backfill. Has project_id litter (keep, ADDITIVE only).

-- Step 1: Add missing standard columns
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS version         int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility      text NOT NULL DEFAULT 'private';

-- Step 2: Drop legacy updated_at trigger before backfill
DROP TRIGGER IF EXISTS update_quiz_sessions_updated_at ON public.quiz_sessions;

-- Step 3: Backfill actor
UPDATE public.quiz_sessions SET created_by = user_id WHERE created_by IS NULL;
UPDATE public.quiz_sessions SET updated_by = user_id WHERE updated_by IS NULL;

-- Step 4: Backfill org (personal — pick the user's personal org, fallback to system org)
UPDATE public.quiz_sessions q
SET organization_id = COALESCE(
  (SELECT o.id FROM public.organizations o
   WHERE o.created_by = q.user_id AND o.is_personal = true
   ORDER BY o.created_at LIMIT 1),
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
)
WHERE organization_id IS NULL;

-- Step 5: Backfill visibility from is_public
UPDATE public.quiz_sessions
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END
WHERE visibility = 'private';

-- Step 6: Attach _touch_row trigger
DROP TRIGGER IF EXISTS _touch_row ON public.quiz_sessions;
CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Step 7: Attach _stamp_actor trigger
DROP TRIGGER IF EXISTS _stamp_actor ON public.quiz_sessions;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Step 8: Attach _version_capture trigger
DROP TRIGGER IF EXISTS _version_capture ON public.quiz_sessions;
CREATE TRIGGER _version_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('quiz_session');

-- Step 9: Register entity type (idempotent)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, notes)
VALUES ('quiz_session', 'public', 'quiz_sessions', 'Quiz Session', 'A user quiz session with state and scoring')
ON CONFLICT (token) DO NOTHING;

-- Step 10: Self-verify
DO $$
DECLARE
  v_null_org   bigint;
  v_null_actor bigint;
  v_touch      bigint;
  v_stamp      bigint;
BEGIN
  SELECT count(*) INTO v_null_org   FROM public.quiz_sessions WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_actor FROM public.quiz_sessions WHERE created_by IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger
    WHERE tgrelid='public.quiz_sessions'::regclass AND tgname='_touch_row' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger
    WHERE tgrelid='public.quiz_sessions'::regclass AND tgname='_stamp_actor' AND NOT tgisinternal;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'quiz_sessions: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_actor > 0 THEN
    RAISE EXCEPTION 'quiz_sessions: % rows have NULL created_by', v_null_actor;
  END IF;
  IF v_touch = 0 THEN
    RAISE EXCEPTION 'quiz_sessions: _touch_row trigger not attached';
  END IF;
  IF v_stamp = 0 THEN
    RAISE EXCEPTION 'quiz_sessions: _stamp_actor trigger not attached';
  END IF;
  RAISE NOTICE 'quiz_sessions: retrofit OK — null_org=%, null_actor=%, triggers=OK', v_null_org, v_null_actor;
END $$;
