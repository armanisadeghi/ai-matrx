-- ============================================================
-- ssr_shell_models_provider_id_fix.sql  (2026-07-11)
-- ============================================================
-- D39 follow-up. The LIVE bodies of get_ssr_shell_data /
-- get_ssr_agent_shell_data carried an ad-hoc edit (never committed to any
-- repo migration) that joined the maker name via the OLD column:
--
--   LEFT JOIN ai.provider p ON p.id = md.model_provider
--
-- ai_024 renamed ai.model_definition.model_provider -> provider_id, so both
-- RPCs died at runtime with 42703 "column md.model_provider does not exist"
-- — DeferredShellData swallowed the error and hydrated an EMPTY shell
-- (no ai_models, no preferences, no org context) for every user.
--
-- Fix: repoint the join to provider_id. The maker join is KEPT (the FE
-- modelRegistrySlice hydrateModels path expects the SSR shell to attach the
-- resolved `maker` = ai.provider.name); the plain `SELECT *` in the two
-- get_ssr_*_rpc.sql files was stale and has been updated to match.
--
-- Grants are NOT touched (definer_rpc_ssr_shell_anon_revoke.sql applies:
-- shell = authenticated only; agent shell = fully revoked, dead consumer).
-- Idempotent (CREATE OR REPLACE only).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ssr_shell_data(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH member_orgs AS (
    SELECT o.id, o.name, o.slug, o.is_personal, m.role, o.created_at
    FROM iam.memberships m
    JOIN iam.organizations o ON o.id = m.container_id
    WHERE m.user_id = p_user_id AND m.container_type = 'organization'
      AND m.status = 'active' AND m.deleted_at IS NULL
  ),
  default_pref AS (
    SELECT NULLIF(preferences #>> '{organization,defaultOrganizationId}', '')::uuid AS default_org_id
    FROM users.user_preferences WHERE user_id = p_user_id LIMIT 1
  )
  SELECT json_build_object(
    'is_admin', (SELECT EXISTS(SELECT 1 FROM admin.admins WHERE user_id = p_user_id)),
    'preferences_exists', (SELECT EXISTS(SELECT 1 FROM users.user_preferences WHERE user_id = p_user_id)),
    'preferences', (SELECT preferences FROM users.user_preferences WHERE user_id = p_user_id LIMIT 1),
    'ai_models', (
      SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (
        SELECT md.*, p.name AS maker
        FROM ai.model_definition md
        LEFT JOIN ai.provider p ON p.id = md.provider_id
        WHERE md.is_deprecated = false
        ORDER BY md.common_name ASC
      ) m
    ),
    'context_menu', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (SELECT placement_type, categories_flat FROM public.context_menu_unified_view) c
    ),
    'sms_unread_total', (
      SELECT COALESCE(SUM(unread_count), 0)::int
      FROM communication.sms_conversations WHERE user_id = p_user_id AND status = 'active'
    ),
    'personal_organization_id', iam.personal_org_id(p_user_id),
    'organizations', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', mo.id, 'name', mo.name, 'slug', mo.slug, 'is_personal', mo.is_personal, 'role', mo.role
      ) ORDER BY mo.is_personal DESC, mo.name ASC), '[]'::json)
      FROM member_orgs mo
    ),
    'active_organization_id', COALESCE(
      (SELECT mo.id FROM member_orgs mo WHERE mo.id = (SELECT default_org_id FROM default_pref) LIMIT 1),
      (SELECT mo.id FROM member_orgs mo WHERE (SELECT count(*) FROM member_orgs) = 1 LIMIT 1)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_ssr_agent_shell_data(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'is_admin', (SELECT EXISTS(SELECT 1 FROM admin.admins WHERE user_id = p_user_id)),
    'preferences_exists', (SELECT EXISTS(SELECT 1 FROM users.user_preferences WHERE user_id = p_user_id)),
    'preferences', (SELECT preferences FROM users.user_preferences WHERE user_id = p_user_id LIMIT 1),
    'ai_models', (
      SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (
        SELECT md.*, p.name AS maker
        FROM ai.model_definition md
        LEFT JOIN ai.provider p ON p.id = md.provider_id
        WHERE md.is_deprecated = false
        ORDER BY md.common_name ASC
      ) m
    ),
    'agent_context_menu', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (SELECT placement_type, categories_flat FROM agent.context_menu_view) c
    ),
    'sms_unread_total', (
      SELECT COALESCE(SUM(unread_count), 0)::int
      FROM communication.sms_conversations WHERE user_id = p_user_id AND status = 'active'
    )
  );
$$;
