-- ============================================================================
-- cx_working_documents — the collaborative "working document" the agent builds
-- with the user inside a chat conversation.
--
-- This is the chat-conversation analog of `studio_documents` (Scribe). It gives
-- the chat Working Document a DURABLE backing row so the agent's server-side
-- edits actually persist and round-trip back to the client:
--   1. The agent edits the doc via `ctx_patch` on the `working_document` context
--      key. Because the FE sends `persist: "auto"` + `source: { kind:
--      "cx_working_document", id, field: "content" }`, the aidream writeback
--      handler (kind="cx_working_document") writes the new content to this row.
--   2. The write reaches the client via Supabase realtime (Postgres Changes) and
--      a post-turn re-read fallback — exactly the studio_documents pattern.
--
-- One row per conversation (UNIQUE (conversation_id)). No FK to a conversations
-- table on purpose: the working document may be enabled before the conversation
-- is ever persisted (the conversation id is a stable client-generated UUID), and
-- the row must exist independently. Ownership / access is enforced entirely by
-- `user_id = auth.uid()` RLS, and the service-role writeback verifies ownership.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cx_working_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id         uuid NOT NULL DEFAULT auth.uid(),
  title           text NOT NULL DEFAULT 'Working document',
  content         text NOT NULL DEFAULT '',
  version         integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_cx_working_documents_conversation
  ON public.cx_working_documents(conversation_id);

CREATE INDEX IF NOT EXISTS idx_cx_working_documents_user
  ON public.cx_working_documents(user_id);

DROP TRIGGER IF EXISTS cx_working_documents_updated_at ON public.cx_working_documents;
CREATE TRIGGER cx_working_documents_updated_at
  BEFORE UPDATE ON public.cx_working_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cx_working_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cx_working_documents_select"       ON public.cx_working_documents;
DROP POLICY IF EXISTS "cx_working_documents_insert"       ON public.cx_working_documents;
DROP POLICY IF EXISTS "cx_working_documents_update"       ON public.cx_working_documents;
DROP POLICY IF EXISTS "cx_working_documents_delete"       ON public.cx_working_documents;
DROP POLICY IF EXISTS "cx_working_documents_service_role" ON public.cx_working_documents;

CREATE POLICY "cx_working_documents_select" ON public.cx_working_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cx_working_documents_insert" ON public.cx_working_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cx_working_documents_update" ON public.cx_working_documents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cx_working_documents_delete" ON public.cx_working_documents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- service_role (the aidream ctx_patch writeback handler) bypasses RLS but the
-- handler itself verifies `user_id` ownership before writing.
CREATE POLICY "cx_working_documents_service_role" ON public.cx_working_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime: the agent's ctx_patch writes land server-side and must reach the
-- client live. Postgres Changes is RLS-authorized, so add the table to the
-- publication (idempotent guard — ADD TABLE errors if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cx_working_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cx_working_documents;
  END IF;
END $$;
