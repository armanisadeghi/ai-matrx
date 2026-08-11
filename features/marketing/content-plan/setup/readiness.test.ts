import { resolveCmsLink } from "./readiness";

const cmsSites = [
  {
    id: "cms-data-destruction",
    slug: "datadestruction-com",
    domain: "datadestruction.com",
  },
  {
    id: "cms-other",
    slug: "other-site",
    domain: "other.example",
  },
];

describe("resolveCmsLink", () => {
  it("uses the CMS site id already recorded on the plan", () => {
    expect(
      resolveCmsLink(
        {
          domain: "different.example",
          settings: { cms: { site_id: "cms-data-destruction" } },
        },
        cmsSites,
      ),
    ).toEqual({
      linked: true,
      cmsSiteId: "cms-data-destruction",
      cmsSlug: "datadestruction-com",
      matchedBy: "settings.cms.site_id",
      reason: null,
    });
  });

  it("resolves a recorded slug when an id was not stored", () => {
    const link = resolveCmsLink(
      {
        domain: null,
        settings: { cms: { slug: "datadestruction-com" } },
      },
      cmsSites,
    );

    expect(link.linked).toBe(true);
    expect(link.cmsSiteId).toBe("cms-data-destruction");
    expect(link.matchedBy).toBe("settings.cms.slug");
  });

  it("uses the existing domain match instead of creating a duplicate site", () => {
    const link = resolveCmsLink(
      { domain: "https://www.datadestruction.com/", settings: {} },
      cmsSites,
    );

    expect(link.linked).toBe(true);
    expect(link.cmsSiteId).toBe("cms-data-destruction");
    expect(link.matchedBy).toBe("domain");
  });

  it("returns a normal unlinked result when no CMS site can be resolved", () => {
    const link = resolveCmsLink(
      { domain: "missing.example", settings: {} },
      cmsSites,
    );

    expect(link.linked).toBe(false);
    expect(link.cmsSiteId).toBeNull();
    expect(link.reason).toContain("No CMS site matches missing.example");
  });
});
