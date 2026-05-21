-- ============================================================================
-- studio_documents — the collaborative "working document" the audio-first
-- assistant builds with the user.
--
-- Edited server-side by the assistant via ctx_patch (aidream writeback handler
-- kind="studio_document"); inline-editable on the client. Structurally separate
-- from studio_cleaned_segments so the auto-cleanup version is never overwritten.
--
-- One row per (session_id, kind). Default kind = 'working_document'.
-- RLS mirrors the studio child-table pattern: access inherited from the parent
-- studio_sessions row via check_resource_access(...).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studio_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.studio_sessions(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'working_document',
  title       text NOT NULL DEFAULT 'Working Document',
  content     text NOT NULL DEFAULT '',
  version     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_studio_documents_session
  ON public.studio_documents(session_id);

DROP TRIGGER IF EXISTS studio_documents_updated_at ON public.studio_documents;
CREATE TRIGGER studio_documents_updated_at
  BEFORE UPDATE ON public.studio_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.studio_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "studio_documents_public_read"  ON public.studio_documents;
DROP POLICY IF EXISTS "studio_documents_select"       ON public.studio_documents;
DROP POLICY IF EXISTS "studio_documents_insert"       ON public.studio_documents;
DROP POLICY IF EXISTS "studio_documents_update"       ON public.studio_documents;
DROP POLICY IF EXISTS "studio_documents_delete"       ON public.studio_documents;
DROP POLICY IF EXISTS "studio_documents_service_role" ON public.studio_documents;

CREATE POLICY "studio_documents_public_read" ON public.studio_documents
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studio_sessions s
    WHERE s.id = studio_documents.session_id
      AND s.is_public = true AND s.is_deleted = false
  ));

CREATE POLICY "studio_documents_select" ON public.studio_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studio_sessions s
    WHERE s.id = studio_documents.session_id
      AND check_resource_access(
        'studio_sessions', s.id, 'viewer', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "studio_documents_insert" ON public.studio_documents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.studio_sessions s
    WHERE s.id = studio_documents.session_id
      AND check_resource_access(
        'studio_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "studio_documents_update" ON public.studio_documents
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studio_sessions s
    WHERE s.id = studio_documents.session_id
      AND check_resource_access(
        'studio_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.studio_sessions s
    WHERE s.id = studio_documents.session_id
      AND check_resource_access(
        'studio_sessions', s.id, 'editor', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "studio_documents_delete" ON public.studio_documents
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studio_sessions s
    WHERE s.id = studio_documents.session_id
      AND check_resource_access(
        'studio_sessions', s.id, 'admin', s.user_id, NULL::uuid, s.project_id, s.organization_id
      )
  ));

CREATE POLICY "studio_documents_service_role" ON public.studio_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime: the assistant's ctx_patch writes land server-side and must reach
-- the client. Postgres Changes is RLS-authorized, so add the table to the
-- publication (idempotent guard — ADD TABLE errors if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'studio_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.studio_documents;
  END IF;
END $$;

-- studio_recording_segments already exists in transcript_studio_schema.sql but
-- was never added to the realtime publication. The mobile card list relies on
-- realtime upserts, so add it here too (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'studio_recording_segments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.studio_recording_segments;
  END IF;
END $$;
