-- migrations/aga_apps_public_rpc_shell_kind.sql
--
-- Phase 1b: extend get_aga_public_data to return the shell + slots
-- columns added by aga_apps_shell_kind. Without these the public
-- renderer can't dispatch on shell_kind and would always fall through
-- to the legacy custom path.
--
-- Postgres can't ALTER a function's return type, so we DROP and
-- recreate. Applied to Matrx Main as `aga_apps_public_rpc_shell_kind_v2`.

DROP FUNCTION IF EXISTS public.get_aga_public_data(text, uuid);

CREATE FUNCTION public.get_aga_public_data(
  p_slug text DEFAULT NULL::text,
  p_app_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  slug text,
  name text,
  tagline text,
  description text,
  category text,
  tags text[],
  preview_image_url text,
  favicon_url text,
  component_code text,
  component_language text,
  allowed_imports jsonb,
  variable_schema jsonb,
  layout_config jsonb,
  styling_config jsonb,
  shell_kind text,
  shell_config jsonb,
  slot_overrides jsonb,
  slot_code jsonb,
  total_executions integer,
  success_rate numeric,
  agent_id uuid,
  agent_version_id uuid,
  use_latest boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    a.id, a.slug, a.name, a.tagline, a.description,
    a.category, a.tags, a.preview_image_url, a.favicon_url,
    a.component_code, a.component_language, a.allowed_imports,
    a.variable_schema, a.layout_config, a.styling_config,
    a.shell_kind, a.shell_config, a.slot_overrides, a.slot_code,
    a.total_executions, a.success_rate,
    a.agent_id, a.agent_version_id, a.use_latest
  FROM public.aga_apps a
  WHERE a.status = 'published'
    AND a.is_public = true
    AND (
      (p_app_id IS NOT NULL AND a.id = p_app_id)
      OR (p_slug IS NOT NULL AND a.slug = p_slug)
    )
  LIMIT 1;
$function$;
