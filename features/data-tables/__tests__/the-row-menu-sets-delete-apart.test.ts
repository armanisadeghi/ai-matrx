/**
 * The row's right-click menu (DATA-V2-BASICS-2, item 4 of the brief: "Delete apart from Duplicate /
 * Edit"). MEASURED on the Sheet: the "Row · <name>" submenu ran Add, Edit, Duplicate, Copy, History,
 * Get reference, Highlight, Delete — Delete one row under Highlight with no divider, where the
 * column's menu has always set its Delete off with one ("grid-col-sep-delete"). A destructive item
 * sits in its own group, after a separator, last.
 */
jest.mock("@/features/context-menu-v3/utils/availability", () => ({
  needs: (what: string) => `Needs ${what}`,
  withAvailability: (section: { items: Array<{ id: string; disabled?: boolean; disabledReason?: string }> }, map: Record<string, string | undefined>) => ({
    ...section,
    items: section.items.map((i) => (map[i.id] ? { ...i, disabled: true, disabledReason: map[i.id] } : i)),
  }),
}));

import { buildGridRowMenuSection } from "../grid-context-menu";

const noop = () => {};
const on = { add: noop, edit: noop, duplicate: noop, copy: noop, history: noop, reference: noop, remove: noop, highlight: noop, runAction: noop };

function kinds(actions?: { id: string; name: string; description: string }[]) {
  const built = buildGridRowMenuSection({ row: { id: "r1", label: "Pinch gauges (set of 3)" }, readOnly: false, on, ...(actions ? { actions } : {}) } as never);
  return built.items.map((i) => (i.kind === "separator" ? "|" : (i as { id: string }).id));
}

describe("the row menu sets Delete apart", () => {
  it("puts Delete last, after a separator, away from Duplicate and Edit", () => {
    const ids = kinds();
    expect(ids[ids.length - 1]).toBe("grid-row-delete");
    expect(ids[ids.length - 2]).toBe("|");
    expect(ids.indexOf("grid-row-duplicate")).toBeLessThan(ids.lastIndexOf("|"));
    expect(ids.indexOf("grid-row-edit")).toBeLessThan(ids.lastIndexOf("|"));
  });

  it("keeps it apart when the table has row actions too", () => {
    const ids = kinds([{ id: "a1", name: "Reorder", description: "" }]);
    expect(ids.slice(-2)).toEqual(["|", "grid-row-delete"]);
  });
});
