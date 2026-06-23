-- ============================================================
-- get_ssr_shell_data(p_user_id uuid)
-- ============================================================
-- Single RPC that replaces 4–5 separate DB fetches at SSR time.
-- Called client-side from DeferredShellData after auth resolves.
-- Returns everything needed to fully hydrate the lite Redux store
-- before the first HTML byte is sent to the client.
--
-- Replaces:
--   • get_user_session_data()   → is_admin + preferences
--   • ai_model direct query     → fetchAvailableModels() thunk
--   • context_menu_unified_view → useUnifiedContextMenu() hook
--   • sms_conversations query   → unread badge count
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ssr_shell_data(p_user_id uuid)
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
    -- Replaces: fetchAvailableModels() client thunk
    'ai_models', (
      SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (
        SELECT
          *
        FROM public.ai_model
        WHERE is_deprecated = false
        ORDER BY common_name ASC
      ) m
    ),

    -- ── Context menu ──────────────────────────────────────────
    -- Replaces: useUnifiedContextMenu() Supabase query
    -- Returns all placement types — client filters to what it needs
    'context_menu', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT placement_type, categories_flat
        FROM public.context_menu_unified_view
      ) c
    ),

    -- ── SMS unread badge ──────────────────────────────────────
    -- Just the total count — full conversations fetched lazily on demand
    'sms_unread_total', (
      SELECT COALESCE(SUM(unread_count), 0)::int
      FROM public.sms_conversations
      WHERE user_id = p_user_id
        AND status = 'active'
    )

  );
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.get_ssr_shell_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_ssr_shell_data(uuid) IS
'Single RPC for SSR shell hydration. Fetches user session (admin + preferences),
AI models, context menu rows, and SMS unread count in one DB round-trip.
Called client-side from DeferredShellData to warm the lite Redux store context-menu cache.';
