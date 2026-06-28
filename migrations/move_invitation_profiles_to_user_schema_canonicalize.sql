-- Migration: move_invitation_profiles_to_user_schema_canonicalize
-- Applied: 2026-06-27
-- Moves public.invitation_codes, public.invitation_requests, public.profiles
-- to the 'user' schema and fully canonicalizes each table.
--
-- Tables: invitation_codes (0 rows), invitation_requests (8 rows), profiles (76 rows)
-- Tokens: invitation_code, invitation_request, profile
-- All three: entity variant RLS via iam.apply_rls
-- invitation_requests has an additional anon_insert policy for public form submissions.
-- profiles: created_by = id (user's own profile row), org backfilled from personal org.
-- invitation_codes: org = system org (admin-created).
-- invitation_requests: org = system org (anon submissions, no tenant).
--
-- NOTE: The 'user' schema must be exposed in PostgREST (Supabase Dashboard →
-- Settings → API → Extra Search Path) before FE .schema('user') calls succeed.
-- FE code has been updated to use .schema('user').from('...') already.

-- ============================================================
-- Create user schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS "user";

-- ============================================================
-- invitation_codes
-- ============================================================
ALTER TABLE public.invitation_codes
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'public';

UPDATE public.invitation_codes
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trigger_invitation_codes_updated_at ON public.invitation_codes;
DROP TRIGGER IF EXISTS _touch_row ON public.invitation_codes;
DROP TRIGGER IF EXISTS _stamp_actor ON public.invitation_codes;

CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON public.invitation_codes
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.invitation_codes
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- ============================================================
-- invitation_requests
-- ============================================================
ALTER TABLE public.invitation_requests
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

UPDATE public.invitation_requests
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trigger_invitation_requests_updated_at ON public.invitation_requests;
DROP TRIGGER IF EXISTS _touch_row ON public.invitation_requests;
DROP TRIGGER IF EXISTS _stamp_actor ON public.invitation_requests;

CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON public.invitation_requests
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.invitation_requests
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- ============================================================
-- profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';

UPDATE public.profiles
SET created_by = id
WHERE created_by IS NULL;

UPDATE public.profiles p
SET organization_id = o.id
FROM public.organizations o
WHERE o.created_by = p.id
  AND o.is_personal = true
  AND p.organization_id IS NULL;

UPDATE public.profiles
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS _touch_row ON public.profiles;
DROP TRIGGER IF EXISTS _stamp_actor ON public.profiles;

CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- ============================================================
-- Move all three tables to user schema
-- ============================================================
ALTER TABLE public.invitation_codes   SET SCHEMA "user";
ALTER TABLE public.invitation_requests SET SCHEMA "user";
ALTER TABLE public.profiles            SET SCHEMA "user";

-- ============================================================
-- Register in platform.entity_types
-- ============================================================
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'invitation_code', 'user', 'invitation_codes', 'Invitation Code', 'public', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'invitation_code');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'invitation_request', 'user', 'invitation_requests', 'Invitation Request', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'invitation_request');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'profile', 'user', 'profiles', 'User Profile', 'internal', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'profile');

-- ============================================================
-- Apply canonical RLS
-- ============================================================
SELECT iam.apply_rls('user', 'invitation_codes',    'invitation_code',    'entity');
SELECT iam.apply_rls('user', 'invitation_requests', 'invitation_request', 'entity');
SELECT iam.apply_rls('user', 'profiles',            'profile',            'entity');

-- Re-add anonymous INSERT for public invitation form submissions
CREATE POLICY anon_insert ON "user".invitation_requests
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- Register old names in deprecated_relations
-- ============================================================
INSERT INTO platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at)
VALUES
  ('public.invitation_codes',    'user.invitation_codes',    NULL, 'Moved public→user schema, canonicalized 2026-06-27', now()),
  ('public.invitation_requests', 'user.invitation_requests', NULL, 'Moved public→user schema, canonicalized 2026-06-27', now()),
  ('public.profiles',            'user.profiles',            NULL, 'Moved public→user schema, canonicalized 2026-06-27', now())
ON CONFLICT (old_ref) DO UPDATE
  SET new_ref = EXCLUDED.new_ref,
      reason  = EXCLUDED.reason,
      deprecated_at = EXCLUDED.deprecated_at;
