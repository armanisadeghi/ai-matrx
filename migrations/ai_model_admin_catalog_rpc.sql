-- ai_model_admin_catalog_rpc.sql
--
-- `ai.model_admin` (raw pricing + REAL serving-vendor names — secret) has
-- postgres-only grants by design: vendor identity must never be readable by
-- `authenticated`. The FE admin model picker was reading the view directly via
-- supabase-js, which 42501s for EVERYONE (including super admins).
--
-- Fix per the protected-resources pattern: a SECURITY DEFINER RPC in the
-- exposed `public` schema, gated by public.is_super_admin(). The view keeps
-- zero grants; this function is the ONE read path for admin catalog data.
--
-- Idempotent: CREATE OR REPLACE + re-runnable grants.

CREATE OR REPLACE FUNCTION public.admin_model_catalog()
RETURNS SETOF ai.model_admin
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, ai
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin_model_catalog: super admin required'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM ai.model_admin
    ORDER BY common_name NULLS LAST, name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_model_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_model_catalog() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_model_catalog() TO authenticated;
