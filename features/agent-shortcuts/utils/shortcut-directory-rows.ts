import type { AgentShortcutCategory } from "../types";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import type { AdminNonGlobalShortcutRow } from "@/features/agents/redux/agent-shortcuts/thunks";
import type { UserShortcutItem } from "@/features/agents/redux/agent-shortcuts/types";
import { isValidShortcutContext } from "@/features/agents/utils/shortcut-context-utils";

export type ShortcutDirectoryMode = "admin" | "user";

export type ShortcutDirectoryGroupBy =
  "none" | "agent" | "scope" | "surface" | "category" | "placement";

export interface ShortcutDirectoryRow {
  id: string;
  label: string;
  description: string | null;
  agentId: string | null;
  agentName: string | null;
  categoryId: string;
  categoryLabel: string;
  placementType: string | null;
  scopeType: string;
  scopeName: string;
  surfaceName: string | null;
  enabledFeatures: string[];
  isActive: boolean;
  keyboardShortcut: string | null;
  ownerDisplay: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isShortcutUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function parseEnabledFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string =>
      typeof item === "string" && isValidShortcutContext(item),
  );
}

function resolveSurfaceName(
  surfaceName: string | null | undefined,
  enabledFeatures: string[],
): string | null {
  if (surfaceName && surfaceName.trim().length > 0) return surfaceName.trim();
  if (enabledFeatures.length === 1) return enabledFeatures[0] ?? null;
  if (enabledFeatures.length > 1) return enabledFeatures.join(", ");
  return null;
}

function categoryPlacement(
  categoryId: string,
  categoryById: Map<string, AgentShortcutCategory>,
): string | null {
  return categoryById.get(categoryId)?.placementType ?? null;
}

export function userShortcutItemToDirectoryRow(
  item: UserShortcutItem,
  categoryById: Map<string, AgentShortcutCategory>,
): ShortcutDirectoryRow {
  const enabledFeatures = parseEnabledFeatures(item.enabled_features);
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    agentId: item.agent_id,
    agentName: item.agent_name,
    categoryId: item.category_id,
    categoryLabel: item.category_label,
    placementType: categoryPlacement(item.category_id, categoryById),
    scopeType: item.scope_type,
    scopeName: item.scope_name,
    surfaceName: resolveSurfaceName(item.surface_name, enabledFeatures),
    enabledFeatures,
    isActive: item.is_active,
    keyboardShortcut: item.keyboard_shortcut,
    ownerDisplay: item.scope_name,
  };
}

export function adminNonGlobalRowToDirectoryRow(
  row: AdminNonGlobalShortcutRow,
  categoryById: Map<string, AgentShortcutCategory>,
): ShortcutDirectoryRow {
  const enabledFeatures = parseEnabledFeatures(row.enabled_features);
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    agentId: row.agent_id,
    agentName: null,
    categoryId: row.category_id,
    categoryLabel: categoryById.get(row.category_id)?.label ?? "—",
    placementType: categoryPlacement(row.category_id, categoryById),
    scopeType: row.scope_type,
    scopeName: row.owner_display ?? row.owner_email ?? row.scope_type,
    surfaceName: resolveSurfaceName(row.surface_name, enabledFeatures),
    enabledFeatures,
    isActive: row.is_active,
    keyboardShortcut: row.keyboard_shortcut,
    ownerDisplay: row.owner_display ?? row.owner_email,
  };
}

export function globalShortcutToDirectoryRow(
  shortcut: AgentShortcutRecord,
  categoryById: Map<string, AgentShortcutCategory>,
): ShortcutDirectoryRow {
  const cat = categoryById.get(shortcut.categoryId);
  const enabledFeatures = shortcut.enabledFeatures ?? [];
  return {
    id: shortcut.id,
    label: shortcut.label,
    description: shortcut.description,
    agentId: shortcut.agentId,
    agentName: shortcut.agentName,
    categoryId: shortcut.categoryId,
    categoryLabel: cat?.label ?? "—",
    placementType: cat?.placementType ?? null,
    scopeType: "system",
    scopeName: "System",
    surfaceName: resolveSurfaceName(shortcut.surfaceName, enabledFeatures),
    enabledFeatures,
    isActive: shortcut.isActive,
    keyboardShortcut: shortcut.keyboardShortcut,
    ownerDisplay: "System",
  };
}

export function resolveShortcutEditUrl(
  row: Pick<ShortcutDirectoryRow, "id" | "agentId">,
  mode: ShortcutDirectoryMode,
): string {
  if (mode === "admin") {
    if (row.agentId) {
      return `/administration/agents/system-agents/agents/${row.agentId}/shortcuts/${row.id}`;
    }
    return `/administration/agents/system-agents/edit/${row.id}`;
  }

  if (row.agentId) {
    return `/agents/${row.agentId}/shortcuts/${row.id}`;
  }
  return `/agents/shortcuts/edit/${row.id}`;
}

/**
 * Where the shortcut's AGENT lives, in this directory's mode.
 *
 * This exists for the same reason its two siblings above do: the admin
 * deployment PARKS the `(core)` route group, and `proxy.ts`'s satellite gate
 * bounces any non-`/administration/*` path on the admin host back to the main
 * host. So the registry's canonical `/agents/{id}` is not merely a different
 * page in admin mode — it is a different ORIGIN, and following it throws away
 * the console, the list, and every filter/sort/group the admin had set.
 *
 * `EntityRef.href` is documented for exactly this override.
 */
export function resolveAgentUrl(
  agentId: string,
  mode: ShortcutDirectoryMode,
): string {
  return mode === "admin"
    ? `/administration/agents/system-agents/agents/${agentId}`
    : `/agents/${agentId}`;
}

export function resolveShortcutDirectUrl(
  shortcutId: string,
  mode: ShortcutDirectoryMode,
): string {
  return mode === "admin"
    ? `/administration/agents/system-agents/shortcuts/${shortcutId}`
    : `/agents/shortcuts/${shortcutId}`;
}

export function getGroupKey(
  row: ShortcutDirectoryRow,
  groupBy: ShortcutDirectoryGroupBy,
): string {
  switch (groupBy) {
    case "agent":
      return row.agentName ?? row.agentId ?? "Unassigned agent";
    case "scope":
      return `${row.scopeType} — ${row.scopeName}`;
    case "surface":
      return row.surfaceName ?? "No surface";
    case "category":
      return row.categoryLabel;
    case "placement":
      return row.placementType ?? "Unknown placement";
    default:
      return "";
  }
}

export function scopeTypeLabel(scopeType: string): string {
  switch (scopeType) {
    case "system":
      return "System";
    case "personal":
    case "user":
      return "Personal";
    case "organization":
      return "Organization";
    case "project":
      return "Project";
    case "task":
      return "Task";
    default:
      return scopeType;
  }
}
