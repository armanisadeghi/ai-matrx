/**
 * THE FULL-DATA LAW's production gate (A-9): which truncated `data_table`
 * values may offer a working "get the rest" button, decided by whether the
 * producing read can be FAITHFULLY re-run through `POST /table-kinds/read`.
 *
 * The component half (provider mounted on the dispatch path, demo provider
 * deferred to) is proven in the browser; this pins the decision logic so a
 * source shape change cannot silently start offering a button that lies —
 * or stop offering one that worked.
 */

import { refetchableTableSource } from "../DataTableBlockWithMore";

const sqlValue = (over: Record<string, unknown> = {}) => ({
  columns: [],
  rows: [],
  source: {
    origin: "sql",
    schema_name: "seo",
    table_name: "serp_opportunity",
    query: "select * from seo.serp_opportunity limit 5",
    ...over,
  },
});

describe("refetchableTableSource", () => {
  it("accepts the one live producer: a bare registered-model sql read", () => {
    expect(refetchableTableSource(sqlValue())).toEqual({
      table: "seo.serp_opportunity",
    });
    // No recorded query at all is still the bare read.
    expect(refetchableTableSource(sqlValue({ query: null }))).toEqual({
      table: "seo.serp_opportunity",
    });
  });

  it("REFUSES a query a bare re-read could not faithfully reproduce", () => {
    expect(
      refetchableTableSource(
        sqlValue({
          query: "select * from seo.serp_opportunity where score > 5 limit 5",
        }),
      ),
    ).toBeNull();
    expect(
      refetchableTableSource(sqlValue({ query: "select * from other.table limit 5" })),
    ).toBeNull();
  });

  it("REFUSES every origin this surface cannot re-run", () => {
    for (const origin of ["csv", "pdf", "data_table", null, undefined]) {
      expect(refetchableTableSource(sqlValue({ origin }))).toBeNull();
    }
  });

  it("REFUSES an sql source missing its identity", () => {
    expect(refetchableTableSource(sqlValue({ schema_name: null }))).toBeNull();
    expect(refetchableTableSource(sqlValue({ table_name: "" }))).toBeNull();
    expect(refetchableTableSource({})).toBeNull();
    expect(refetchableTableSource(null)).toBeNull();
  });
});
