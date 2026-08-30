import { brandSwitchHref } from "./brand-switch";

describe("brandSwitchHref — same route on the new brand, degraded only when entity-scoped", () => {
  it("keeps static section routes verbatim", () => {
    expect(brandSwitchHref("vasaro", "/marketing/acme/identity/media/generate")).toBe(
      "/marketing/vasaro/identity/media/generate",
    );
    expect(brandSwitchHref("vasaro", "/marketing/acme/settings")).toBe(
      "/marketing/vasaro/settings",
    );
    expect(brandSwitchHref("vasaro", "/marketing/acme/intelligence/competitors")).toBe(
      "/marketing/vasaro/intelligence/competitors",
    );
    expect(brandSwitchHref("vasaro", "/marketing/acme")).toBe("/marketing/vasaro");
  });

  it("degrades site-scoped branches to the branch door", () => {
    expect(
      brandSwitchHref(
        "vasaro",
        "/marketing/acme/seo/acme-com/keywords/value/rules",
      ),
    ).toBe("/marketing/vasaro/seo");
    expect(
      brandSwitchHref("vasaro", "/marketing/acme/websites/acme-com/pages/p-1"),
    ).toBe("/marketing/vasaro/websites");
    expect(
      brandSwitchHref("vasaro", "/marketing/acme/content/plan/acme-com/table"),
    ).toBe("/marketing/vasaro/content/plan");
    expect(
      brandSwitchHref("vasaro", "/marketing/acme/locations/loc-1"),
    ).toBe("/marketing/vasaro/locations");
    expect(
      brandSwitchHref("vasaro", "/marketing/acme/planning/initiatives/i-1"),
    ).toBe("/marketing/vasaro/planning/initiatives");
    expect(
      brandSwitchHref("vasaro", "/marketing/acme/intelligence/reputation/acme-com"),
    ).toBe("/marketing/vasaro/intelligence/reputation");
  });

  it("keeps branch DOORS themselves verbatim", () => {
    expect(brandSwitchHref("vasaro", "/marketing/acme/seo")).toBe(
      "/marketing/vasaro/seo",
    );
    expect(brandSwitchHref("vasaro", "/marketing/acme/content/plan")).toBe(
      "/marketing/vasaro/content/plan",
    );
  });

  it("carries the query minus entity-selection params", () => {
    expect(
      brandSwitchHref(
        "vasaro",
        "/marketing/acme/identity/knowledge",
        "?site=acme-com&view=map",
      ),
    ).toBe("/marketing/vasaro/identity/knowledge?view=map");
  });
});
