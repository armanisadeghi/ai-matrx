/**
 * "All kinds" on /data-v2 offers Forms, Dashboards and Portals even when no table row carries
 * those kinds (CENSUS-HUB-CREATE item 7): they are items of `custom.data_home`, not table kinds,
 * so a kind list built from table rows alone never named them. Choosing Portals shows the
 * portals listing.
 */
import { ALL_KINDS, kindOne, kindsOnOffer, kindTitle, listingShownUnderKind } from "../dataHomeScope";

describe("the kind filter names the item kinds", () => {
  it("offers Forms, Dashboards and Portals when only plain tables exist", () => {
    const kinds = kindsOnOffer(["table", "table", "list"], ALL_KINDS);
    expect(kinds[0]).toBe(ALL_KINDS);
    expect(kinds).toEqual(expect.arrayContaining(["form", "dashboard", "portal"]));
    expect(kinds.filter((k) => k === "form")).toHaveLength(1);
  });

  it("says them in the siblings' plural and singular words", () => {
    expect(kindTitle("portal")).toBe("Portals");
    expect(kindOne("portal")).toBe("Portal");
    expect(kindTitle("form")).toBe("Forms");
    expect(kindTitle("dashboard")).toBe("Dashboards");
  });

  it("shows the portals listing under Portals, as forms under Forms", () => {
    expect(listingShownUnderKind("portals", "portal")).toBe(true);
    expect(listingShownUnderKind("forms", "form")).toBe(true);
    expect(listingShownUnderKind("portals", "form")).toBe(false);
  });
});
