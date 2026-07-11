-- ai_model_offerings_admin_rpc.sql
--
-- The admin model picker's total-transparency panel needs EVERY offering of a
-- model (real vendor / api / provider_model_id / $ pricing / priority /
-- availability + points), not just the preferred one `ai.model_admin` carries
-- (its offering join is LIMIT 1). The FE briefly read ai.offering/endpoint/api
-- directly (their RLS then granted authenticated SELECT), but vendor identity
-- must be super-admin-only, so that RLS is being locked down — this RPC is the
-- ONE read path, mirroring public.admin_model_catalog().
--
-- Pattern (protected-resources): a postgres-only admin view + a SECURITY
-- DEFINER RPC in the exposed `public` schema gated by public.is_super_admin().
-- Non-admin calls raise 42501; the view itself has ZERO client grants.
--
-- Idempotent: CREATE OR REPLACE + re-runnable grants.

CREATE OR REPLACE VIEW ai.model_offering_admin AS
SELECT
  o.model_id,
  o.id AS offering_id,
  o.provider_model_id,
  o.pricing,
  o.usage_basis,
  o.token_billed,
  o.priority,
  o.is_available,
  o.endpoint_id,
  e.internal_name AS endpoint_internal_name,
  e.display_name  AS endpoint_display_name,
  e.vendor,
  o.api_id,
  a.name AS api_name,
  a.translator_key,
  a.transport,
  mo.points_per_million_input,
  mo.points_per_million_output,
  mo.points_per_million_cached_input
FROM ai.offering o
LEFT JOIN ai.endpoint e ON e.id = o.endpoint_id
LEFT JOIN ai.api a ON a.id = o.api_id
LEFT JOIN ai.model_offering mo ON mo.offering_id = o.id
WHERE o.deleted_at IS NULL;

-- Vendor identity is secret: zero client grants on the view, ever.
REVOKE ALL ON ai.model_offering_admin FROM PUBLIC;
REVOKE ALL ON ai.model_offering_admin FROM anon;
REVOKE ALL ON ai.model_offering_admin FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_model_offerings()
RETURNS SETOF ai.model_offering_admin
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, ai
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin_model_offerings: super admin required'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM ai.model_offering_admin
    ORDER BY model_id, priority, offering_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_model_offerings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_model_offerings() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_model_offerings() TO authenticated;
