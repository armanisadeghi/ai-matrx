/**
 * Org module settings — per-org rules for each resource kind.
 *
 * Reads go through the (RLS-guarded) `org_module_settings` table; the write goes
 * through the `set_org_module_setting` SECURITY DEFINER RPC (owner/admin gated).
 * `module_key` matches `moduleKey(entry)` from the resource catalogue (canonical
 * table name for shareable kinds — the share RPC enforces members_can_add /
 * requires_approval off the same key).
 */

import { supabase } from "@/utils/supabase/client";
import type { PermissionLevel } from "@/utils/permissions";

// Re-exported so consumers can import the level type alongside the settings type.
export type { PermissionLevel };

export interface OrgModuleSetting {
  membersCanAdd: boolean;
  requiresApproval: boolean;
  defaultPermission: PermissionLevel;
  autoIngest: boolean;
  isScopeable: boolean;
}

/** Defaults applied to any module without an explicit row (matches the DB defaults). */
export const DEFAULT_MODULE_SETTING: OrgModuleSetting = {
  membersCanAdd: true,
  requiresApproval: false,
  defaultPermission: "viewer",
  autoIngest: false,
  isScopeable: true,
};

export async function getOrgModuleSettings(
  orgId: string,
): Promise<Map<string, OrgModuleSetting>> {
  const map = new Map<string, OrgModuleSetting>();
  if (!orgId) return map;
  const { data, error } = await supabase
    .from("org_module_settings")
    .select(
      "module_key, members_can_add, requires_approval, default_permission, auto_ingest, is_scopeable",
    )
    .eq("organization_id", orgId);
  if (error) {
    console.error("[orgModuleSettings] load failed:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    map.set(String(r.module_key), {
      membersCanAdd: Boolean(r.members_can_add),
      requiresApproval: Boolean(r.requires_approval),
      defaultPermission: (r.default_permission as PermissionLevel) ?? "viewer",
      autoIngest: Boolean(r.auto_ingest),
      isScopeable: Boolean(r.is_scopeable),
    });
  }
  return map;
}

export async function setOrgModuleSetting(
  orgId: string,
  moduleKey: string,
  setting: OrgModuleSetting,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("set_org_module_setting", {
      p_org_id: orgId,
      p_module_key: moduleKey,
      p_members_can_add: setting.membersCanAdd,
      p_requires_approval: setting.requiresApproval,
      p_default_permission: setting.defaultPermission,
      p_auto_ingest: setting.autoIngest,
      p_is_scopeable: setting.isScopeable,
    });
    if (error) throw error;
    const parsed = (data ?? {}) as { success?: boolean; error?: string };
    if (!parsed.success) return { success: false, error: parsed.error ?? "Failed to save" };
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save module setting";
    console.error("[orgModuleSettings] save failed:", message);
    return { success: false, error: message };
  }
}
