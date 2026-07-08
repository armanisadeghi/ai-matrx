import { SupabaseClient } from "@supabase/supabase-js";
import { AIModel } from "@/features/ai-models/redux/modelRegistrySlice";

export interface ContextMenuRow {
  placement_type: string;
  categories_flat: unknown[];
}

/**
 * Thin org shape returned in the SSR payload — enough to warm the
 * organizations slice + the org picker without a secondary fetch.
 */
export interface SSRShellOrganization {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  role: string;
}

export interface SSRShellData {
  is_admin: boolean;
  preferences_exists: boolean;
  preferences: Record<string, unknown> | null;
  ai_models: AIModel[];
  context_menu: ContextMenuRow[];
  sms_unread_total: number;
  /** The user's never-null personal org (iam.personal_org_id). */
  personal_organization_id: string | null;
  /**
   * The resolved EXPLICIT active org (default-if-member → only-org → null).
   * Null is intentional — the signal the UI uses to nudge the user to pick
   * one; the personal org still rides along via selectEffectiveOrganizationId.
   */
  active_organization_id: string | null;
  /** The user's active org memberships (thin shape). */
  organizations: SSRShellOrganization[];
}

/**
 * Fetches all SSR shell hydration data in a single DB round-trip.
 * Replaces separate calls to get_user_session_data(), ai_model query,
 * context_menu_unified_view query, and sms unread count.
 *
 * Called client-side from `DeferredShellData` after auth resolves.
 */
export async function getSSRShellData(
  supabase: SupabaseClient,
  userId: string,
): Promise<SSRShellData> {
  const { data, error } = (await supabase
    .rpc("get_ssr_shell_data", { p_user_id: userId })
    .single()) as { data: SSRShellData | null; error: unknown };

  if (error) {
    const errObj = error as { message?: string; code?: string };
    // Detect missing RPC (not yet deployed) — return safe defaults instead of crashing
    if (
      errObj.code === "PGRST202" ||
      errObj.message?.includes("could not find")
    ) {
      console.warn(
        "[SSR Shell] get_ssr_shell_data RPC not found — run migrations/get_ssr_shell_data_rpc.sql. Returning defaults.",
      );
      return {
        is_admin: false,
        preferences_exists: false,
        preferences: null,
        ai_models: [],
        context_menu: [],
        sms_unread_total: 0,
        personal_organization_id: null,
        active_organization_id: null,
        organizations: [],
      };
    }
    console.error("[SSR Shell] Failed to fetch shell data:", error);
    throw new Error("Failed to fetch SSR shell data");
  }

  if (!data) {
    return {
      is_admin: false,
      preferences_exists: false,
      preferences: null,
      ai_models: [],
      context_menu: [],
      sms_unread_total: 0,
      personal_organization_id: null,
      active_organization_id: null,
      organizations: [],
    };
  }

  return data;
}

// getSSRAgentShellData was removed 2026-07-07 (D25 residual cleanup): its only
// caller was the DeferredShellData preload into agentContextMenuCacheSlice,
// which had no readers — the v2/v3 context menu fetches on open via
// /api/agent-context-menu instead.
