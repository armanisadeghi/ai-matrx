import { siteSeoCapabilities } from "./capabilities";

describe("siteSeoCapabilities", () => {
  const capabilities = siteSeoCapabilities("brand-1", "site-1");

  it("keeps every advertised capability actionable", () => {
    expect(capabilities).not.toHaveLength(0);
    for (const capability of capabilities) {
      expect(capability.destination).toMatch(/^\//);
      expect(capability.evidenceLabel.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes snapshot, catalogue, and provider systems", () => {
    expect(new Set(capabilities.map((item) => item.group))).toEqual(
      new Set(["snapshot", "catalogue", "provider"]),
    );
  });

  it("routes site-scoped destinations into the brand's site tree", () => {
    const siteScoped = capabilities.filter(
      (item) => item.key !== "search-console",
    );
    expect(
      siteScoped.every((item) =>
        /^\/marketing\/brand-1\/(websites|seo)\/site-1(\/|\?|$)/.test(
          item.destination,
        ),
      ),
    ).toBe(true);
  });
});
