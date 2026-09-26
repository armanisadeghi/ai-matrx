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
  // Arman, 2026-09-26: the Mandates page manages SYSTEM mandates only; the
  // tech-support lookup over tenants' mandates is its own, separate entry.
  it("puts Mandates under Intelligence: one management entry, one support entry", () => {
    const menuLinks = adminMenuDomains.flatMap((domain) =>
      domain.sections.flatMap((section) =>
        section.destinations.map((item) => ({ domain: domain.slug, link: item.link })),
      ),
    );
    const mandateRows = menuLinks.filter(({ link }) => /mandates/.test(link));
    expect(mandateRows).toEqual([
      { domain: "intelligence", link: "/administration/intelligence/mandates" },
      { domain: "intelligence", link: "/administration/intelligence/mandates/support" },
    ]);
  });

  it("highlights the support lookup — never the management entry — on its pages", () => {
    for (const path of [
      "/administration/intelligence/mandates/support",
      "/administration/intelligence/mandates/support/2f0c7d3e-0000-4000-8000-000000000000",
    ]) {
      expect(findAdminNavigationLocation(path)?.destination.link).toBe(
        "/administration/intelligence/mandates/support",
      );
    }
    expect(findAdminNavigationLocation("/administration/agents/support")?.destination.link).toBe(
      "/administration/agents/support",
    );
  });

  it("keeps every original mandate page declared and highlighting the new home", () => {
    for (const path of [
      "/administration/mandates",
      "/administration/mandates/new",
      "/administration/mandates/advanced",
      "/administration/mandates/references",
      "/administration/mandates/some.key",
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

  // Lane SCOPE-ADMIN-INDEX: the per-organization scope console
  // (/administration/scopes-context/organizations/[orgId], lane SCOPE-ADMIN-2) was reachable
  // only by typing the URL — a dead end. The Scopes & Context landing now links its index.
  it("lists the scopes-context organizations index and owns its [orgId] console", () => {
    const scopesContext = adminNavigationRegistry.find((domain) => domain.slug === "scopes-context");
    const links = scopesContext?.sections.flatMap((section) => section.destinations) ?? [];
    const organizationsIndex = links.find(
      (item) => item.link === "/administration/scopes-context/organizations",
    );
    expect(organizationsIndex).toBeDefined();
    expect(organizationsIndex?.ownedRoutes).toContain(
      "/administration/scopes-context/organizations/[orgId]",
    );
    expect(findAdminNavigationLocation("/administration/scopes-context/organizations/some-org-id")?.destination.link).toBe(
      "/administration/scopes-context/organizations",
    );
  });
});
