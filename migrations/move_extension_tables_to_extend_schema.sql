-- move_extension_tables_to_extend_schema
-- 2026-06-27 · DB transition. Move the 8 Chrome-extension tables out of public
-- into the dedicated `extend` schema (clean cut, no shim). All tables EMPTY.
-- SET SCHEMA carries columns/PK/indexes/constraints/FKs/RLS/triggers/sequences.
-- Run AFTER canonicalize_wbx_entities_pre_move.sql.
--
-- ⛔ External step (NOT in SQL / not MCP-reachable): the `extend` schema must be
-- added to the project's PostgREST Exposed Schemas (Supabase dashboard →
-- Settings → API → append `extend`, do not replace the list) AND to the
-- `pnpm db-types` --schema flags, or every supabase-js read of these tables 404s.

GRANT USAGE ON SCHEMA extend TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extend GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER TABLE public.wbx_capture          SET SCHEMA extend;
ALTER TABLE public.wbx_seo_audit        SET SCHEMA extend;
ALTER TABLE public.wbx_screenshot       SET SCHEMA extend;
ALTER TABLE public.wbx_pattern          SET SCHEMA extend;
ALTER TABLE public.wbx_highlight        SET SCHEMA extend;
ALTER TABLE public.wbx_guidance         SET SCHEMA extend;
ALTER TABLE public.wbx_recipe           SET SCHEMA extend;
ALTER TABLE public.extension_auth_codes SET SCHEMA extend;

UPDATE platform.entity_types SET schema_name='extend'
WHERE token IN ('wbx_capture','wbx_seo_audit','wbx_screenshot','wbx_pattern','wbx_highlight','wbx_guidance');

INSERT INTO platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at) VALUES
  ('public.wbx_capture',         'extend.wbx_capture',         NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_capture'').', now()),
  ('public.wbx_seo_audit',       'extend.wbx_seo_audit',       NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_seo_audit'').', now()),
  ('public.wbx_screenshot',      'extend.wbx_screenshot',      NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_screenshot'').', now()),
  ('public.wbx_pattern',         'extend.wbx_pattern',         NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_pattern'').', now()),
  ('public.wbx_highlight',       'extend.wbx_highlight',       NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_highlight'').', now()),
  ('public.wbx_guidance',        'extend.wbx_guidance',        NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_guidance'').', now()),
  ('public.wbx_recipe',          'extend.wbx_recipe',          NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''wbx_recipe'').', now()),
  ('public.extension_auth_codes','extend.extension_auth_codes',NULL, 'moved to extend schema (chrome extension domain, clean cut). Use .schema(''extend'').from(''extension_auth_codes'').', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref=excluded.new_ref, reason=excluded.reason, deprecated_at=excluded.deprecated_at;
