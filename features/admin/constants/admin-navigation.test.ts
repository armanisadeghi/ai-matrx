import {
  adminMenuDomains,
  adminMenuPathname,
  adminNavigationRegistry,
  findAdminNavigationLocation,
  getAdminNavigationArchitectureErrors,
} from "./admin-navigation";

describe("admin navigation registry", () => {
  it("registers every destination link exactly once", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const domain of adminNavigationRegistry) {
      for (const section of domain.sections) {
        for (const item of section.destinations) {
          const here = `${domain.name} → ${section.name}`;
          const first = seen.get(item.link);
          if (first) {
            duplicates.push(`${item.link}: ${first} and ${here}`);
          } else {
            seen.set(item.link, here);
          }
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("reports no architecture errors", () => {
    expect(getAdminNavigationArchitectureErrors()).toEqual([]);
  });

  // Arman, 2026-09-25: Mandates are a Feature of the Intelligence domain and
  // never under Agents; one menu entry; the owner's original pages keep working
  // (declared, reachable from inside the new list) but are never a menu row.
  it("puts Mandates under Intelligence as ONE menu entry", () => {
    const menuLinks = adminMenuDomains.flatMap((domain) =>
      domain.sections.flatMap((section) =>
        section.destinations.map((item) => ({ domain: domain.slug, link: item.link })),
      ),
    );
    const mandateRows = menuLinks.filter(({ link }) => /mandates/.test(link));
    expect(mandateRows).toEqual([
      { domain: "intelligence", link: "/administration/intelligence/mandates" },
    ]);
  });

  it("keeps every original mandate page declared and highlighting the new home", () => {
    for (const path of [
      "/administration/mandates",
      "/administration/mandates/new",
      "/administration/mandates/advanced",
      "/administration/mandates/references",
      "/administration/mandates/list-preview",
      "/administration/mandates/record-preview/some.key",
    ]) {
      expect(findAdminNavigationLocation(path)?.domain.slug).toBe("mandates");
      expect(adminMenuPathname(path)).toBe("/administration/intelligence/mandates");
    }
    for (const path of [
      "/administration/intelligence/mandates/dashboard",
      "/administration/intelligence/mandates/some.key",
      "/administration/intelligence/mandates/some.key/overrides",
    ]) {
      expect(findAdminNavigationLocation(path)?.destination.link).toBe(
        "/administration/intelligence/mandates",
      );
    }
  });

  it("never lists mandates under the Agents domain", () => {
    const agents = adminNavigationRegistry.find((domain) => domain.slug === "agents");
    const links = agents?.sections.flatMap((section) =>
      section.destinations.flatMap((item) => [item.link, ...item.ownedRoutes]),
    );
    expect(links?.filter((link) => /mandate/.test(link)) ?? []).toEqual([]);
  });
});
