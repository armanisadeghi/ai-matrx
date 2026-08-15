import type { ShortcutDirectoryRow } from "./utils/shortcut-directory-rows";
import { scopeTypeLabel } from "./utils/shortcut-directory-rows";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentContentBlock, AgentShortcutCategory } from "./types";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

/**
 * Human-readable one-liner for a `ShortcutDirectoryRow` — the shared "Copy"
 * flavor for `ShortcutDirectory` (per-row + copy-all). Never duplicate this
 * summary elsewhere; the directory row shape is the flat projection every
 * directory surface already renders from.
 */
export function shortcutDirectoryRowSummary(row: ShortcutDirectoryRow): string {
  return [
    row.label,
    row.agentName
      ? `→ ${row.agentName}`
      : row.agentId
        ? `→ ${row.agentId}`
        : null,
    `[${scopeTypeLabel(row.scopeType)}: ${row.scopeName}]`,
    row.surfaceName ? `surface:${row.surfaceName}` : null,
    row.isActive ? null : "(inactive)",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Compact brief projection for the directory's "Briefs" AI variant. */
export interface ShortcutDirectoryBriefEntry {
  id: string;
  label: string;
  scope: string;
  agent: string | null;
  active: boolean;
}

export function buildShortcutDirectoryBriefs(
  rows: ShortcutDirectoryRow[],
): ShortcutDirectoryBriefEntry[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    scope: `${row.scopeType}:${row.scopeName}`,
    agent: row.agentName ?? row.agentId,
    active: row.isActive,
  }));
}

/**
 * Human-readable one-liner for a raw `AgentShortcutRecord` — used by
 * `ShortcutList` (which works off the record shape directly, not the
 * directory-row projection). Pass the resolved category label since the
 * record only stores `categoryId`.
 */
export function agentShortcutRecordSummary(
  shortcut: AgentShortcutRecord,
  category?: AgentShortcutCategory | null,
): string {
  return [
    shortcut.label,
    category?.label ? `[${category.label}]` : null,
    shortcut.agentName ? `→ ${shortcut.agentName}` : null,
    shortcut.autoRun ? "auto-run" : null,
    shortcut.allowChat ? "chat-enabled" : null,
    shortcut.keyboardShortcut ? `key:${shortcut.keyboardShortcut}` : null,
    shortcut.isActive ? null : "(inactive)",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Human-readable summary for an `AgentContentBlock`. `includeContent` governs
 * whether the block's template body is inlined (the field that can get
 * long) — shared by the "Metadata only" / "Everything" AI variants and the
 * plain human copy (which always includes it, since a human explicitly
 * copying one row wants the body).
 */
export function contentBlockSummary(
  block: AgentContentBlock,
  opts?: { category?: AgentShortcutCategory | null; includeContent?: boolean },
): string {
  const includeContent = opts?.includeContent ?? true;
  return [
    `${block.label} (${block.blockId})`,
    opts?.category?.label ? `[${opts.category.label}]` : null,
    block.description ?? null,
    block.isActive ? null : "(inactive)",
    includeContent ? `\n${block.template}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Agent shortcuts panel — `features/agents/components/shortcuts/AgentShortcutsPanel`
//
// The panel row is NOT the raw record: it leads with the SURFACE the shortcut
// targets, then scope, org, active state, hotkey and category. THE WHAT-I-SEE
// LAW — the payload is this rendered projection, with the raw record kept for
// the "Everything" variant.
// ---------------------------------------------------------------------------

/** The three count cards the panel leads with, mirrored into every payload. */
export interface AgentShortcutsPanelKpis {
  your_shortcuts: number;
  global_shortcuts: number;
  other_scope_shortcuts: number;
  total_shortcuts: number;
}

export function agentShortcutsPanelKpis(buckets: {
  user: AgentShortcutRecord[];
  global: AgentShortcutRecord[];
  other: AgentShortcutRecord[];
}): AgentShortcutsPanelKpis {
  return {
    your_shortcuts: buckets.user.length,
    global_shortcuts: buckets.global.length,
    other_scope_shortcuts: buckets.other.length,
    total_shortcuts:
      buckets.user.length + buckets.global.length + buckets.other.length,
  };
}

/** The scope badge the row renders — "Yours" / "Global" / "Shared". */
export function agentShortcutScopeBadgeLabel(
  shortcut: AgentShortcutRecord,
): "Yours" | "Global" | "Shared" {
  if (shortcut.userId) return "Yours";
  if (
    shortcut.organizationId === null &&
    shortcut.projectId === null &&
    shortcut.taskId === null
  ) {
    return "Global";
  }
  return "Shared";
}

/** One shortcut row, in the shape and order the panel draws it. */
export interface AgentShortcutPanelRow {
  id: string;
  /** Primary heading: the surface's canonical label, or null when unset. */
  surface_label: string | null;
  /** The raw `client/surface` path shown under the heading. */
  surface_name: string | null;
  scope: "Yours" | "Global" | "Shared";
  organization_id: string | null;
  organization_name: string | null;
  label: string;
  description: string | null;
  category: string | null;
  category_placement: string | null;
  keyboard_shortcut: string | null;
  icon_name: string | null;
  is_active: boolean;
  display_mode: string;
  auto_run: boolean;
  allow_chat: boolean;
  agent_id: string | null;
  agent_name: string | null;
  use_latest: boolean;
  editor_href: string;
}

export function buildAgentShortcutPanelRow(
  shortcut: AgentShortcutRecord,
  opts: {
    category?: AgentShortcutCategory | null;
    orgName?: string | null;
    editorHref: string;
  },
): AgentShortcutPanelRow {
  return {
    id: shortcut.id,
    surface_label: shortcut.surfaceName
      ? getSurfaceDisplayLabel(shortcut.surfaceName)
      : null,
    surface_name: shortcut.surfaceName,
    scope: agentShortcutScopeBadgeLabel(shortcut),
    organization_id: shortcut.organizationId,
    organization_name: opts.orgName ?? null,
    label: shortcut.label,
    description: shortcut.description,
    category: opts.category?.label ?? null,
    category_placement: opts.category?.placementType ?? null,
    keyboard_shortcut: shortcut.keyboardShortcut,
    icon_name: shortcut.iconName,
    is_active: shortcut.isActive,
    display_mode: shortcut.displayMode,
    auto_run: shortcut.autoRun,
    allow_chat: shortcut.allowChat,
    agent_id: shortcut.agentId,
    agent_name: shortcut.agentName,
    use_latest: shortcut.useLatest,
    editor_href: opts.editorHref,
  };
}

/** The human one-liner for a panel row — surface first, exactly as rendered. */
export function agentShortcutPanelRowSummary(
  row: AgentShortcutPanelRow,
): string {
  return [
    row.surface_label ?? "No surface",
    row.surface_name ? `(${row.surface_name})` : null,
    `[${row.scope}${row.organization_name ? `: ${row.organization_name}` : ""}]`,
    `label:${row.label}`,
    row.category
      ? `category:${row.category_placement ?? "?"} · ${row.category}`
      : null,
    row.keyboard_shortcut ? `key:${row.keyboard_shortcut}` : null,
    row.is_active ? null : "(inactive)",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Compact brief per panel row — the panel's short "Briefs" AI variant. */
export interface AgentShortcutPanelBrief {
  id: string;
  surface: string | null;
  scope: string;
  label: string;
  category: string | null;
  key: string | null;
  active: boolean;
}

export function buildAgentShortcutPanelBriefs(
  rows: AgentShortcutPanelRow[],
): AgentShortcutPanelBrief[] {
  return rows.map((row) => ({
    id: row.id,
    surface: row.surface_label ?? row.surface_name,
    scope: row.organization_name
      ? `${row.scope}: ${row.organization_name}`
      : row.scope,
    label: row.label,
    category: row.category,
    key: row.keyboard_shortcut,
    active: row.is_active,
  }));
}

/** Flat CSV-shaped rows — ALL shortcuts, never the visible slice. */
export function agentShortcutPanelCsvRows(
  rows: AgentShortcutPanelRow[],
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    surface_label: row.surface_label ?? "",
    surface_name: row.surface_name ?? "",
    scope: row.scope,
    organization: row.organization_name ?? "",
    label: row.label,
    description: row.description ?? "",
    category: row.category ?? "",
    category_placement: row.category_placement ?? "",
    keyboard_shortcut: row.keyboard_shortcut ?? "",
    is_active: row.is_active,
    display_mode: row.display_mode,
    auto_run: row.auto_run,
    allow_chat: row.allow_chat,
    agent_id: row.agent_id ?? "",
    agent_name: row.agent_name ?? "",
    use_latest: row.use_latest,
    shortcut_id: row.id,
  }));
}
