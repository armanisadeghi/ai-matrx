import { siteSeoCapabilities } from "./capabilities";

describe("siteSeoCapabilities", () => {
  const sitePath = "/marketing/brands/brand-1/sites/site-1";
  const capabilities = siteSeoCapabilities(sitePath);

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

  it("routes site-scoped destinations through the supplied site path", () => {
    const siteScoped = capabilities.filter(
      (item) => item.key !== "search-console",
    );
    expect(
      siteScoped.every((item) => item.destination.startsWith(sitePath)),
    ).toBe(true);
  });
});
