// A column that declared `sortable: false` is never offered in the Filters &
// Sort panel. /education/flashcards offered "Folders (A→Z)" — a multi-valued
// column whose service ignores that sort — until the panel honoured the flag
// (page-pass 2026-09-27).

import { panelSortOptions } from "../components/EntityFilterPanel";
import type { EntityColumnSpec } from "../columns";

type Row = { id: string; name: string };

const col = (id: string, sortable?: boolean): EntityColumnSpec<Row> => ({
  id,
  label: id,
  column: { id, header: id, ...(sortable === undefined ? {} : { sortable }) },
});

describe("panelSortOptions", () => {
  it("offers sortable columns and never a column that declared sortable: false", () => {
    const values = panelSortOptions([
      col("name"),
      col("folders", false),
      col("study", false),
    ]).map((o) => o.value);
    expect(values).toContain("name-asc");
    expect(values).toContain("name-desc");
    expect(values.some((v) => v.startsWith("folders-"))).toBe(false);
    expect(values.some((v) => v.startsWith("study-"))).toBe(false);
  });
});

describe("panel sort presets and hidden columns (page-pass 2026-09-27)", () => {
  it("no sortable column → no sort options at all, presets included (/connected-sources)", () => {
    expect(panelSortOptions([col("name", false), col("status", false)])).toEqual([]);
  });

  it("a preset replaces its column's newest-first row — never both", () => {
    const opts = panelSortOptions([col("name"), col("updated_at")]);
    expect(opts[0]).toEqual({ value: "updated_at-desc", label: "Recently updated" });
    expect(opts.filter((o) => o.value === "updated_at-desc")).toHaveLength(1);
    expect(opts.map((o) => o.value)).toContain("updated_at-asc");
    expect(opts.some((o) => o.label === "Recently created")).toBe(false);
  });

  it("a hidden column is not offered unless it is the current sort", () => {
    const cols = [col("name"), col("topic")];
    expect(panelSortOptions(cols, { hiddenColumns: ["topic"] }).some((o) => o.value.startsWith("topic-"))).toBe(false);
    expect(
      panelSortOptions(cols, { hiddenColumns: ["topic"], current: "topic-asc" }).some((o) => o.value === "topic-asc"),
    ).toBe(true);
  });
});
