-- ============================================================
-- War Room — schema (Wave 1)
-- ============================================================
-- Session-based multitasking command center. Three tables:
--   1. ctx_war_room_sessions            (parent — one per saved "room")
--   2. ctx_war_room_tiles               (the core — one row per tile)
--   3. ctx_war_room_tile_audio_sessions (link — tile → studio_sessions, M2M)
--
-- A tile bundles a Task (ctx_tasks), a Note (notes), and N audio transcript
-- sessions (studio_sessions, source='war_room') surfaced as four tabs. War
-- Room stores ONLY the linkage + tile UI state; task/note/transcript data live
-- in their own features' tables.
--
-- Context model: a session carries a controlled scope selection
-- (organization_id + context_scope_ids jsonb) that is the DEFAULT inherited by
-- every tile. A tile may override (context_organization_id +
-- context_scope_ids; NULL scope = inherit, [] = explicitly cleared). This is a
-- selection the record CARRIES — never a write to appContextSlice (global
-- active context) or ctx_scope_assignments (durable entity tags). See
-- features/war-room/FEATURE.md and features/scopes/FEATURE.md.
--
-- RLS follows the canonical check_resource_access(...) pattern from
-- transcript_studio_schema.sql. Child tables inherit access via EXISTS on the
-- parent ctx_war_room_sessions row. Owner access works without sharing-registry
-- registration (the function takes owner/org/project as explicit args);
-- cross-user sharing is a future addition (register in
-- shareable_resource_registry then).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. ctx_war_room_sessions (parent)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ctx_war_room_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership + multi-scope (matches studio_sessions / code_files)
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id      uuid,
  is_public       boolean NOT NULL DEFAULT false,

  -- Session identity
  title           text NOT NULL DEFAULT 'New War Room',
  description     text,
  icon            text,   -- optional lucide name for the /all card
  color           text,

  -- SESSION-LEVEL CONTEXT DEFAULT — inherited by every tile. organization_id
  -- above is the session org; context_scope_ids is a jsonb array of
  -- ctx_scopes.id (mirror of appContextSlice.scope_selections flattened to
  -- ids). A controlled selection the record carries, NOT a global write.
  context_scope_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Session-level pointers that should survive return visits
  active_tile_id  uuid,
  last_opened_at  timestamptz,

  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctx_war_room_sessions_user_updated
  ON public.ctx_war_room_sessions(user_id, updated_at DESC)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_ctx_war_room_sessions_org
  ON public.ctx_war_room_sessions(organization_id)
  WHERE organization_id IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_ctx_war_room_sessions_public
  ON public.ctx_war_room_sessions(id)
  WHERE is_public = true AND is_deleted = false;

DROP TRIGGER IF EXISTS ctx_war_room_sessions_updated_at ON public.ctx_war_room_sessions;
CREATE TRIGGER ctx_war_room_sessions_updated_at
  BEFORE UPDATE ON public.ctx_war_room_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ctx_war_room_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctx_war_room_sessions_public_read"  ON public.ctx_war_room_sessions;
DROP POLICY IF EXISTS "ctx_war_room_sessions_select"       ON public.ctx_war_room_sessions;
DROP POLICY IF EXISTS "ctx_war_room_sessions_insert"       ON public.ctx_war_room_sessions;
DROP POLICY IF EXISTS "ctx_war_room_sessions_update"       ON public.ctx_war_room_sessions;
DROP POLICY IF EXISTS "ctx_war_room_sessions_delete"       ON public.ctx_war_room_sessions;
DROP POLICY IF EXISTS "ctx_war_room_sessions_service_role" ON public.ctx_war_room_sessions;

CREATE POLICY "ctx_war_room_sessions_public_read" ON public.ctx_war_room_sessions
  FOR SELECT TO anon, authenticated
  USING (is_public = true AND is_deleted = false);

CREATE POLICY "ctx_war_room_sessions_select" ON public.ctx_war_room_sessions
  FOR SELECT TO authenticated
  USING (check_resource_access(
    'ctx_war_room_sessions', id, 'viewer', user_id, NULL::uuid, project_id, organization_id
  ));

CREATE POLICY "ctx_war_room_sessions_insert" ON public.ctx_war_room_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ctx_war_room_sessions_update" ON public.ctx_war_room_sessions
  FOR UPDATE TO authenticated
  USING (check_resource_access(
    'ctx_war_room_sessions', id, 'editor', user_id, NULL::uuid, project_id, organization_id
  ))
  WITH CHECK (check_resource_access(
    'ctx_war_room_sessions', id, 'editor', user_id, NULL::uuid, project_id, organization_id
  ));

CREATE POLICY "ctx_war_room_sessions_delete" ON public.ctx_war_room_sessions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR check_resource_access(
      'ctx_war_room_sessions', id, 'admin', user_id, NULL::uuid, project_id, organization_id
    )
  );

CREATE POLICY "ctx_war_room_sessions_service_role" ON public.ctx_war_room_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.ctx_war_room_sessions IS
  'War Room: parent session ("room"). Holds the saved tile gallery + the session-level controlled context default. See features/war-room/FEATURE.md.';
COMMENT ON COLUMN public.ctx_war_room_sessions.context_scope_ids IS
  'jsonb array of ctx_scopes.id — the session-level scope default inherited by every tile. A controlled selection carried by the record, never written to appContextSlice or ctx_scope_assignments.';

-- ------------------------------------------------------------
-- 2. ctx_war_room_tiles (the core)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ctx_war_room_tiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.ctx_war_room_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- denormalized for RLS speed

  -- Linkage to the three substrates (all nullable; a tile may have any subset)
  task_id     uuid REFERENCES public.ctx_tasks(id) ON DELETE SET NULL,
  note_id     uuid REFERENCES public.notes(id)     ON DELETE SET NULL,
  -- audio: many studio_sessions via ctx_war_room_tile_audio_sessions

  -- Per-tile context OVERRIDE (NULL = inherit the session default)
  context_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  context_scope_ids       jsonb,  -- NULL = inherit; [] = explicitly none; [..] = override

  -- Tile UI state (persisted so a saved session restores exactly)
  active_tab  text NOT NULL DEFAULT 'task'
              CHECK (active_tab IN ('task','notes','audio','combined')),
  is_pinned   boolean NOT NULL DEFAULT false,
  is_hidden   boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  title       text,   -- optional tile label override (else derived from task/note)

  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tiles_session
  ON public.ctx_war_room_tiles(session_id, position)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tiles_task
  ON public.ctx_war_room_tiles(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tiles_note
  ON public.ctx_war_room_tiles(note_id) WHERE note_id IS NOT NULL;

DROP TRIGGER IF EXISTS ctx_war_room_tiles_updated_at ON public.ctx_war_room_tiles;
CREATE TRIGGER ctx_war_room_tiles_updated_at
  BEFORE UPDATE ON public.ctx_war_room_tiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ctx_war_room_tiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctx_war_room_tiles_public_read"  ON public.ctx_war_room_tiles;
DROP POLICY IF EXISTS "ctx_war_room_tiles_select"       ON public.ctx_war_room_tiles;
DROP POLICY IF EXISTS "ctx_war_room_tiles_insert"       ON public.ctx_war_room_tiles;
DROP POLICY IF EXISTS "ctx_war_room_tiles_update"       ON public.ctx_war_room_tiles;
DROP POLICY IF EXISTS "ctx_war_room_tiles_delete"       ON public.ctx_war_room_tiles;
DROP POLICY IF EXISTS "ctx_war_room_tiles_service_role" ON public.ctx_war_room_tiles;

CREATE POLICY "ctx_war_room_tiles_public_read" ON public.ctx_war_room_tiles
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_sessions s
    WHERE s.id = ctx_war_room_tiles.session_id
      AND s.is_public = true AND s.is_deleted = false
  ));

CREATE POLICY "ctx_war_room_tiles_select" ON public.ctx_war_room_tiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_sessions s
    WHERE s.id = ctx_war_room_tiles.session_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'viewer', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tiles_insert" ON public.ctx_war_room_tiles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_sessions s
    WHERE s.id = ctx_war_room_tiles.session_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tiles_update" ON public.ctx_war_room_tiles
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_sessions s
    WHERE s.id = ctx_war_room_tiles.session_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_sessions s
    WHERE s.id = ctx_war_room_tiles.session_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tiles_delete" ON public.ctx_war_room_tiles
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_sessions s
    WHERE s.id = ctx_war_room_tiles.session_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tiles_service_role" ON public.ctx_war_room_tiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.ctx_war_room_tiles IS
  'War Room: one row per tile. Links a task/note/audio set and holds persisted tile UI state (active_tab, pin, hide, position) + an optional per-tile context override.';
COMMENT ON COLUMN public.ctx_war_room_tiles.context_scope_ids IS
  'Per-tile scope override: NULL = inherit session default; [] = explicitly cleared; [..] = override (jsonb array of ctx_scopes.id).';

-- ------------------------------------------------------------
-- 3. ctx_war_room_tile_audio_sessions (link: tile → studio_sessions)
-- ------------------------------------------------------------
-- A tile's Audio tab owns N transcript sessions ("New Session" mints another).
-- studio_sessions rows are created with source='war_room' so they never leak
-- into the Studio's default list (handled in studioService.applySourceFilter).
CREATE TABLE IF NOT EXISTS public.ctx_war_room_tile_audio_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id           uuid NOT NULL REFERENCES public.ctx_war_room_tiles(id) ON DELETE CASCADE,
  studio_session_id uuid NOT NULL REFERENCES public.studio_sessions(id)   ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position          integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,  -- which transcript session the tab currently shows
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tile_id, studio_session_id)
);

CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tile_audio_tile
  ON public.ctx_war_room_tile_audio_sessions(tile_id, position);

ALTER TABLE public.ctx_war_room_tile_audio_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctx_war_room_tile_audio_public_read"  ON public.ctx_war_room_tile_audio_sessions;
DROP POLICY IF EXISTS "ctx_war_room_tile_audio_select"       ON public.ctx_war_room_tile_audio_sessions;
DROP POLICY IF EXISTS "ctx_war_room_tile_audio_insert"       ON public.ctx_war_room_tile_audio_sessions;
DROP POLICY IF EXISTS "ctx_war_room_tile_audio_update"       ON public.ctx_war_room_tile_audio_sessions;
DROP POLICY IF EXISTS "ctx_war_room_tile_audio_delete"       ON public.ctx_war_room_tile_audio_sessions;
DROP POLICY IF EXISTS "ctx_war_room_tile_audio_service_role" ON public.ctx_war_room_tile_audio_sessions;

CREATE POLICY "ctx_war_room_tile_audio_public_read" ON public.ctx_war_room_tile_audio_sessions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_audio_sessions.tile_id
      AND s.is_public = true AND s.is_deleted = false
  ));

CREATE POLICY "ctx_war_room_tile_audio_select" ON public.ctx_war_room_tile_audio_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_audio_sessions.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'viewer', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_audio_insert" ON public.ctx_war_room_tile_audio_sessions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_audio_sessions.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_audio_update" ON public.ctx_war_room_tile_audio_sessions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_audio_sessions.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_audio_sessions.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_audio_delete" ON public.ctx_war_room_tile_audio_sessions
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ctx_war_room_tiles t
    JOIN public.ctx_war_room_sessions s ON s.id = t.session_id
    WHERE t.id = ctx_war_room_tile_audio_sessions.tile_id
      AND check_resource_access(
        'ctx_war_room_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "ctx_war_room_tile_audio_service_role" ON public.ctx_war_room_tile_audio_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.ctx_war_room_tile_audio_sessions IS
  'War Room: link table from a tile to its audio transcript sessions (studio_sessions, source=war_room). is_active marks the session the Audio tab currently shows.';

COMMIT;
