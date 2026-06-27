-- ============================================================
-- get_ssr_agent_shell_data(p_user_id uuid)
-- ============================================================
-- Phase 3 — agent-aware companion to get_ssr_shell_data().
-- Identical user/preferences/ai_models/sms payload, but the
-- 'context_menu' field reads from the new agent_context_menu_view
-- (agent shortcuts + content blocks across all visible scopes).
--
-- This RPC is additive: the legacy get_ssr_shell_data() RPC is
-- unchanged so legacy consumers keep working until Phase 16/18.
-- The Phase 3 hook (useUnifiedAgentContextMenu) prefers data
-- written into the agent slices (via fetchUnifiedMenu) but will
-- accept legacy SSR rows as a "warm" signal.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ssr_agent_shell_data(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(

    -- ── User session ──────────────────────────────────────────
    'is_admin', (
      SELECT EXISTS(
        SELECT 1 FROM public.admins WHERE user_id = p_user_id
      )
    ),

    'preferences_exists', (
      SELECT EXISTS(
        SELECT 1 FROM public.user_preferences WHERE user_id = p_user_id
      )
    ),

    'preferences', (
      SELECT preferences
      FROM public.user_preferences
      WHERE user_id = p_user_id
      LIMIT 1
    ),

    -- ── AI models ─────────────────────────────────────────────
    'ai_models', (
      SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (
        SELECT *
        FROM ai.model
        WHERE is_deprecated = false
        ORDER BY common_name ASC
      ) m
    ),

    -- ── Agent context menu ────────────────────────────────────
    -- Pulls from agent_context_menu_view (Phase 1.3). Same column
    -- shape as the legacy view (placement_type + categories_flat).
    'agent_context_menu', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT placement_type, categories_flat
        FROM public.agent_context_menu_view
      ) c
    ),

    -- ── SMS unread badge ──────────────────────────────────────
    'sms_unread_total', (
      SELECT COALESCE(SUM(unread_count), 0)::int
      FROM public.sms_conversations
      WHERE user_id = p_user_id
        AND status = 'active'
    )

  );
$$;

GRANT EXECUTE ON FUNCTION public.get_ssr_agent_shell_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_ssr_agent_shell_data(uuid) IS
'Phase 3 SSR shell data RPC. Identical to get_ssr_shell_data() except the
context_menu field reads from agent_context_menu_view instead of the legacy
context_menu_unified_view. Consumed by the Phase 3 useUnifiedAgentContextMenu
hook. Both RPCs coexist until the legacy prompt system is deleted (Phase 18).';
