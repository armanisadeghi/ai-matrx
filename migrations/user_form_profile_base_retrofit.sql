-- user_form_profile base retrofit
-- Strategy: singleton keyed on user_id (PK), no uuid id col — manual additive only
-- 1 row; no org col; already has updated_at (via user_form_profile_set_updated_at trigger)

-- Add missing standard columns
ALTER TABLE public.user_form_profile
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_by      uuid,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill actor
UPDATE public.user_form_profile
SET created_by = user_id
WHERE created_by IS NULL;

-- Backfill org from personal org
UPDATE public.user_form_profile
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true
    AND created_by = user_form_profile.user_id
  ORDER BY created_at
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Drop legacy updated_at trigger
DROP TRIGGER IF EXISTS user_form_profile_set_updated_at ON public.user_form_profile;

-- Attach _stamp_actor
DROP TRIGGER IF EXISTS trg_user_form_profile_stamp_actor ON public.user_form_profile;
CREATE TRIGGER trg_user_form_profile_stamp_actor
  BEFORE INSERT OR UPDATE ON public.user_form_profile
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Simple updated_at maintenance
CREATE OR REPLACE FUNCTION public._touch_user_form_profile()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_form_profile_touch_updated_at ON public.user_form_profile;
CREATE TRIGGER trg_user_form_profile_touch_updated_at
  BEFORE INSERT OR UPDATE ON public.user_form_profile
  FOR EACH ROW EXECUTE FUNCTION public._touch_user_form_profile();

-- Register entity type
INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('user_form_profile', 'User Form Profile', 'public', 'user_form_profile')
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
  FROM public.user_form_profile;

  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'user_form_profile: % rows have NULL organization_id', v_null_org;
  END IF;
  IF v_null_cb > 0 THEN
    RAISE EXCEPTION 'user_form_profile: % rows have NULL created_by', v_null_cb;
  END IF;
  RAISE NOTICE 'user_form_profile retrofit OK: total=%, null_org=%, null_cb=%', v_total, v_null_org, v_null_cb;
END $$;
