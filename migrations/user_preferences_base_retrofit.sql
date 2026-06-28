-- user_preferences base retrofit
-- Singleton table: PK = user_id (no uuid id column)
-- _touch_row and _version_capture require an `id` uuid column — not applicable here.
-- _stamp_actor only. No version column (singleton pattern, no id anchor).
-- Legacy trigger replaced: update_user_preferences_updated_at

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;

UPDATE public.user_preferences
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.user_preferences up
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true AND created_by = up.user_id
  ORDER BY created_at LIMIT 1
)
WHERE organization_id IS NULL;

UPDATE public.user_preferences
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

-- _stamp_actor only (no _touch_row: no id uuid; updated_at still tracked by col default)
DROP TRIGGER IF EXISTS trg_stamp_actor ON public.user_preferences;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Restore updated_at stamping (lightweight replacement for removed legacy trigger)
CREATE OR REPLACE FUNCTION public.set_updated_at_user_preferences()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_updated_at ON public.user_preferences;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_user_preferences();

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_preference', 'User Preference', 'public', 'user_preferences')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE v_null_org int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.user_preferences WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_preferences: % rows still have NULL organization_id', v_null_org;
  END IF;
END $$;
