import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import type { SettingsControlSearchHit } from "@/features/settings/search/controlSearch";

/** Category/leaf matches are kept alongside exact-control results. */
export function findSettingsCategoryMatches(
  nodes: SettingsTreeNode[],
  query: string,
): SettingsTreeNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches: SettingsTreeNode[] = [];
  const visit = (current: SettingsTreeNode[]) => {
    for (const node of current) {
      const haystack = [
        node.label,
        node.description,
        ...(node.searchKeywords ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLocaleLowerCase();
      if (haystack.includes(needle)) matches.push(node);
      if (node.children) visit(node.children);
    }
  };
  visit(nodes);
  return matches;
}

export function hasSettingsSearchResults(
  query: string,
  exactResults: SettingsControlSearchHit[],
  categoryResults: SettingsTreeNode[],
): boolean {
  return (
    query.trim().length === 0 ||
    exactResults.length > 0 ||
    categoryResults.length > 0
  );
}
