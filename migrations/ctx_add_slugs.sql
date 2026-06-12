-- ctx_add_slugs.sql
-- Human-readable kebab slugs for scope types, scopes, and context items so routes
-- resolve by name OR id. Applied to Matrx Main (txzxabzwovsujtloxrus) 2026-06-06 via
-- migrations: ctx_add_slugs_columns_backfill_indexes + ctx_slugs_rpc_plumbing.
-- Slugs are nullable; the FE resolver falls back to id when null. Uniqueness:
--   scope_types  → unique per organization
--   scopes       → unique per scope_type
--   context_items→ unique per scope_type (active rows only)

-- 1) Columns
ALTER TABLE public.ctx_scope_types   ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.ctx_scopes        ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.ctx_context_items ADD COLUMN IF NOT EXISTS slug text;

-- 2) Backfill (lower() BEFORE the kebab regex so leading capitals are kept), deduped.
WITH base AS (
  SELECT id, organization_id,
         COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(label_plural), '[^a-z0-9]+', '-', 'g')), ''), 'scope-type') AS s
  FROM public.ctx_scope_types
), ranked AS (
  SELECT id, s, row_number() OVER (PARTITION BY organization_id, s ORDER BY id) AS rn FROM base
)
UPDATE public.ctx_scope_types t
SET slug = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r WHERE t.id = r.id AND t.slug IS NULL;

WITH base AS (
  SELECT id, scope_type_id,
         COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'scope') AS s
  FROM public.ctx_scopes
), ranked AS (
  SELECT id, s, row_number() OVER (PARTITION BY scope_type_id, s ORDER BY id) AS rn FROM base
)
UPDATE public.ctx_scopes t
SET slug = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r WHERE t.id = r.id AND t.slug IS NULL;

WITH base AS (
  SELECT id, scope_type_id,
         COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(replace(key, '_', '-')), '[^a-z0-9]+', '-', 'g')), ''), 'item') AS s
  FROM public.ctx_context_items WHERE is_active = true
), ranked AS (
  SELECT id, s, row_number() OVER (PARTITION BY scope_type_id, s ORDER BY id) AS rn FROM base
)
UPDATE public.ctx_context_items t
SET slug = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r WHERE t.id = r.id AND t.slug IS NULL;

-- 3) Uniqueness (partial)
CREATE UNIQUE INDEX IF NOT EXISTS ctx_scope_types_org_slug_uniq
  ON public.ctx_scope_types (organization_id, slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ctx_scopes_type_slug_uniq
  ON public.ctx_scopes (scope_type_id, slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ctx_context_items_type_slug_uniq
  ON public.ctx_context_items (scope_type_id, slug) WHERE slug IS NOT NULL AND is_active = true;

-- 4) RPCs: see migration ctx_slugs_rpc_plumbing for the full bodies.
--    create_scope_type / update_scope_type gain p_color + p_slug;
--    create_scope / update_scope / create_context_item gain p_slug;
--    list_scope_type_items + get_scope_context now emit `slug`.
--    (list_scope_types / list_scopes already emit slug via to_jsonb(row).)
-- The full CREATE OR REPLACE statements were applied via the MCP migration of the
-- same name and are reproduced in the database; kept out of this file for brevity.