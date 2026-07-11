-- page_image_assoc_retarget_to_source_file.sql
--
-- Fixes the dead "Container not shareable" Relationship Manager drift:
--   file → processed_document (page_image) made processed_document the container,
--   but processed_document is NOT in shareable_resource_registry, so conveyance
--   from that container can never start. Direction was also wrong for the
--   file↔processed_document pair (doctrine: little→big → processed_document→file).
--
-- Canonical page-image edge (this migration):
--   page_image file → source PDF file  (role=page_image, Conveys viewer)
--   little→big, container is shareable (`file`), aligns with parent_file_id lineage.
--
-- processed_document → file (role=source_file) is unchanged — that is the only
-- allowed association between those two entity types.
--
-- Idempotent. Supersedes §6 of library_reachability_cascade_hardening.sql.

-- ---------------------------------------------------------------------------
-- 1. Drop the wrong-way edges + rule
-- ---------------------------------------------------------------------------
DELETE FROM platform.associations
WHERE source_type = 'file'
  AND target_type = 'processed_document'
  AND role IS NOT DISTINCT FROM 'page_image';

DELETE FROM platform.association_types
WHERE source_type = 'file'
  AND target_type = 'processed_document';

-- ---------------------------------------------------------------------------
-- 2. Register file → file (page-image derivative → source PDF)
-- ---------------------------------------------------------------------------
INSERT INTO platform.association_types (
  source_type, target_type, label, container_side, conveys_max, is_active, notes
)
VALUES (
  'file', 'file', NULL, 'target', 'viewer', true,
  'Page render images belong to their source PDF file. Viewer on the PDF (via store→file) conveys viewer on page-image derivative files. Replaces the dead file→processed_document page_image rule. 2026-07-11'
)
ON CONFLICT (source_type, target_type) DO UPDATE
SET container_side = EXCLUDED.container_side,
    conveys_max    = EXCLUDED.conveys_max,
    is_active      = EXCLUDED.is_active,
    notes          = EXCLUDED.notes,
    updated_at     = now();

-- ---------------------------------------------------------------------------
-- 3. Sync trigger: page image → source PDF (not → processed_document)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION docproc.sync_page_image_file_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, docproc, files, iam
AS $$
DECLARE
  v_org uuid;
  v_image uuid;
  v_pdf uuid;
  v_old_pdf uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.image_cld_file_id IS NOT NULL THEN
      -- Resolve whatever target we may have written (PDF via parent or doc source).
      SELECT COALESCE(
        CASE WHEN pd.source_kind = 'cld_file' THEN pd.source_id::uuid END,
        f.parent_file_id
      )
        INTO v_old_pdf
      FROM docproc.processed_documents pd
      LEFT JOIN files.files f ON f.id = OLD.image_cld_file_id
      WHERE pd.id = OLD.processed_document_id;

      DELETE FROM platform.associations a
      WHERE a.source_type = 'file'
        AND a.source_id = OLD.image_cld_file_id
        AND a.target_type = 'file'
        AND (v_old_pdf IS NULL OR a.target_id = v_old_pdf)
        AND a.role IS NOT DISTINCT FROM 'page_image';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.image_cld_file_id IS NOT NULL
       AND (
         OLD.image_cld_file_id IS DISTINCT FROM NEW.image_cld_file_id
         OR OLD.processed_document_id IS DISTINCT FROM NEW.processed_document_id
       ) THEN
    SELECT COALESCE(
      CASE WHEN pd.source_kind = 'cld_file' THEN pd.source_id::uuid END,
      f.parent_file_id
    )
      INTO v_old_pdf
    FROM docproc.processed_documents pd
    LEFT JOIN files.files f ON f.id = OLD.image_cld_file_id
    WHERE pd.id = OLD.processed_document_id;

    DELETE FROM platform.associations a
    WHERE a.source_type = 'file'
      AND a.source_id = OLD.image_cld_file_id
      AND a.target_type = 'file'
      AND (v_old_pdf IS NULL OR a.target_id = v_old_pdf)
      AND a.role IS NOT DISTINCT FROM 'page_image';
  END IF;

  IF NEW.image_cld_file_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_image := NEW.image_cld_file_id;

  SELECT
    COALESCE(
      CASE WHEN pd.source_kind = 'cld_file' THEN pd.source_id::uuid END,
      f.parent_file_id
    ),
    COALESCE(
      pd.organization_id,
      f.organization_id,
      (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)
    )
  INTO v_pdf, v_org
  FROM docproc.processed_documents pd
  LEFT JOIN files.files f ON f.id = v_image
  WHERE pd.id = NEW.processed_document_id;

  IF v_pdf IS NULL OR v_pdf = v_image THEN
    RETURN NEW;
  END IF;

  INSERT INTO platform.associations (
    source_type, source_id, target_type, target_id,
    organization_id, role, metadata
  )
  VALUES (
    'file', v_image, 'file', v_pdf,
    v_org, 'page_image',
    jsonb_build_object(
      'legacy_table', 'docproc.processed_document_pages',
      'page_id', NEW.id,
      'processed_document_id', NEW.processed_document_id
    )
  )
  ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_processed_document_pages_image_assoc ON docproc.processed_document_pages;
CREATE TRIGGER trg_processed_document_pages_image_assoc
  AFTER INSERT OR UPDATE OF image_cld_file_id, processed_document_id
  OR DELETE ON docproc.processed_document_pages
  FOR EACH ROW EXECUTE FUNCTION docproc.sync_page_image_file_association();

-- ---------------------------------------------------------------------------
-- 4. Backfill page-image → source-PDF edges
-- ---------------------------------------------------------------------------
INSERT INTO platform.associations (
  source_type, source_id, target_type, target_id,
  organization_id, role, metadata
)
SELECT
  'file',
  p.image_cld_file_id,
  'file',
  COALESCE(
    CASE WHEN pd.source_kind = 'cld_file' THEN pd.source_id::uuid END,
    img.parent_file_id
  ),
  COALESCE(
    pd.organization_id,
    img.organization_id,
    (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)
  ),
  'page_image',
  jsonb_build_object(
    'legacy_table', 'docproc.processed_document_pages',
    'page_id', p.id,
    'processed_document_id', p.processed_document_id
  )
FROM docproc.processed_document_pages p
JOIN docproc.processed_documents pd ON pd.id = p.processed_document_id
LEFT JOIN files.files img ON img.id = p.image_cld_file_id
WHERE p.image_cld_file_id IS NOT NULL
  AND pd.deleted_at IS NULL
  AND COALESCE(
    CASE WHEN pd.source_kind = 'cld_file' THEN pd.source_id::uuid END,
    img.parent_file_id
  ) IS NOT NULL
  AND COALESCE(
    CASE WHEN pd.source_kind = 'cld_file' THEN pd.source_id::uuid END,
    img.parent_file_id
  ) <> p.image_cld_file_id
ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Rebuild reachability closure
-- ---------------------------------------------------------------------------
SELECT platform.rebuild_reachability();
