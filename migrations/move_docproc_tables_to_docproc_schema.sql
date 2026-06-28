-- Migration: move_docproc_tables_to_docproc_schema
-- Applied: 2026-06-28
-- Moves 7 document-processing tables from public → docproc schema.
-- All RLS policies, triggers, indexes, sequences, and inbound FKs follow automatically.
-- Companion functions repointed to use docproc-qualified table references.

-- PHASE 1: Schema grants
GRANT USAGE ON SCHEMA docproc TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA docproc
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA docproc
  GRANT SELECT ON TABLES TO anon;

-- PHASE 2: Move tables
ALTER TABLE IF EXISTS public.processed_documents         SET SCHEMA docproc;
ALTER TABLE IF EXISTS public.processed_document_pages    SET SCHEMA docproc;
ALTER TABLE IF EXISTS public.derive_runs                 SET SCHEMA docproc;
ALTER TABLE IF EXISTS public.page_extraction_jobs        SET SCHEMA docproc;
ALTER TABLE IF EXISTS public.page_extraction_runs        SET SCHEMA docproc;
ALTER TABLE IF EXISTS public.page_extraction_page_runs   SET SCHEMA docproc;
ALTER TABLE IF EXISTS public.page_extraction_results     SET SCHEMA docproc;

-- PHASE 3: Recreate pdf_unified_pages view pointing to docproc
CREATE OR REPLACE VIEW public.pdf_unified_pages AS
SELECT pp.id AS page_id, pp.processed_document_id, c.id AS file_id,
  pp.page_number, pp.page_index, pp.raw_text, pp.cleaned_text,
  pp.section_kind, pp.section_title, pp.is_continuation, pp.width, pp.height,
  pp.rotation AS extract_rotation, pp.used_ocr, pp.image_cld_file_id,
  fp.id AS file_page_id, fp.status AS user_status, fp.rotation AS user_rotation,
  fp.excluded_at, fp.user_modified, fp.thumbnail_url
FROM docproc.processed_document_pages pp
LEFT JOIN files.files c ON c.canonical_processed_document_id = pp.processed_document_id
LEFT JOIN files.pages fp ON fp.processed_document_page_id = pp.id;

-- PHASE 4: Repoint functions (see apply_migration for full bodies)

-- PHASE 5: entity_types registry
UPDATE platform.entity_types SET schema_name = 'docproc'
WHERE table_name IN ('page_extraction_jobs','derive_runs','page_extraction_page_runs');
