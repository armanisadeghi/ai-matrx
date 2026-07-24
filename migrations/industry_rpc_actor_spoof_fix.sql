-- industry_rpc_actor_spoof_fix.sql
--
-- LIVE PRIVILEGE ESCALATION (found 2026-07-23 by adversarial review).
--
-- public.industry_upsert / industry_curator_grant / industry_curator_revoke are
-- SECURITY DEFINER and resolved their actor as:
--
--     v_actor := COALESCE(p_actor, auth.uid());   -- caller-supplied param WINS
--
-- then gated with _library_assert_super_admin(v_actor), which only checks the
-- uuid it is handed. All five public.industry_* RPCs were additionally
-- EXECUTE-granted to `anon`.
--
-- Impact: ANY caller (including anonymous) who knows or guesses a super-admin
-- uuid could pass it as p_actor and execute super-admin-only writes.
-- industry_curator_grant writes iam.industry_curators, which
-- public.can_curate_library_document reads — i.e. anon could grant itself
-- CURATE (write) on Shared Knowledge library documents, and the audit-log row
-- would name the impersonated admin, not the attacker.
--
-- This is the same class already fixed for the rag.library_* family (D31):
-- the session identity must always win over a caller-supplied actor.
--
-- Fix:
--   1. COALESCE(auth.uid(), p_actor) — JWT wins; p_actor is only a fallback for
--      genuine service-role callers where auth.uid() is NULL.
--   2. REVOKE EXECUTE ... FROM anon, PUBLIC on all five. These are super-admin /
--      org-admin operations; an anonymous caller has no business invoking them.
--
-- Bodies are otherwise byte-identical to the live definitions.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.industry_upsert(
  p_slug text,
  p_name text,
  p_facet text DEFAULT 'domain'::text,
  p_parent_id uuid DEFAULT NULL::uuid,
  p_default_template_id uuid DEFAULT NULL::uuid,
  p_description text DEFAULT NULL::text,
  p_sort_order integer DEFAULT 0,
  p_actor uuid DEFAULT NULL::uuid
)
RETURNS iam.industries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industries;
BEGIN
    -- session identity always wins; p_actor is a service-role fallback only
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_super_admin(v_actor);
    INSERT INTO iam.industries(slug, name, facet, parent_id, default_template_id, description, sort_order)
    VALUES (p_slug, p_name, p_facet, p_parent_id, p_default_template_id, p_description, p_sort_order)
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, facet = EXCLUDED.facet, parent_id = EXCLUDED.parent_id,
        default_template_id = EXCLUDED.default_template_id, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order
    RETURNING * INTO v_row;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, 'industry_upsert', v_row.id, jsonb_build_object('slug', p_slug, 'facet', p_facet));
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.industry_curator_grant(
  p_user uuid,
  p_industry uuid,
  p_actor uuid DEFAULT NULL::uuid
)
RETURNS iam.industry_curators
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industry_curators;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_super_admin(v_actor);
    INSERT INTO iam.industry_curators(user_id, industry_id, granted_by)
    VALUES (p_user, p_industry, v_actor)
    ON CONFLICT (user_id, industry_id) DO UPDATE SET granted_by = EXCLUDED.granted_by
    RETURNING * INTO v_row;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, 'industry_curator_grant', p_industry, jsonb_build_object('user', p_user));
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.industry_curator_revoke(
  p_user uuid,
  p_industry uuid,
  p_actor uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_super_admin(v_actor);
    DELETE FROM iam.industry_curators WHERE user_id = p_user AND industry_id = p_industry;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, 'industry_curator_revoke', p_industry, jsonb_build_object('user', p_user));
END; $function$;

-- Close the anon surface on the whole family.
REVOKE EXECUTE ON FUNCTION public.industry_upsert(text, text, text, uuid, uuid, text, integer, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.industry_curator_grant(uuid, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.industry_curator_revoke(uuid, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.industry_assign_org(uuid, uuid, boolean, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.industry_unassign_org(uuid, uuid, uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.industry_upsert(text, text, text, uuid, uuid, text, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industry_curator_grant(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industry_curator_revoke(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industry_assign_org(uuid, uuid, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industry_unassign_org(uuid, uuid, uuid) TO authenticated, service_role;
