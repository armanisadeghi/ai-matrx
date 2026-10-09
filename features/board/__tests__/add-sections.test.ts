/**
 * EVERY ITEM TYPE DECLARES ITS ADD-MENU SECTION, and the Board menu lists the same sections in the
 * same order. A new type with no (or an unknown) section fails here; so does a Board menu row that
 * is filed under a different section than its type.
 */
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BOARD_SECTIONS, boardSectionLabel } from "../items/types";

type NavNode = { href?: string; group?: string; children?: readonly NavNode[] };
function boardMenuRows(): { key: string; group: string | undefined }[] {
  const rows: { key: string; group: string | undefined }[] = [];
  const walk = (nodes: readonly NavNode[]) => {
    for (const n of nodes) {
      const m = n.href?.match(/^\/board\?add=([^&]+)$/);
      if (m) rows.push({ key: decodeURIComponent(m[1]), group: n.group });
      if (n.children) walk(n.children);
    }
  };
  walk(primaryNavItems as unknown as NavNode[]);
  return rows;
}

describe("Add menu sections", () => {
  it("every registered type declares one known section", () => {
    const known = new Set<string>(BOARD_SECTIONS.map((s) => s.key));
    const bad = BOARD_ITEM_TYPES.filter((t) => !t.section || !known.has(t.section)).map((t) => t.key);
    expect(bad).toEqual([]);
  });

  it("the Board menu files each row under its type's section, sections in menu order", () => {
    const rows = boardMenuRows();
    const wrong = rows.filter((r) => {
      const t = BOARD_ITEM_TYPES.find((x) => x.key === r.key);
      return !t || r.group !== boardSectionLabel(t.section);
    });
    expect(wrong).toEqual([]);
    const order = BOARD_SECTIONS.map((s) => s.label as string);
    const seen = rows.map((r) => order.indexOf(r.group ?? ""));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});
