/**
 * Pure catalog shaping for THE Tools surface (RunToolPicker): category labels
 * and the grouped, sorted "Add tools" list.
 */

import type { DatabaseTool } from "@host/utils/supabase/tools-service";
import { getToolDisplayName } from "../../../../tool-call-visualization/registry/registry";

/** Group label for a registry category slug: `web_search` → `Web search`. */
export function toolCategoryLabel(category: string | null | undefined): string {
  const words = (category ?? "").replace(/[_-]+/g, " ").trim();
  if (!words) return "Other";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type CatalogTool = Pick<DatabaseTool, "name" | "category">;

export interface ToolCatalogGroup<T extends CatalogTool = DatabaseTool> {
  label: string;
  tools: T[];
}

/**
 * The catalog as category groups, alphabetical, "Other" (no category) last;
 * tools inside a group sorted by their display name.
 */
export function groupToolCatalog<T extends CatalogTool>(
  tools: readonly T[],
): ToolCatalogGroup<T>[] {
  const byLabel = new Map<string, T[]>();
  for (const tool of tools) {
    const label = toolCategoryLabel(tool.category);
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(tool);
    else byLabel.set(label, [tool]);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    })
    .map(([label, group]) => ({
      label,
      tools: [...group].sort((a, b) =>
        getToolDisplayName(a.name).localeCompare(getToolDisplayName(b.name)),
      ),
    }));
}
