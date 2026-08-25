/**
 * TS half of the ColumnFilter parity guard.
 *
 * The canonical filter model has TWO executions: `matchesFilter` here in the
 * browser (shared by every grid) and `public.cms_item_matches_filter` in the
 * CMS database, which exists so a collection can be filtered, faceted and paged
 * over EVERY row rather than the page the browser happens to hold — a grid that
 * filters one page and then paginates the result lies about its own data.
 *
 * Two implementations of "does this row match" that disagree is the entire
 * class of bug this fixture exists to prevent. Every case here is also run in
 * SQL by `db/checks/cms_item_matches_filter_parity.sql`, against the same
 * expectations. Change one side and you must change the other and this file.
 */
import fixture from "./column-filter-parity.fixture.json";
import { matchesFilter, type ColumnFilter } from "@/features/data-tables/column-filters";

type Case = {
  name: string;
  cell: unknown;
  filter: ColumnFilter;
  expect: boolean;
};

const cases = fixture.cases as unknown as Case[];

describe("ColumnFilter parity — TS side", () => {
  it("carries every case the SQL twin runs", () => {
    // A shrinking fixture is how a guard quietly stops guarding.
    expect(cases.length).toBeGreaterThanOrEqual(28);
  });

  for (const c of cases) {
    it(c.name, () => {
      expect(matchesFilter(c.cell, c.filter)).toBe(c.expect);
    });
  }
});
