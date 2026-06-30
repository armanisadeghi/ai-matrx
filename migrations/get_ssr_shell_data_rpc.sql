-- ============================================================
-- get_ssr_shell_data(p_user_id uuid)
-- ============================================================
-- Single RPC that replaces 4–5 separate DB fetches at SSR time.
-- Called client-side from DeferredShellData after auth resolves.
-- Returns everything needed to fully hydrate the lite Redux store
-- in one round-trip, in the SAME payload that hydrates the user.
--
-- Replaces:
--   • get_user_session_data()      → is_admin + preferences
--   • ai_model direct query        → fetchAvailableModels() thunk
--   • context_menu_unified_view    → useUnifiedContextMenu() hook
--   • sms_conversations query      → unread badge count
--   • getUserOrganizations() (3 round-trips) + activeOrgBootstrap RPC
--                                  → organizations[] + personal/active org
--
-- ── Organization context (org-enforcement rollout) ──────────────────────
-- As of the "org id required on every write" rollout, the active org is a
-- first-class part of the guaranteed boot payload — exactly as reliable as
-- the user. The single source of truth in Redux is appContext.organization_id
-- (the selected org) with personal_organization_id as the never-null fallback
-- (selectEffectiveOrganizationId / getActiveOrgId). This RPC server-resolves:
--   • personal_organization_id — the user's auto-provisioned personal org
--     (iam.personal_org_id) — the never-null fallback.
--   • active_organization_id   — the EXPLICIT active org, mirroring the old
--     client bootstrap precedence: (a) the user's default-org preference IF
--     they are still an active member; else (b) their only org if they belong
--     to exactly one; else NULL — left null ON PURPOSE so the UI nudges the
--     user to pick one (red avatar ring). personal still rides along via the
--     effective selector, so writes never carry a null org.
--   • organizations            — the full membership list (thin shape) to warm
--     the organizations slice for the picker without a secondary fetch.
--
-- NOTE: this file is kept in lockstep with the LIVE function (2026 schema
-- reorg moved tables into admin.* / users.* / communication.* / iam.*).
-- DB is the source of truth; re-apply is idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ssr_shell_data(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH member_orgs AS (
    -- The user's ACTIVE organization memberships, joined to the org rows.
    SELECT o.id, o.name, o.slug, o.is_personal, m.role, o.created_at
    FROM iam.memberships m
    JOIN iam.organizations o ON o.id = m.container_id
    WHERE m.user_id = p_user_id
      AND m.container_type = 'organization'
      AND m.status = 'active'
      AND m.deleted_at IS NULL
  ),
  default_pref AS (
    -- The durable default-org preference (organization.defaultOrganizationId).
    SELECT NULLIF(preferences #>> '{organization,defaultOrganizationId}', '')::uuid
             AS default_org_id
    FROM users.user_preferences
    WHERE user_id = p_user_id
    LIMIT 1
  )
  SELECT json_build_object(

    -- ── User session ──────────────────────────────────────────
    'is_admin', (
      SELECT EXISTS(SELECT 1 FROM admin.admins WHERE user_id = p_user_id)
    ),
    'preferences_exists', (
      SELECT EXISTS(SELECT 1 FROM users.user_preferences WHERE user_id = p_user_id)
    ),
    'preferences', (
      SELECT preferences FROM users.user_preferences
      WHERE user_id = p_user_id LIMIT 1
    ),

    -- ── AI models ─────────────────────────────────────────────
    'ai_models', (
      SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (
        SELECT * FROM ai.model
        WHERE is_deprecated = false
        ORDER BY common_name ASC
      ) m
    ),

    -- ── Context menu ──────────────────────────────────────────
    'context_menu', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT placement_type, categories_flat
        FROM public.context_menu_unified_view
      ) c
    ),

    -- ── SMS unread badge ──────────────────────────────────────
    'sms_unread_total', (
      SELECT COALESCE(SUM(unread_count), 0)::int
      FROM communication.sms_conversations
      WHERE user_id = p_user_id AND status = 'active'
    ),

    -- ── Organization context ──────────────────────────────────
    -- The never-null personal org fallback.
    'personal_organization_id', iam.personal_org_id(p_user_id),

    -- The full membership list (thin shape) — warms the organizations slice.
    'organizations', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', mo.id,
            'name', mo.name,
            'slug', mo.slug,
            'is_personal', mo.is_personal,
            'role', mo.role
          )
          ORDER BY mo.is_personal DESC, mo.name ASC
        ),
        '[]'::json
      )
      FROM member_orgs mo
    ),

    -- The resolved EXPLICIT active org (default-if-member → only-org → NULL).
    -- NULL is deliberate: it is the signal the UI uses to nudge the user.
    'active_organization_id', COALESCE(
      (SELECT mo.id FROM member_orgs mo
        WHERE mo.id = (SELECT default_org_id FROM default_pref)
        LIMIT 1),
      (SELECT mo.id FROM member_orgs mo
        WHERE (SELECT count(*) FROM member_orgs) = 1
        LIMIT 1)
    )

  );
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.get_ssr_shell_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_ssr_shell_data(uuid) IS
'Single RPC for SSR shell hydration. Fetches user session (admin + preferences),
AI models, context menu rows, SMS unread count, AND organization context
(personal org, resolved active org, membership list) in one DB round-trip.
Called client-side from DeferredShellData to hydrate the lite Redux store.';
