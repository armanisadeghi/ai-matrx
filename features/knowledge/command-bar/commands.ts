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

import type { LucideIcon } from "lucide-react";
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
  icon?: LucideIcon;
  /** Extra words that should find this command. */
  keywords?: string[];
  run: () => void;
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
