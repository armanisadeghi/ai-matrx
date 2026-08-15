/**
 * Org module settings — per-org rules for each resource kind.
 *
 * Reads go through the `get_org_module_settings` RPC (over canonical
 * `platform.org_module_config`); the write goes through the `set_org_module_setting`
 * SECURITY DEFINER RPC (owner/admin gated). `module_key` is the canonical entity
 * token returned by `moduleKey(entry)`; bare physical table names are not keys.
 * The share RPC enforces members_can_add /
 * requires_approval off the same key).
 */

import { supabase } from "@/utils/supabase/client";
import type { PermissionLevel } from "@/utils/permissions/types";
import { isJsonObject } from "@/types/json";

// Re-exported so consumers can import the level type alongside the settings type.
export type { PermissionLevel };

export interface OrgModuleSetting {
  membersCanAdd: boolean;
  requiresApproval: boolean;
  defaultPermission: PermissionLevel;
  autoIngest: boolean;
  isScopeable: boolean;
  membersCanAddCustomValues: boolean;
  customValues: Record<string, string[]>;
}

/** Defaults applied to any module without an explicit row (matches the DB defaults). */
export const DEFAULT_MODULE_SETTING: OrgModuleSetting = {
  membersCanAdd: true,
  requiresApproval: false,
  defaultPermission: "viewer",
  autoIngest: false,
  isScopeable: true,
  membersCanAddCustomValues: false,
  customValues: {},
};

function parseCustomValues(value: unknown): Record<string, string[]> {
  if (!isJsonObject(value)) {
    throw new Error("Organization custom settings have an invalid shape.");
  }
  const parsed: Record<string, string[]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!Array.isArray(candidate)) {
      throw new Error("Organization custom settings have an invalid shape.");
    }
    const values: string[] = [];
    for (const item of candidate) {
      if (typeof item !== "string" || item.length === 0) {
        throw new Error("Organization custom settings have an invalid shape.");
      }
      values.push(item);
    }
    parsed[key] = values;
  }
  return parsed;
}

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
      membersCanAddCustomValues: Boolean(r.members_can_add_custom_values),
      customValues: parseCustomValues(r.custom_values),
    });
  }
  return map;
}

export interface OrgModuleCustomValues {
  values: string[];
  membersCanAdd: boolean;
  canAdmin: boolean;
}

function parseCustomValuesResult(value: unknown): OrgModuleCustomValues {
  if (!isJsonObject(value) || !Array.isArray(value.values)) {
    throw new Error("Organization custom settings have an invalid response.");
  }
  const values: string[] = [];
  for (const item of value.values) {
    if (typeof item !== "string" || item.length === 0) {
      throw new Error("Organization custom settings have an invalid response.");
    }
    values.push(item);
  }
  return {
    values,
    membersCanAdd: value.members_can_add === true,
    canAdmin: value.can_admin === true,
  };
}

/** Read one named org-level value list and the policy that governs additions. */
export async function getOrgModuleCustomValues(
  orgId: string,
  moduleKey: string,
  namespace: string,
): Promise<OrgModuleCustomValues> {
  const { data, error } = await supabase.rpc("org_module_custom_values", {
    p_org_id: orgId,
    p_module_key: moduleKey,
    p_namespace: namespace,
  });
  if (error) throw error;
  return parseCustomValuesResult(data);
}

export async function addOrgModuleCustomValue(
  orgId: string,
  moduleKey: string,
  namespace: string,
  value: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("org_module_custom_value_add", {
    p_org_id: orgId,
    p_module_key: moduleKey,
    p_namespace: namespace,
    p_value: value,
  });
  if (error) throw error;
  return parseCustomValuesResult(data).values;
}

export async function removeOrgModuleCustomValue(
  orgId: string,
  moduleKey: string,
  namespace: string,
  value: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("org_module_custom_value_remove", {
    p_org_id: orgId,
    p_module_key: moduleKey,
    p_namespace: namespace,
    p_value: value,
  });
  if (error) throw error;
  return parseCustomValuesResult(data).values;
}

export async function setOrgModuleCustomValuePolicy(
  orgId: string,
  moduleKey: string,
  membersCanAdd: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("org_module_custom_value_policy_set", {
    p_org_id: orgId,
    p_module_key: moduleKey,
    p_members_can_add: membersCanAdd,
  });
  if (error) throw error;
}

/**
 * One module's effective setting for an org (merged with defaults). Convenience
 * for consumers that only care about a single kind — e.g. the scopes tag picker
 * checking `isScopeable` before allowing a kind to be tagged, or a share flow
 * reading `defaultPermission`. `moduleKey` is `moduleKey(entry)` from the
 * resource catalogue (canonical entity token).
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
      const parsedError =
        typeof parsed.error === "string" ? parsed.error : "Failed to save";
      return { success: false, error: parsedError };
    }
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to save module setting";
    console.error("[orgModuleSettings] save failed:", message);
    return { success: false, error: message };
  }
}
