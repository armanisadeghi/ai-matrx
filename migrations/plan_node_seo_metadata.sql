-- Planned SEO metadata belongs to the planned page (`plan.node`), beside its
-- canonical primary keyword. The realized CMS page may later carry different
-- live/draft metadata; these fields remain the content-plan intent.
-- Idempotent. Applied via Supabase MCP; ledgered in public._schema_migrations.

ALTER TABLE plan.node
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text;

COMMENT ON COLUMN plan.node.meta_title IS
  'Planned SEO title for the page. Content realization consumes this intent without overwriting user-authored CMS metadata.';

COMMENT ON COLUMN plan.node.meta_description IS
  'Planned SEO description for the page. Content realization consumes this intent without overwriting user-authored CMS metadata.';
