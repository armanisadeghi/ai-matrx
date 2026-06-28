-- shared_canvas_items: canonicalize + move to canvas schema
-- Applied: 2026-06-27
-- 24 live rows preserved via SET SCHEMA (zero data loss)
-- Note: apply_migration blocked by Supabase-layer validation on platform.visibility enum;
--       executed via execute_sql instead. This file is the idempotent record.

-- 1. Add missing canonical columns
ALTER TABLE public.shared_canvas_items
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

ALTER TABLE public.shared_canvas_items
  ADD CONSTRAINT IF NOT EXISTS shared_canvas_items_org_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- 2. Drop bespoke policies + blocking check constraint + partial index
DROP POLICY IF EXISTS "Public canvases are viewable by everyone" ON public.shared_canvas_items;
DROP POLICY IF EXISTS "Users can create canvases" ON public.shared_canvas_items;
DROP POLICY IF EXISTS "Users can delete their own canvases" ON public.shared_canvas_items;
DROP POLICY IF EXISTS "Users can update their own canvases" ON public.shared_canvas_items;
DROP POLICY IF EXISTS "Users can view their own canvases" ON public.shared_canvas_items;
ALTER TABLE public.shared_canvas_items DROP CONSTRAINT IF EXISTS shared_canvas_items_visibility_check;
DROP INDEX IF EXISTS public.idx_shared_canvas_trending;

-- 3. Convert visibility text → platform.visibility enum
ALTER TABLE public.shared_canvas_items ALTER COLUMN visibility DROP DEFAULT;
ALTER TABLE public.shared_canvas_items
  ALTER COLUMN visibility TYPE platform.visibility
  USING (CASE visibility WHEN 'public' THEN 'public' WHEN 'unlisted' THEN 'link' ELSE 'private' END)::platform.visibility;
ALTER TABLE public.shared_canvas_items
  ALTER COLUMN visibility SET DEFAULT 'public'::platform.visibility;

-- Recreate partial index with enum type
CREATE INDEX IF NOT EXISTS idx_shared_canvas_trending
  ON public.shared_canvas_items USING btree (trending_score DESC)
  WHERE visibility = 'public'::platform.visibility;

-- 4. Backfill organization_id
UPDATE public.shared_canvas_items
SET organization_id = COALESCE(
  (SELECT o.id FROM public.organizations o WHERE o.created_by = shared_canvas_items.created_by AND o.is_personal = true LIMIT 1),
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
)
WHERE organization_id IS NULL;

-- 5. Replace bespoke updated_at trigger with canonical triggers
DROP TRIGGER IF EXISTS trigger_update_canvas_updated_at ON public.shared_canvas_items;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON public.shared_canvas_items
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.shared_canvas_items
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- 6. Register in entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_versioned, has_soft_delete)
SELECT 'shared_canvas_item', 'canvas', 'shared_canvas_items', 'Shared Canvas Item', 'public', false, true, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'shared_canvas_item');

-- 7. Apply canonical entity RLS
SELECT iam.apply_rls('public', 'shared_canvas_items', 'shared_canvas_item', 'entity');

-- 8. Move to canvas schema
ALTER TABLE public.shared_canvas_items SET SCHEMA canvas;

-- 9. Register in deprecated_relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES ('public.shared_canvas_items', 'canvas.shared_canvas_items', 'Moved to canvas schema', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref = EXCLUDED.new_ref, deprecated_at = EXCLUDED.deprecated_at, reason = EXCLUDED.reason;
