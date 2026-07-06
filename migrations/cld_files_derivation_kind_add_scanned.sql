-- Add 'scanned' to the known derivation kinds on files.files.
--
-- The phone scanner (POST /utilities/pdf/from-images) persists its
-- assembled PDF as a user file with derivation_kind='scanned' + full
-- source lineage in derivation_metadata. The existing
-- cld_files_derivation_kind_known check predates the scanner and
-- rejected the insert (23514).
--
-- Idempotent: drop + recreate with the full (extended) allowlist.

ALTER TABLE files.files
  DROP CONSTRAINT IF EXISTS cld_files_derivation_kind_known;

ALTER TABLE files.files
  ADD CONSTRAINT cld_files_derivation_kind_known
  CHECK (
    derivation_kind IS NULL
    OR derivation_kind = ANY (ARRAY[
      'manual_upload'::text,
      'extracted_pages'::text,
      'cropped'::text,
      'rotated'::text,
      'pages_deleted'::text,
      'merged'::text,
      'split_part'::text,
      'compressed'::text,
      'rendered_page_image'::text,
      'cleaned'::text,
      'variant'::text,
      'scanned'::text
    ])
  );
