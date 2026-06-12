-- ============================================================================
-- udt_v2_documents — cloud document editor (Univer Docs preset) storage
-- ============================================================================
--
-- WHY
-- ---
-- The /workbooks surface gave us cloud-native spreadsheets backed by Univer's
-- preset-sheets-core. This migration adds the parallel /documents surface,
-- backed by Univer's preset-docs-core. Same architecture: metadata + append-
-- only snapshots, RLS mirroring `udt_workbooks`, CRDT collab via Yjs over
-- Supabase Broadcast (one Univer command service drives both presets, so the
-- collab session reuses the workbook plumbing with a different channel
-- prefix).
--
-- WHY MIRROR udt_workbooks INSTEAD OF UNIFYING
-- --------------------------------------------
-- Docs and workbooks share a backbone (Univer + Yjs + snapshot store), but
-- their content shapes diverge (IDocumentData vs IWorkbookData), and the
-- listing / picker UX for "my documents" vs "my workbooks" is materially
-- different. Forcing them into one table costs us nothing today and gains us
-- nothing tomorrow — we'd need a discriminator column, doubled indices, and
-- a polymorphic editor-route. Two narrow tables, one shared editor primitive.
--
-- SAFETY
-- ------
-- Pure-additive. Two new tables, one new enum, one shareable_resource_registry
-- insert. No existing object touched.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. udt_documents — metadata
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_source') THEN
    CREATE TYPE document_source AS ENUM (
      'created',
      'imported_docx',
      'imported_md',
      'imported_txt'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS udt_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name     VARCHAR(255) NOT NULL,
  description       TEXT,
  source            document_source NOT NULL DEFAULT 'created',
  -- Pointer to the original uploaded file (DOCX / MD / TXT blob) in cld_files.
  -- ON DELETE SET NULL — the document survives if the source file is removed.
  original_file_id  UUID REFERENCES cld_files(id) ON DELETE SET NULL,
  user_id           UUID NOT NULL DEFAULT auth.uid(),
  organization_id   UUID,
  project_id        UUID,
  task_id           UUID,
  is_public         BOOLEAN NOT NULL DEFAULT false,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_udt_documents_user_id ON udt_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_udt_documents_org_id
  ON udt_documents(organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE udt_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS udt_documents_select ON udt_documents;
CREATE POLICY udt_documents_select ON udt_documents FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_public = true
    OR has_permission('udt_documents', id, 'viewer'::permission_level)
  );

DROP POLICY IF EXISTS udt_documents_insert ON udt_documents;
CREATE POLICY udt_documents_insert ON udt_documents FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS udt_documents_update ON udt_documents;
CREATE POLICY udt_documents_update ON udt_documents FOR UPDATE
  USING (
    user_id = auth.uid()
    OR has_permission('udt_documents', id, 'editor'::permission_level)
  );

DROP POLICY IF EXISTS udt_documents_delete ON udt_documents;
CREATE POLICY udt_documents_delete ON udt_documents FOR DELETE
  USING (user_id = auth.uid());

INSERT INTO public.shareable_resource_registry (
  resource_type, table_name, id_column, owner_column, is_public_column,
  display_label, url_path_template, rls_uses_has_permission, notes
) VALUES (
  'udt_documents', 'udt_documents', 'id', 'user_id', 'is_public',
  'Document', '/documents/{id}', true,
  'Cloud document editor backed by Univer preset-docs-core. Mirrors udt_workbooks.'
)
ON CONFLICT (resource_type) DO UPDATE SET
  table_name = EXCLUDED.table_name,
  id_column = EXCLUDED.id_column,
  owner_column = EXCLUDED.owner_column,
  is_public_column = EXCLUDED.is_public_column,
  display_label = EXCLUDED.display_label,
  url_path_template = EXCLUDED.url_path_template,
  rls_uses_has_permission = EXCLUDED.rls_uses_has_permission,
  notes = EXCLUDED.notes,
  is_active = true;

-- ---------------------------------------------------------------------------
-- 2. udt_document_snapshots — append-only content store
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS udt_document_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES udt_documents(id) ON DELETE CASCADE,
  -- Univer IDocumentData JSON. Opaque to the DB; queryable but never
  -- schema-checked. Mirrors `udt_workbook_snapshots.snapshot`.
  snapshot      JSONB NOT NULL,
  -- Human-readable label (autosave vs. named save vs. import).
  label         TEXT,
  -- Free-text origin tracker — 'autosave' | 'manual' | 'imported' | 'restored'.
  origin        TEXT NOT NULL DEFAULT 'autosave',
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_udt_document_snapshots_document
  ON udt_document_snapshots(document_id, created_at DESC);

ALTER TABLE udt_document_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS udt_document_snapshots_select ON udt_document_snapshots;
CREATE POLICY udt_document_snapshots_select ON udt_document_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM udt_documents d
      WHERE d.id = udt_document_snapshots.document_id
        AND (
          d.user_id = auth.uid()
          OR d.is_public = true
          OR has_permission('udt_documents', d.id, 'viewer'::permission_level)
        )
    )
  );

DROP POLICY IF EXISTS udt_document_snapshots_insert ON udt_document_snapshots;
CREATE POLICY udt_document_snapshots_insert ON udt_document_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM udt_documents d
      WHERE d.id = udt_document_snapshots.document_id
        AND (
          d.user_id = auth.uid()
          OR has_permission('udt_documents', d.id, 'editor'::permission_level)
        )
    )
  );

-- Append-only by design — UPDATE / DELETE policies intentionally omitted.
-- Cascade delete on document_id is the only path that removes snapshots.

-- ---------------------------------------------------------------------------
-- 3. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_documents;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_document_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_document_snapshots;
  END IF;
END$$;

COMMIT;
