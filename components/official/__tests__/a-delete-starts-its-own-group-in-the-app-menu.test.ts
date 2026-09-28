/**
 * The records-ui grid's menu sections as the app's right-click menu (DATA-V2-BASICS-2): an item
 * that starts a new group (`separatorBefore`) gets a divider above it, so "Delete row…" sits in
 * its own group, last, in the app menu as in the grid's own header menu.
 */
import { toContextMenuExtraSections } from "../table-menu-sections";

describe("a delete starts its own group in the app menu", () => {
  it("draws a divider above an item that starts a group, and none elsewhere", () => {
    const [row] = toContextMenuExtraSections([
      {
        id: "row",
        title: "Pinch gauges (set of 3)",
        items: [
          { id: "row-duplicate", label: "Duplicate row", onSelect: () => {} },
          { id: "row-highlight", label: "Highlight row", onSelect: () => {} },
          { id: "row-archive", label: "Delete row…", destructive: true, separatorBefore: true, onSelect: () => {} } as never,
        ],
      },
    ]);
    expect(row!.items.map((i) => i.kind === "separator" ? "|" : (i as { id: string }).id)).toEqual([
      "row-duplicate",
      "row-highlight",
      "|",
      "row-archive",
    ]);
  });
});
