import {
  navChildPassesGates,
  type ShellNavChild,
  type ShellNavGates,
  type ShellNavItem,
} from "../constants/nav-data";

export interface NavSearchResult {
  item: ShellNavItem | ShellNavChild;
  groupLabel?: string;
}

/**
 * The phone drawer's destination search. Walks every level (a third-level
 * row reads "Industries · Education") and applies the same nav gates the
 * menus apply, so a gated destination (Make, Records, Kits) is found only
 * where its switch is on — and a gated sub-area takes its rows with it.
 */
export function searchNavDestinations(
  items: readonly ShellNavItem[],
  query: string,
  gates: ShellNavGates,
): NavSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const results: NavSearchResult[] = [];
  const visit = (children: readonly ShellNavChild[], path: string) => {
    for (const child of children) {
      if (!navChildPassesGates(child, gates)) continue;
      const childHaystack = [child.label, child.description, path]
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .toLocaleLowerCase();
      if (childHaystack.includes(needle)) {
        results.push({ item: child, groupLabel: path });
      }
      if (child.children?.length) {
        visit(child.children, `${path} · ${child.label}`);
      }
    }
  };
  for (const item of items) {
    const parentHaystack = [item.label, item.description]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLocaleLowerCase();
    if (parentHaystack.includes(needle)) results.push({ item });
    visit(item.children ?? [], item.label);
  }
  return results;
}
