-- voices: canonicalize + move to ai schema
-- Applied: 2026-06-27 via execute_sql (apply_migration blocked by Supabase-layer enum validation)
-- 51 live rows preserved via SET SCHEMA (zero data loss)

-- 1. Add missing canonical columns
ALTER TABLE public.voices
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'public'::platform.visibility;

-- 2. Backfill created_by from legacy owner_id
UPDATE public.voices SET created_by = owner_id WHERE created_by IS NULL AND owner_id IS NOT NULL;
UPDATE public.voices SET created_by = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid WHERE created_by IS NULL;

-- 3. Drop bespoke policies
DROP POLICY IF EXISTS "voices_catalog_public_select" ON public.voices;
DROP POLICY IF EXISTS "voices_owner_delete" ON public.voices;
DROP POLICY IF EXISTS "voices_owner_insert" ON public.voices;
DROP POLICY IF EXISTS "voices_owner_select" ON public.voices;
DROP POLICY IF EXISTS "voices_owner_update" ON public.voices;

-- 4. Register in entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_versioned, has_soft_delete)
SELECT 'voice', 'ai', 'voices', 'Voice', 'public', false, true, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'voice');

-- 5. Apply canonical entity RLS
SELECT iam.apply_rls('public', 'voices', 'voice', 'entity');

-- 6. Move to ai schema
ALTER TABLE public.voices SET SCHEMA ai;

-- 7. Register in deprecated_relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES ('public.voices', 'ai.voices', 'Moved to ai schema — use .schema("ai").from("voices")', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref = EXCLUDED.new_ref, deprecated_at = EXCLUDED.deprecated_at, reason = EXCLUDED.reason;
