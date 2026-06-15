-- ============================================================
-- War Room — files & documents per tile
-- ============================================================
-- One polymorphic link table (mirrors the proven ctx_task_associations shape)
-- so a tile can hold uploaded FILES (cld_files) AND editable DOCUMENTS
-- (udt_documents) — and any future entity type — through one path, instead of a
-- parallel table per kind. Plus the active_tab CHECK is widened to allow a new
-- 'files' tab.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ctx_war_room_tile_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id     uuid NOT NULL REFERENCES public.ctx_war_room_tiles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('user_file', 'document')),
  entity_id   uuid NOT NULL,   -- cld_files.id (user_file) | udt_documents.id (document)
  label       text,
  metadata    jsonb,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tile_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tile_attachments_tile
  ON public.ctx_war_room_tile_attachments(tile_id, position);

ALTER TABLE public.ctx_war_room_tile_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctx_war_room_tile_attachments_public_read"  ON public.ctx_war_room_tile_attachments;
DROP POLICY IF EXISTS "ctx_war_room_tile_attachments_select"       ON public.ctx_war_room_tile_attachments;
DROP POLICY IF EXISTS "ctx_war_room_tile_attachments_insert"       ON public.ctx_war_room_tile_attachments;
DROP POLICY IF EXISTS "ctx_war_room_tile_attachments_update"       ON public.ctx_war_room_tile_attachments;
DROP POLICY IF EXISTS "ctx_war_room_tile_attachments_delete"       ON public.ctx_war_room_tile_attachments;
DROP POLICY IF EXISTS "ctx_war_room_tile_attachments_service_role" ON public.ctx_war_room_tile_attachments;

CREATE POLICY "ctx_war_room_tile_attachments_public_read" ON public.ctx_war_room_tile_attachments
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_attachments.tile_id
      AND s.is_public = true AND s.is_deleted = false
  ));

CREATE POLICY "ctx_war_room_tile_attachments_select" ON public.ctx_war_room_tile_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_attachments.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'viewer', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_attachments_insert" ON public.ctx_war_room_tile_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_attachments.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_attachments_update" ON public.ctx_war_room_tile_attachments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_attachments.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_attachments.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_attachments_delete" ON public.ctx_war_room_tile_attachments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_attachments.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_attachments_service_role" ON public.ctx_war_room_tile_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ctx_war_room_tile_attachments IS
  'War Room: polymorphic link from a tile to files (cld_files) and documents (udt_documents). Mirrors ctx_task_associations; one path for all attachable entity types.';

-- Widen the tile active_tab CHECK to allow the new 'files' tab.
ALTER TABLE public.ctx_war_room_tiles DROP CONSTRAINT IF EXISTS ctx_war_room_tiles_active_tab_check;
ALTER TABLE public.ctx_war_room_tiles
  ADD CONSTRAINT ctx_war_room_tiles_active_tab_check
  CHECK (active_tab IN ('task','notes','audio','combined','files'));

COMMIT;
