/**
 * Commands in the ⌘K bar — everything the window launcher opens, plus the
 * host's own commands when a resource picker hands its search step here.
 *
 * Raycast: commands and results share ONE list and one keyboard; a command is
 * just a row whose ↵ does something instead of opening a record. The window
 * launcher's entries are the sidebar Tools grid (`TOOLS_GRID_TILES`, activated
 * through `activateToolsGridTile`) — the one declarative list of every window
 * the app can open — so nothing the launcher offered is lost here, and a tile
 * added there appears here with no second list to maintain.
 */

import type { ItemMenuIcon } from "@ai-matrx/design-system/item";
import {
  TOOLS_CATEGORIES,
  TOOLS_GRID_TILES,
  type TileContext,
} from "@/features/window-panels/tools-grid/toolsGridTiles";
import { activateToolsGridTile } from "@/features/window-panels/tools-grid/activateToolsGridTile";

export interface KnowledgeCommand {
  id: string;
  label: string;
  /** Sub-heading shown dimmed on the row (the launcher category). */
  group?: string;
  icon?: ItemMenuIcon;
  /** Extra words that should find this command. */
  keywords?: string[];
  /** The command's own key chord, shown on its row (display only; the page answers the keys). */
  shortcut?: string;
  /** Present: shown, not runnable, with this one line. */
  disabledReason?: string;
  run: () => void;
}

// ── COMMANDS ON THIS PAGE ─────────────────────────────────────────────────────────────────────
//
// A page (the table page, a focused Data home row) offers its own object's verbs here, so ⌘K finds
// "Archive table" and "Share…" beside the launcher — Linear's command parity, in the ONE bar. A page
// registers a SOURCE, read when the bar opens (the object and its rights at that moment), never a
// stale snapshot. Same lifetime pattern as `registerActiveAttachTarget`.

type PageCommandSource = () => readonly KnowledgeCommand[];
const pageSources: PageCommandSource[] = [];

/** Offer this page's commands to ⌘K. Returns the unregister function. */
export function registerPageCommands(source: PageCommandSource): () => void {
  pageSources.push(source);
  return () => {
    const i = pageSources.lastIndexOf(source);
    if (i >= 0) pageSources.splice(i, 1);
  };
}

/** Every command the mounted pages offer right now, newest page first. */
export function pageCommands(): KnowledgeCommand[] {
  return [...pageSources].reverse().flatMap((source) => [...source()]);
}

export interface LauncherAudience {
  isAdmin: boolean;
  isCreator: boolean;
}

/** Every launcher tile this person may open, as a command. */
export function launcherCommands(
  audience: LauncherAudience,
  ctx: TileContext,
): KnowledgeCommand[] {
  const categoryLabel = new Map(TOOLS_CATEGORIES.map((c) => [c.id, c]));
  // Same gates as the Tools grid (ToolsGrid.tsx). The "dupes" bucket is an
  // admin audit of duplicate tiles, not something to open, so it is left out.
  const allowed = (gate: "admin" | "creator" | undefined) =>
    gate === "admin" ? audience.isAdmin : gate === "creator" ? audience.isCreator : true;
  const out: KnowledgeCommand[] = [];
  for (const tile of TOOLS_GRID_TILES) {
    if (tile.category === "dupes") continue;
    const category = categoryLabel.get(tile.category);
    if (!allowed(category?.gate) || !allowed(tile.gate)) continue;
    out.push({
      id: `launcher:${tile.id}`,
      label: tile.label,
      group: category?.label,
      icon: tile.icon,
      keywords: ["window", "open", category?.label ?? ""],
      run: () => {
        if (tile.onActivate) tile.onActivate(ctx);
        else activateToolsGridTile(tile.id, ctx);
      },
    });
  }
  return out;
}

/** Case-insensitive all-words match over label, group and keywords. */
export function filterCommands(
  commands: KnowledgeCommand[],
  text: string,
): KnowledgeCommand[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter((c) => {
    const hay = [c.label, c.group ?? "", ...(c.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
