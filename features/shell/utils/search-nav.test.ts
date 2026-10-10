/**
 * The phone drawer's destination search finds every destination: no row is hidden behind a
 * switch (the record store is never off — Arman, 2026-10-03), so Make and Tables (the record store at /data) are
 * found for everyone, with or without an active organization.
 */
import { DATA_NAV_CHILDREN, primaryNavItems } from "../constants/nav-data";
import { searchNavDestinations } from "./search-nav";

// Destinations only: the "Data Tables Window" panel row and the "New Table" action also carry /data.
// Make moved to the Workspace menu (Arman, 2026-10-09), so it is read from there.
const workspaceChildren = primaryNavItems.find((item) => item.label === "Workspace")?.children ?? [];
const dataRows = [...DATA_NAV_CHILDREN, ...workspaceChildren].filter(
  (child) => ["/make", "/data"].includes(child.href ?? "") && !child.panelAction && !child.actionItem,
);

describe("phone menu search finds the Data destinations for everyone", () => {
  it("has the two rows to test", () => {
    expect(dataRows).toHaveLength(2);
  });

  it.each(dataRows.map((child) => [child.label, child] as const))("finds %s", (_label, child) => {
    const found = searchNavDestinations(primaryNavItems, child.label).some(({ item }) => item === child);
    expect(found).toBe(true);
  });
});
