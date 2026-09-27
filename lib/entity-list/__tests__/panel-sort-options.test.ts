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
