-- ============================================================================
-- cx_conversation_documents — junction between a conversation and the
-- documents (working / scratch) it uses, plus the kinded generalisation of
-- `cx_working_documents`.
--
-- WHY a junction instead of `cx_working_documents.conversation_id` 1:1:
--   Two product requirements collapse into one structure here —
--     1. Opt-in must PERSIST. A conversation needs a durable "this doc is on"
--        flag that survives reloads (Redux is cleared on reload).
--     2. A conversation may LINK to a document that originated in another
--        conversation (share the same working doc / scratchpad across chats).
--   Both need a durable per-conversation row that points at a document. So
--   `cx_working_documents` stays the DOCUMENT entity (its `conversation_id` is
--   now just provenance/origin), and `cx_conversation_documents` holds the
--   per-(conversation, kind) pointer + the persisted `enabled` flag. Many
--   conversations can point at one document_id.
--
-- KINDS:
--   - 'working' — the collaborative doc the agent reads AND writes (ctx_patch).
--   - 'scratch' — the user's private scratchpad: the agent may READ it
--                 (ctx_get) but NEVER writes it (the FE publishes it as a
--                 read-only context value — `mutable:false`, no writeback
--                 source). Same storage shape; the read-only contract is
--                 enforced at the context-value layer, not the DB.
-- ============================================================================

-- ── 1. Generalise cx_working_documents: add `kind`, relax the 1:1 identity ──

ALTER TABLE public.cx_working_documents
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'working';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cx_working_documents_kind_check'
      AND conrelid = 'public.cx_working_documents'::regclass
  ) THEN
    ALTER TABLE public.cx_working_documents
      ADD CONSTRAINT cx_working_documents_kind_check
      CHECK (kind IN ('working', 'scratch'));
  END IF;
END $$;

-- `conversation_id` is now ORIGIN/provenance, not identity — a linked
-- conversation references the doc through the junction, never by owning it.
-- Drop the 1:1 UNIQUE (sharing breaks it) and relax NOT NULL.
ALTER TABLE public.cx_working_documents
  DROP CONSTRAINT IF EXISTS cx_working_documents_conversation_id_key;

ALTER TABLE public.cx_working_documents
  ALTER COLUMN conversation_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cx_working_documents_kind
  ON public.cx_working_documents(kind);

-- ── 2. The junction table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cx_conversation_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  kind            text NOT NULL DEFAULT 'working',
  document_id     uuid NOT NULL REFERENCES public.cx_working_documents(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL DEFAULT auth.uid(),
  -- Persisted opt-in: the doc is OFF by default (opt-in). A row exists once the
  -- user has interacted with this (conversation, kind); `enabled` is the
  -- durable on/off that survives reloads.
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cx_conversation_documents_kind_check CHECK (kind IN ('working', 'scratch')),
  UNIQUE (conversation_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_cx_conversation_documents_conversation
  ON public.cx_conversation_documents(conversation_id);

CREATE INDEX IF NOT EXISTS idx_cx_conversation_documents_document
  ON public.cx_conversation_documents(document_id);

CREATE INDEX IF NOT EXISTS idx_cx_conversation_documents_user
  ON public.cx_conversation_documents(user_id);

DROP TRIGGER IF EXISTS cx_conversation_documents_updated_at ON public.cx_conversation_documents;
CREATE TRIGGER cx_conversation_documents_updated_at
  BEFORE UPDATE ON public.cx_conversation_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cx_conversation_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cx_conversation_documents_select"       ON public.cx_conversation_documents;
DROP POLICY IF EXISTS "cx_conversation_documents_insert"       ON public.cx_conversation_documents;
DROP POLICY IF EXISTS "cx_conversation_documents_update"       ON public.cx_conversation_documents;
DROP POLICY IF EXISTS "cx_conversation_documents_delete"       ON public.cx_conversation_documents;
DROP POLICY IF EXISTS "cx_conversation_documents_service_role" ON public.cx_conversation_documents;

CREATE POLICY "cx_conversation_documents_select" ON public.cx_conversation_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cx_conversation_documents_insert" ON public.cx_conversation_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cx_conversation_documents_update" ON public.cx_conversation_documents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cx_conversation_documents_delete" ON public.cx_conversation_documents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cx_conversation_documents_service_role" ON public.cx_conversation_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime: the junction's `enabled` and link can change in another tab; keep
-- it live (RLS-authorized Postgres Changes). Idempotent add.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cx_conversation_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cx_conversation_documents;
  END IF;
END $$;

-- ── 3. Backfill — one junction row per existing working document ─────────────
-- Existing docs were created under the old default-ON regime. Preserve them:
-- a doc that was actually USED (has content) stays enabled; an empty
-- auto-provisioned doc becomes opt-in OFF so it no longer shows by default.
INSERT INTO public.cx_conversation_documents (conversation_id, kind, document_id, user_id, enabled)
SELECT
  d.conversation_id,
  'working',
  d.id,
  d.user_id,
  (length(coalesce(d.content, '')) > 0)
FROM public.cx_working_documents d
WHERE d.conversation_id IS NOT NULL
  AND d.kind = 'working'
  AND NOT EXISTS (
    SELECT 1 FROM public.cx_conversation_documents j
    WHERE j.conversation_id = d.conversation_id
      AND j.kind = 'working'
  );
