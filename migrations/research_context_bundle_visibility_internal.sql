-- Fix: research.rs_context_bundle defaulted to visibility='personal'.
-- That is the lowest tier and locks out legitimate org collaborators —
-- THE SECURITY PHILOSOPHY: personal = chats/DMs; org work defaults internal.
-- System templates already insert as 'public'; this only changes the column
-- default + registry default for new user/topic bundles.
--
-- Idempotent. The CREATE migration (research_context_bundle.sql) is also
-- corrected for fresh installs; this file repairs already-applied DBs.

ALTER TABLE research.rs_context_bundle
  ALTER COLUMN visibility SET DEFAULT 'internal';

UPDATE platform.entity_types
SET default_visibility = 'internal'
WHERE token = 'research_context_bundle'
  AND default_visibility IS DISTINCT FROM 'internal';

-- Existing non-system rows that still carry the mistaken default → internal.
-- System templates stay public (seeded that way; do not touch).
UPDATE research.rs_context_bundle
SET visibility = 'internal'
WHERE is_system IS NOT TRUE
  AND visibility = 'personal'
  AND deleted_at IS NULL;
