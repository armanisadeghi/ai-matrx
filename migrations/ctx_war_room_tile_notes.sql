-- ============================================================
-- War Room — multiple notes per tile
-- ============================================================
-- A tile can hold MANY notes (OneNote is often not enough), exactly like it
-- already holds many audio transcript sessions. This mirrors
-- ctx_war_room_tile_audio_sessions 1:1 — a link table from a tile to notes
-- rows, with a per-tile "active" note. The existing ctx_war_room_tiles.note_id
-- column stays as the active-note pointer (the is_active analog), so note↔task
-- sync + the tile-metrics that read note_id keep working.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ctx_war_room_tile_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id     uuid NOT NULL REFERENCES public.ctx_war_room_tiles(id) ON DELETE CASCADE,
  note_id     uuid NOT NULL REFERENCES public.notes(id)              ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tile_id, note_id)
);

CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tile_notes_tile
  ON public.ctx_war_room_tile_notes(tile_id, position);

ALTER TABLE public.ctx_war_room_tile_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctx_war_room_tile_notes_public_read"  ON public.ctx_war_room_tile_notes;
DROP POLICY IF EXISTS "ctx_war_room_tile_notes_select"       ON public.ctx_war_room_tile_notes;
DROP POLICY IF EXISTS "ctx_war_room_tile_notes_insert"       ON public.ctx_war_room_tile_notes;
DROP POLICY IF EXISTS "ctx_war_room_tile_notes_update"       ON public.ctx_war_room_tile_notes;
DROP POLICY IF EXISTS "ctx_war_room_tile_notes_delete"       ON public.ctx_war_room_tile_notes;
DROP POLICY IF EXISTS "ctx_war_room_tile_notes_service_role" ON public.ctx_war_room_tile_notes;

CREATE POLICY "ctx_war_room_tile_notes_public_read" ON public.ctx_war_room_tile_notes
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_notes.tile_id
      AND s.is_public = true AND s.is_deleted = false
  ));

CREATE POLICY "ctx_war_room_tile_notes_select" ON public.ctx_war_room_tile_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_notes.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'viewer', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_notes_insert" ON public.ctx_war_room_tile_notes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_notes.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_notes_update" ON public.ctx_war_room_tile_notes
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_notes.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_notes.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_notes_delete" ON public.ctx_war_room_tile_notes
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_notes.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_notes_service_role" ON public.ctx_war_room_tile_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Backfill: every tile that already has a single note becomes one link row.
INSERT INTO public.ctx_war_room_tile_notes (tile_id, note_id, user_id, position, is_active)
SELECT id, note_id, user_id, 0, true
FROM public.ctx_war_room_tiles
WHERE note_id IS NOT NULL AND is_deleted = false
ON CONFLICT (tile_id, note_id) DO NOTHING;

COMMENT ON TABLE public.ctx_war_room_tile_notes IS
  'War Room: link table from a tile to its notes (a tile can hold many). is_active + ctx_war_room_tiles.note_id mark the note the Notes tab currently shows. Mirrors ctx_war_room_tile_audio_sessions.';

COMMIT;
