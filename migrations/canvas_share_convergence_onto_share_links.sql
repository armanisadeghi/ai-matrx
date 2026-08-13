-- Canvas share-token convergence onto the ONE canonical share-link lane.
-- Context: common-docs/systems/access-architecture/FEATURE.md §3.4 (canonical lane)
-- and §7-G3 (the files fork, killed 2026-07-15). Canvas ran the SAME disease:
-- canvas.shared_canvas_items.share_token (+ a broken second mint on
-- canvas.canvas_items.share_token) resolved by raw client selects at
-- /canvas/shared/[token], with no revoke/expiry/listing and a select('*')
-- projection leaking internal columns to anon.
-- Findings + plan: common-docs/projects/sharing-experience/canvas-share-convergence.md
--
-- This migration:
--   1. registers `shared_canvas_item` as a link-shareable resource with a real
--      public_columns projection (the published-snapshot entity IS the thing a
--      canvas share shares);
--   2. migrates every existing canvas share token into platform.share_links
--      PRESERVING the token values (old URLs keep resolving; token is plain
--      unique text — no format constraint);
--   3. CUTS the old writer paths: drops both share_token columns and the broken
--      cx_canvas_publish (minted tokens but not NOT NULL organization_id; zero
--      callers in either repo).

-- 1) Shareable-resource registration (mirrored in utils/permissions/registry.ts)
INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column,
   is_public_column, display_label, url_path_template, rls_uses_has_permission,
   is_active, content_role, is_scopeable, is_link_shareable, public_columns, notes)
VALUES
  ('shared_canvas_item', 'canvas', 'shared_canvas_items', 'id', 'created_by',
   NULL, 'Shared Canvas', '/canvas/shared/{id}', true,
   true, 'source', true, true,
   ARRAY['title','description','canvas_type','canvas_data','thumbnail_url',
         'creator_username','creator_display_name','has_scoring','high_score',
         'average_score','total_attempts','like_count','comment_count',
         'view_count','share_count','fork_count','play_count','completion_rate',
         'tags','categories','visibility','allow_remixes','require_attribution',
         'featured','created_at','updated_at','published_at','organization_id'],
   'Published canvas snapshot (social entity). Converged from the bespoke share_token lane 2026-08-12.')
ON CONFLICT (resource_type) DO UPDATE SET
  schema_name = EXCLUDED.schema_name,
  table_name = EXCLUDED.table_name,
  owner_column = EXCLUDED.owner_column,
  url_path_template = EXCLUDED.url_path_template,
  is_link_shareable = EXCLUDED.is_link_shareable,
  public_columns = EXCLUDED.public_columns,
  is_active = true,
  updated_at = now();

-- 2) Token migration — preserve every existing canvas share token verbatim.
--    Runs BEFORE the column drop; idempotent via the token unique constraint.
INSERT INTO platform.share_links
  (resource_type, resource_id, token, permission_level, created_by,
   organization_id, label, is_active)
SELECT 'shared_canvas_item', s.id, s.share_token, 'viewer'::permission_level,
       s.created_by, s.organization_id, 'Migrated canvas share', true
FROM canvas.shared_canvas_items s
WHERE s.share_token IS NOT NULL
ON CONFLICT (token) DO NOTHING;

-- 3) Writer-path cut. Nothing may ever mint via the old columns again.
DROP FUNCTION IF EXISTS public.cx_canvas_publish(uuid, text);
ALTER TABLE canvas.shared_canvas_items DROP COLUMN IF EXISTS share_token;
ALTER TABLE canvas.canvas_items DROP COLUMN IF EXISTS share_token;
