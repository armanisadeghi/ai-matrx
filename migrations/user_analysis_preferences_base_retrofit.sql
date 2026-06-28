-- user_analysis_preferences base retrofit
-- Strategy: singleton keyed on user_id (PK), no uuid id col — manual additive only
-- 0 rows; no org col; already has updated_at (via user_analysis_preferences_touch_updated_at trigger)

-- Add missing standard columns (no version since no separate id PK)
ALTER TABLE public.user_analysis_preferences
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill (empty table)
UPDATE public.user_analysis_preferences
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.user_analysis_preferences
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = user_analysis_preferences.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Drop legacy updated_at trigger; replace with _stamp_actor + simple updated_at
DROP TRIGGER IF EXISTS user_analysis_preferences_touch_updated_at ON public.user_analysis_preferences;

-- Attach _stamp_actor only (no _touch_row since no version col — singleton pattern)
DROP TRIGGER IF EXISTS trg_user_analysis_preferences_stamp_actor ON public.user_analysis_preferences;
CREATE TRIGGER trg_user_analysis_preferences_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_analysis_preferences
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Simple updated_at maintenance (no version col)
CREATE OR REPLACE FUNCTION public._touch_user_analysis_preferences()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_analysis_preferences_touch_updated_at ON public.user_analysis_preferences;
CREATE TRIGGER trg_user_analysis_preferences_touch_updated_at
  BEFORE INSERT OR UPDATE ON public.user_analysis_preferences
  FOR EACH ROW EXECUTE FUNCTION public._touch_user_analysis_preferences();

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_analysis_preference', 'User Analysis Preference', 'public', 'user_analysis_preferences')
ON CONFLICT (token) DO NOTHING;

-- Self-verify
DO $$
DECLARE
  v_null_org  int;
  v_null_cb   int;
  v_total     int;
BEGIN
  SELECT
    count(*) FILTER (WHERE organization_id IS NULL),
    count(*) FILTER (WHERE created_by IS NULL),
    count(*)
  INTO v_null_org, v_null_cb, v_total
  FROM public.user_analysis_preferences;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_analysis_preferences: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_cb > 0 AND v_total > 0 THEN
    RAISE EXCEPTION 'user_analysis_preferences: % rows have NULL created_by', v_null_cb;
  END IF;
  RAISE NOTICE 'user_analysis_preferences retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
