/**
 * Pure catalog shaping for the run-pick surfaces (RunToolPicker,
 * RunSkillPicker): group labels and the grouped, sorted "Add" list.
 */

import type { DatabaseTool } from "../../../redux/tools/database-tool";
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
 * Any run-pick catalog (tools, skills) as groups: alphabetical by label,
 * "Other" (no group) last; items inside a group sorted by display name.
 */
export function groupCatalog<T>(
  items: readonly T[],
  groupOf: (item: T) => string | null | undefined,
  nameOf: (item: T) => string,
): { label: string; items: T[] }[] {
  const byLabel = new Map<string, T[]>();
  for (const item of items) {
    const label = toolCategoryLabel(groupOf(item));
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(item);
    else byLabel.set(label, [item]);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    })
    .map(([label, group]) => ({
      label,
      items: [...group].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }));
}

/** The tool catalog grouped by category, sorted by the name a person reads. */
export function groupToolCatalog<T extends CatalogTool>(
  tools: readonly T[],
): ToolCatalogGroup<T>[] {
  return groupCatalog(
    tools,
    (t) => t.category,
    (t) => getToolDisplayName(t.name),
  ).map((g) => ({ label: g.label, tools: g.items }));
}
