// features/ai-models/topTierAccess.ts — who may run top-tier models (cost rating 6).
//
// Arman, 2026-10-08: "The only user who should be able to run those is me ... a simple per-user
// toggle, and everyone is off." The toggle is the per-person permission "models.top_tier" in
// auth app_metadata.permissions. Only a super admin changes it, through
// admin.set_top_tier_model_access (every change is an admin.admin_audit_log row: who, when).
// The server refuses every top-tier call for anyone else (aidream model_tier_gate) — these
// helpers only show and change the toggle.

import { createClient } from "@/utils/supabase/client";

export const TOP_TIER_MODELS_PERMISSION = "models.top_tier";
export const TOP_TIER_LOCKED_MESSAGE = "This model is limited to approved accounts";

export interface TopTierHolder {
  user_id: string;
  email: string | null;
  display_name: string | null;
  changed_at: string | null;
  changed_by: string | null;
  changed_by_email: string | null;
}

/** Everyone whose top-tier access is on, with who last turned it on and when (platform admins). */
export async function listTopTierHolders(): Promise<TopTierHolder[]> {
  const { data, error } = await createClient().schema("admin").rpc("top_tier_model_access_list");
  if (error) throw new Error(error.message);
  return (data ?? []) as TopTierHolder[];
}

/** Turn one person's top-tier access on or off (super admins; recorded). */
export async function setTopTierAccess(userId: string, enabled: boolean): Promise<void> {
  const { error } = await createClient()
    .schema("admin")
    .rpc("set_top_tier_model_access", { p_user: userId, p_enabled: enabled });
  if (error) throw new Error(error.message);
}
