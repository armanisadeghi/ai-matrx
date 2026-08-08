import type { ShortcutDirectoryRow } from "./utils/shortcut-directory-rows";
import { scopeTypeLabel } from "./utils/shortcut-directory-rows";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentContentBlock, AgentShortcutCategory } from "./types";

/**
 * Human-readable one-liner for a `ShortcutDirectoryRow` — the shared "Copy"
 * flavor for `ShortcutDirectory` (per-row + copy-all). Never duplicate this
 * summary elsewhere; the directory row shape is the flat projection every
 * directory surface already renders from.
 */
export function shortcutDirectoryRowSummary(row: ShortcutDirectoryRow): string {
  return [
    row.label,
    row.agentName ? `→ ${row.agentName}` : row.agentId ? `→ ${row.agentId}` : null,
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
