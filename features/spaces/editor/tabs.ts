// features/spaces/editor/tabs.ts — tabs blocks are always well formed (N1, Notion's Tabs block).
//
// Runs where columns.ts runs (convert.ts, both directions), so no snapshot carries a shape the
// database refuses, whatever made it (a drag out of a tab, Shift+Tab at a tab's top level, an import):
//  - a block straight inside a tabs block joins the tab before it (the first tab when none is before;
//    a tab of its own when the block holds no tab at all);
//  - a tab outside a tabs block melts into its blocks.
// New ids derive from the old ones, so two co-editors healing the same page get identical trees.

import type { SpaceBlock } from "../contract";

export function normalizeTabs(blocks: SpaceBlock[]): SpaceBlock[] {
  const out: SpaceBlock[] = [];
  for (const b of blocks) {
    if (b.type === "tab") {
      out.push(...normalizeTabs(b.children ?? []));
      continue;
    }
    if (b.type !== "tabs") {
      out.push(b.children ? { ...b, children: normalizeTabs(b.children) } : b);
      continue;
    }
    const tabs: SpaceBlock[] = [];
    const strays: SpaceBlock[] = [];
    for (const k of b.children ?? []) {
      if (k.type === "tab") {
        tabs.push({ ...k, children: [...(k.children ?? [])] });
        continue;
      }
      if (tabs.length) tabs[tabs.length - 1].children!.push(k);
      else strays.push(k);
    }
    if (strays.length) {
      if (tabs.length) tabs[0].children = [...strays, ...(tabs[0].children ?? [])];
      else tabs.push({ id: `${b.id}-tab`, type: "tab", text: [{ text: "Tab 1" }], children: strays });
    }
    out.push({ ...b, children: tabs.map((t) => ({ ...t, children: normalizeTabs(t.children ?? []) })) });
  }
  return out;
}

/** True when the tree needs no change — the common case, checked before copying anything. */
export function tabsAreWellFormed(blocks: SpaceBlock[], parent: string | null = null): boolean {
  for (const b of blocks) {
    const kids = b.children ?? [];
    if (b.type === "tab" && parent !== "tabs") return false;
    if (b.type === "tabs" && kids.some((k) => k.type !== "tab")) return false;
    if (kids.length && !tabsAreWellFormed(kids, b.type)) return false;
  }
  return true;
}
