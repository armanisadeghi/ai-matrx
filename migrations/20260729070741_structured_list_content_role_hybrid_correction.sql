-- structured_list_content_role_hybrid_correction.sql
-- Structured Lists are both reusable inputs and persisted outputs.
--
-- This corrects the earlier structured_list_association_title_column.sql
-- classification without editing that already-applied, ledgered migration.
-- Idempotent: fresh databases replay the earlier migration first and finish
-- with this canonical classification.

UPDATE platform.entity_types
SET content_role = 'hybrid'
WHERE token = 'structured_list'
  AND content_role IS DISTINCT FROM 'hybrid';
