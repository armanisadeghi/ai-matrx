/**
 * Org module settings — per-org rules for each resource kind.
 *
 * Reads go through the `get_org_module_settings` RPC (over canonical
 * `platform.org_module_config`); the write goes through the `set_org_module_setting`
 * SECURITY DEFINER RPC (owner/admin gated). Both bridge module table-name <-> entity token.
 * `module_key` matches `moduleKey(entry)` from the resource catalogue (canonical
 * table name for shareable kinds — the share RPC enforces members_can_add /
 * requires_approval off the same key).
 */

import { supabase } from "@/utils/supabase/client";
import type { PermissionLevel } from "@/utils/permissions";
import { isJsonObject } from "@/types/json";

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
  const { data, error } = await supabase.rpc("get_org_module_settings", {
    p_org_id: orgId,
  });
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

/**
 * One module's effective setting for an org (merged with defaults). Convenience
 * for consumers that only care about a single kind — e.g. the scopes tag picker
 * checking `isScopeable` before allowing a kind to be tagged, or a share flow
 * reading `defaultPermission`. `moduleKey` is `moduleKey(entry)` from the
 * resource catalogue (canonical table name for shareable kinds).
 */
export async function getOrgModuleSetting(
  orgId: string,
  moduleKey: string,
): Promise<OrgModuleSetting> {
  const map = await getOrgModuleSettings(orgId);
  return map.get(moduleKey) ?? DEFAULT_MODULE_SETTING;
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
    const parsed = isJsonObject(data) ? data : {};
    const success = parsed.success === true;
    if (!success) {
      const parsedError = typeof parsed.error === "string" ? parsed.error : "Failed to save";
      return { success: false, error: parsedError };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save module setting";
    console.error("[orgModuleSettings] save failed:", message);
    return { success: false, error: message };
  }
}
