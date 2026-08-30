-- Phase 6.9 — the guest door carries the app's JOB. APPLIED LIVE via Supabase
-- MCP; this file is the record, not the mechanism.
--
-- `anon` cannot read mandate.definition (verified: permission denied), and it
-- never will — so the anonymous /p/[slug] visitor cannot client-resolve the
-- app's mandate. The public app RPC is already the ONE definer door that
-- surface reads, so it answers the mandate question too rather than growing a
-- second door. A guest has no bindings by construction, so the honest answer
-- for a guest IS the mandate's system default holder.
--
-- Additive: every pre-existing output column keeps its name, type and value,
-- so with APP_MANDATE_CUTOVER OFF the caller reads byte-identical data and
-- simply ignores the four new columns. The DROP is only because a RETURNS
-- TABLE signature cannot be widened by CREATE OR REPLACE.
--
-- The GRANT tightens: the function carried implicit PUBLIC EXECUTE (the known
-- DEFINER defect class); anon + authenticated + service_role is every real
-- caller.

DROP FUNCTION IF EXISTS public.get_aga_public_data(text, uuid);

CREATE FUNCTION public.get_aga_public_data(
  p_slug text DEFAULT NULL::text,
  p_app_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid, slug text, name text, tagline text, description text,
  category text, tags text[], preview_image_url text, favicon_url text,
  component_code text, component_language text, allowed_imports jsonb,
  variable_schema jsonb, layout_config jsonb, styling_config jsonb,
  shell_kind text, shell_config jsonb, slot_overrides jsonb, slot_code jsonb,
  total_executions integer, success_rate numeric,
  agent_id uuid, agent_version_id uuid, use_latest boolean,
  mandate_id uuid, mandate_key text,
  mandate_agent_id uuid, mandate_agent_version_id uuid
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
    a.agent_id, a.agent_version_id, a.use_latest,
    a.mandate_id,
    m.mandate_key,
    -- The system-default Holder: the only layer that can apply to a guest.
    -- A disabled mandate, or one whose Holder is not an executable agent,
    -- answers NULL so the client REFUSES loudly rather than running a guess.
    CASE WHEN m.is_enabled AND m.default_holder_type = 'agent'
         THEN m.default_holder_id END,
    CASE WHEN m.is_enabled AND m.default_holder_type = 'agent'
         THEN m.default_holder_version_id END
  FROM app.definition a
  LEFT JOIN mandate.definition m
    ON m.id = a.mandate_id AND m.deleted_at IS NULL
  WHERE a.status = 'published'
    AND a.visibility = 'public'::platform.visibility
    AND a.deleted_at IS NULL
    AND (
      (p_app_id IS NOT NULL AND a.id = p_app_id)
      OR (p_slug IS NOT NULL AND a.slug = p_slug)
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_aga_public_data(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_aga_public_data(text, uuid) TO anon, authenticated, service_role;
