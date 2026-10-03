/**
 * The phone drawer's destination search finds every destination: no row is hidden behind a
 * switch (the record store is never off — Arman, 2026-10-03), so Make, Records and Kits are
 * found for everyone, with or without an active organization.
 */
import { DATA_NAV_CHILDREN, primaryNavItems } from "../constants/nav-data";
import { searchNavDestinations } from "./search-nav";

const dataRows = DATA_NAV_CHILDREN.filter((child) => ["/make", "/data-v2", "/kits"].includes(child.href ?? ""));

describe("phone menu search finds the Data destinations for everyone", () => {
  it("has the three rows to test", () => {
    expect(dataRows).toHaveLength(3);
  });

  it.each(dataRows.map((child) => [child.label, child] as const))("finds %s", (_label, child) => {
    const found = searchNavDestinations(primaryNavItems, child.label).some(({ item }) => item === child);
    expect(found).toBe(true);
  });
});
