/**
 * Arman, 2026-09-21: "the way the right-click on a column header works is
 * wrong because the options appear to not really be about the column and are
 * more about the table as a whole … I don't see any way of getting to [Use as
 * row label]". The right-click Column section holds only THIS column's doors —
 * its settings, use as row label, sort, filter, hide, insert beside, delete —
 * and the table-wide Colors dialog lives only in the Table section.
 */
jest.mock("@/features/context-menu-v3/utils/availability", () => ({
  needs: (what: string) => `Needs ${what}`,
  withAvailability: (section: { items: Array<{ id: string; disabled?: boolean; disabledReason?: string }> }, map: Record<string, string | undefined>) => ({
    ...section,
    items: section.items.map((i) => (map[i.id] ? { ...i, disabled: true, disabledReason: map[i.id] } : i)),
  }),
}));

import { buildGridColumnMenuSection } from "../grid-context-menu";

function section(overrides: { isRowLabel?: boolean; readOnly?: boolean } = {}) {
  const calls: string[] = [];
  const on = {
    rename: (f: string) => calls.push(`rename:${f}`),
    sortAsc: (f: string) => calls.push(`sortAsc:${f}`),
    sortDesc: (f: string) => calls.push(`sortDesc:${f}`),
    clearSort: () => calls.push("clearSort"),
    hide: (f: string) => calls.push(`hide:${f}`),
    configure: (f: string) => calls.push(`configure:${f}`),
    remove: (f: string) => calls.push(`remove:${f}`),
    insert: (f: string, side: string) => calls.push(`insert:${f}:${side}`),
    highlight: () => calls.push("highlight"),
    colorBy: () => calls.push("colorBy"),
    useAsRowLabel: (f: string) => calls.push(`rowLabel:${f}`),
    filter: (f: string) => calls.push(`filter:${f}`),
  };
  const built = buildGridColumnMenuSection({
    column: {
      fieldName: "account_email",
      displayName: "Account email",
      sortedBy: null,
      canColorBy: false,
      isColorBy: false,
      isRowLabel: overrides.isRowLabel ?? false,
    },
    readOnly: overrides.readOnly ?? false,
    isOnlyColumn: false,
    primary: true,
    on,
  });
  const items = built.items.filter((i) => i.kind !== "separator") as Array<{
    id: string;
    label: string;
    disabled?: boolean;
    onSelect?: () => void;
  }>;
  return { built, items, calls };
}

describe("the header's right-click Column section", () => {
  it("offers this column's own doors, including Use as row label and Filter", () => {
    const ids = section().items.map((i) => i.id);
    for (const id of [
      "grid-col-configure",
      "grid-col-row-label",
      "grid-col-sort-asc",
      "grid-col-filter",
      "grid-col-hide",
      "grid-col-insert-left",
      "grid-col-insert-right",
      "grid-col-delete",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("carries no table-wide item — the Colors dialog is the Table section's", () => {
    const labels = section().items.map((i) => i.label);
    expect(labels.some((l) => /^Table /.test(l))).toBe(false);
    expect(section().items.map((i) => i.id)).not.toContain("grid-col-colors");
  });

  it("Column settings opens THIS column, and Use as row label sets THIS column", () => {
    const s = section();
    s.items.find((i) => i.id === "grid-col-configure")!.onSelect!();
    s.items.find((i) => i.id === "grid-col-row-label")!.onSelect!();
    s.items.find((i) => i.id === "grid-col-filter")!.onSelect!();
    expect(s.calls).toEqual(["configure:account_email", "rowLabel:account_email", "filter:account_email"]);
  });

  it("on the column that already is the row label, says so instead of offering it", () => {
    const item = section({ isRowLabel: true }).items.find((i) => i.id === "grid-col-row-label")!;
    expect(item.disabled).toBe(true);
    expect(item.label).toBe("Row label (this column)");
  });
});
