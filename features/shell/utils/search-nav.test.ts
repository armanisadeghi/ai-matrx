/**
 * The phone drawer's destination search applies the nav gates the menus
 * apply: a gated destination (Make, Records, Kits) is found only where its
 * switch is on. Before, the search walked the raw tree and offered gated
 * rows to everyone.
 */
import { primaryNavItems, expandNavChildren } from "../constants/nav-data";
import { searchNavDestinations } from "./search-nav";

const gated = primaryNavItems
  .flatMap((item) => expandNavChildren(item.children))
  .filter((child) => child.gate !== undefined);

describe("phone menu search respects the nav gates", () => {
  it("has gated rows to test", () => {
    expect(gated.length).toBeGreaterThan(0);
  });

  it.each(gated.map((child) => [child.label, child]))(
    "finds %s only where its switch is on",
    (_label, child) => {
      const found = (on: boolean) =>
        searchNavDestinations(primaryNavItems, child.label, {
          [child.gate!]: on,
        }).some(({ item }) => item === child);
      expect(found(false)).toBe(false);
      expect(found(true)).toBe(true);
    },
  );
});
