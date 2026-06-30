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

export interface SSRAgentShellData {
  is_admin: boolean;
  preferences_exists: boolean;
  preferences: Record<string, unknown> | null;
  ai_models: AIModel[];
  agent_context_menu: ContextMenuRow[];
  sms_unread_total: number;
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

/**
 * Fetches the Phase 3 agent-aware SSR shell payload. Mirrors `getSSRShellData`
 * but reads from `agent.context_menu_view` for the context menu. Both RPCs
 * coexist during the prompts→agents migration — consumers can call either or
 * both (e.g. `DeferredShellData` calls both in parallel so the legacy prompt
 * menu and the new agent menu are each pre-populated).
 *
 * Returns safe defaults if the RPC is not deployed, matching the legacy helper.
 */
export async function getSSRAgentShellData(
  supabase: SupabaseClient,
  userId: string,
): Promise<SSRAgentShellData> {
  const { data, error } = (await supabase
    .rpc("get_ssr_agent_shell_data", { p_user_id: userId })
    .single()) as { data: SSRAgentShellData | null; error: unknown };

  if (error) {
    const errObj = error as { message?: string; code?: string };
    if (
      errObj.code === "PGRST202" ||
      errObj.message?.includes("could not find")
    ) {
      console.warn(
        "[SSR Shell] get_ssr_agent_shell_data RPC not found — run migrations/get_ssr_agent_shell_data_rpc.sql. Returning defaults.",
      );
      return {
        is_admin: false,
        preferences_exists: false,
        preferences: null,
        ai_models: [],
        agent_context_menu: [],
        sms_unread_total: 0,
      };
    }
    console.error("[SSR Shell] Failed to fetch agent shell data:", error);
    // Non-fatal — agent slices will fall back to the client-side fetch.
    return {
      is_admin: false,
      preferences_exists: false,
      preferences: null,
      ai_models: [],
      agent_context_menu: [],
      sms_unread_total: 0,
    };
  }

  if (!data) {
    return {
      is_admin: false,
      preferences_exists: false,
      preferences: null,
      ai_models: [],
      agent_context_menu: [],
      sms_unread_total: 0,
    };
  }

  return data;
}
