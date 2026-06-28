-- Migration: move_pdf_redaction_cluster_to_pdf_schema
-- Applied: 2026-06-28
-- Moves the 4-table PDF / redaction cluster from public → pdf schema (clean cut).
-- Tables: pdf_consolidation_log, pdf_redaction_audits, pdf_redaction_key_escrow, redaction_mapping.
-- All RLS policies, triggers, indexes, sequences, and cross-schema FKs follow automatically
-- (outbound FKs → files.files / files.pages / auth.users / iam.organizations keep working).
-- No inbound FKs, no view refs, no function refs. All 4 tables were empty (0 rows) at move time.

-- PHASE 1: target schema + grants (mirror docproc precedent)
CREATE SCHEMA IF NOT EXISTS pdf;
GRANT USAGE ON SCHEMA pdf TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pdf
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pdf
  GRANT SELECT ON TABLES TO anon;

-- PHASE 2: move tables
ALTER TABLE IF EXISTS public.pdf_consolidation_log     SET SCHEMA pdf;
ALTER TABLE IF EXISTS public.pdf_redaction_audits      SET SCHEMA pdf;
ALTER TABLE IF EXISTS public.pdf_redaction_key_escrow  SET SCHEMA pdf;
ALTER TABLE IF EXISTS public.redaction_mapping         SET SCHEMA pdf;

-- PHASE 3: repoint entity_types registry rows for any moved table
UPDATE platform.entity_types SET schema_name = 'pdf'
WHERE table_name IN ('pdf_consolidation_log','pdf_redaction_audits','pdf_redaction_key_escrow','redaction_mapping');
