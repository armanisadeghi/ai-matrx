import { surfaceFromPathname } from "./route-to-surface";

const B = "e9906c5e-e21a-4194-8ad3-ad0c1eaca5ad";
const S = "8cc4ba7b-2817-47f4-aef6-8b6b2028dd7d";
const P = "02648d08-93bd-4c2e-b5cf-54c9c7828475";
const SITE = `/marketing/brands/${B}/sites/${S}`;

describe("surfaceFromPathname — marketing tree", () => {
  it("resolves hub-level routes to the marketing hub surface", () => {
    expect(surfaceFromPathname("/marketing")).toBe("matrx-user/marketing");
    expect(surfaceFromPathname("/marketing/brands")).toBe(
      "matrx-user/marketing",
    );
    expect(surfaceFromPathname("/marketing/sites")).toBe(
      "matrx-user/marketing",
    );
    expect(surfaceFromPathname("/marketing/sites/new")).toBe(
      "matrx-user/marketing",
    );
    expect(surfaceFromPathname("/marketing/connections/google")).toBe(
      "matrx-user/marketing",
    );
    expect(surfaceFromPathname("/marketing/cost")).toBe(
      "matrx-user/marketing",
    );
  });

  it("resolves the brand cockpit", () => {
    expect(surfaceFromPathname(`/marketing/brands/${B}`)).toBe(
      "matrx-user/marketing-brand",
    );
  });

  it("resolves the site root and folded verticals to marketing-site", () => {
    expect(surfaceFromPathname(SITE)).toBe("matrx-user/marketing-site");
    for (const folded of ["access", "settings", "cost"]) {
      expect(surfaceFromPathname(`${SITE}/${folded}`)).toBe(
        "matrx-user/marketing-site",
      );
    }
  });

  it("resolves each site vertical to its own surface", () => {
    const cases: Array<[string, string]> = [
      ["pages", "matrx-user/marketing-site-pages"],
      ["crawls", "matrx-user/marketing-crawls"],
      ["crawls/new", "matrx-user/marketing-crawls"],
      ["audit", "matrx-user/marketing-audit"],
      ["analysis", "matrx-user/marketing-analysis"],
      ["findings", "matrx-user/marketing-findings"],
      ["links", "matrx-user/marketing-links"],
      ["backlinks", "matrx-user/marketing-backlinks"],
      ["coverage", "matrx-user/marketing-coverage"],
      ["sitemaps", "matrx-user/marketing-sitemaps"],
      [`sitemaps/${P}`, "matrx-user/marketing-sitemaps"],
      ["discovery", "matrx-user/marketing-discovery"],
      ["integrations", "matrx-user/marketing-integrations"],
    ];
    for (const [tail, surface] of cases) {
      expect(surfaceFromPathname(`${SITE}/${tail}`)).toBe(surface);
    }
  });

  it("resolves page detail (and its snapshots subtree) to marketing-page", () => {
    expect(surfaceFromPathname(`${SITE}/pages/${P}`)).toBe(
      "matrx-user/marketing-page",
    );
    expect(surfaceFromPathname(`${SITE}/pages/${P}/snapshots`)).toBe(
      "matrx-user/marketing-page",
    );
    expect(surfaceFromPathname(`${SITE}/pages/${P}/snapshots/${B}`)).toBe(
      "matrx-user/marketing-page",
    );
  });

  it("resolves crawl detail (and its subtree) to marketing-crawl", () => {
    expect(surfaceFromPathname(`${SITE}/crawls/${P}`)).toBe(
      "matrx-user/marketing-crawl",
    );
    for (const tail of ["urls", "logs", "snapshots", "links", "reports", "reports/page-titles"]) {
      expect(surfaceFromPathname(`${SITE}/crawls/${P}/${tail}`)).toBe(
        "matrx-user/marketing-crawl",
      );
    }
  });

  it("resolves cross-site batches", () => {
    expect(surfaceFromPathname("/marketing/batches")).toBe(
      "matrx-user/marketing-batches",
    );
    expect(surfaceFromPathname(`/marketing/batches/${P}`)).toBe(
      "matrx-user/marketing-batches",
    );
  });

  it("legacy flat site shims fall back to the hub (they client-redirect)", () => {
    expect(surfaceFromPathname(`/marketing/sites/${S}`)).toBe(
      "matrx-user/marketing",
    );
    expect(surfaceFromPathname(`/marketing/sites/${S}/pages/${P}`)).toBe(
      "matrx-user/marketing",
    );
  });

  it("does not affect non-marketing routes", () => {
    expect(surfaceFromPathname("/notes")).toBe("matrx-user/notes");
    expect(surfaceFromPathname("/agents/run")).toBe("matrx-user/agent-run");
  });
});

describe("CMS surface resolution (nested [siteId])", () => {
  const SITE = "11111111-2222-3333-4444-555555555555";
  const PAGE = "66666666-7777-8888-9999-000000000000";

  it("hub and html-pages keep their own surfaces", () => {
    expect(surfaceFromPathname("/cms")).toBe("matrx-user/cms");
    expect(surfaceFromPathname("/cms/html-pages")).toBe("matrx-user/html-page");
    expect(surfaceFromPathname(`/cms/html-pages/${PAGE}`)).toBe(
      "matrx-user/html-page",
    );
    expect(surfaceFromPathname("/cms/admin")).toBe("matrx-user/cms");
  });

  it("site workspace and its configuring tabs resolve to cms-site", () => {
    expect(surfaceFromPathname(`/cms/${SITE}`)).toBe("matrx-user/cms-site");
    expect(surfaceFromPathname(`/cms/${SITE}/pages`)).toBe(
      "matrx-user/cms-site",
    );
    expect(surfaceFromPathname(`/cms/${SITE}/collections`)).toBe(
      "matrx-user/cms-site",
    );
    expect(surfaceFromPathname(`/cms/${SITE}/settings`)).toBe(
      "matrx-user/cms-site",
    );
  });

  it("page and component editors get their own surfaces", () => {
    expect(surfaceFromPathname(`/cms/${SITE}/pages/${PAGE}`)).toBe(
      "matrx-user/cms-page",
    );
    expect(surfaceFromPathname(`/cms/${SITE}/pages/new`)).toBe(
      "matrx-user/cms-page",
    );
    expect(surfaceFromPathname(`/cms/${SITE}/components`)).toBe(
      "matrx-user/cms-component",
    );
  });
});

describe("Agent surface resolution (nested [id])", () => {
  const A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("per-agent sub-routes resolve to their own surfaces", () => {
    expect(surfaceFromPathname(`/agents/${A}/build`)).toBe(
      "matrx-user/agent-builder",
    );
    expect(surfaceFromPathname(`/agents/${A}/run`)).toBe(
      "matrx-user/agent-run",
    );
    expect(surfaceFromPathname(`/agents/${A}/shortcuts`)).toBe(
      "matrx-user/agent-shortcuts",
    );
    expect(surfaceFromPathname(`/agents/${A}/apps`)).toBe(
      "matrx-user/agent-apps",
    );
  });

  it("hub routes and unmapped sub-routes stay on the agents hub", () => {
    expect(surfaceFromPathname("/agents")).toBe("matrx-user/agents");
    expect(surfaceFromPathname("/agents/all")).toBe("matrx-user/agents");
    expect(surfaceFromPathname("/agents/new")).toBe("matrx-user/agents");
    expect(surfaceFromPathname("/agents/battle")).toBe("matrx-user/agents");
    expect(surfaceFromPathname(`/agents/${A}`)).toBe("matrx-user/agents");
    expect(surfaceFromPathname(`/agents/${A}/surfaces`)).toBe(
      "matrx-user/agents",
    );
  });

  it("legacy flat prefixes still resolve", () => {
    expect(surfaceFromPathname("/agents/run")).toBe("matrx-user/agent-run");
    expect(surfaceFromPathname("/agents/shortcuts")).toBe(
      "matrx-user/agent-shortcuts",
    );
  });
});

describe("Admin surface resolution (post catch-all removal)", () => {
  it("resolves registered admin families by specific prefix", () => {
    expect(surfaceFromPathname("/administration/agents/system-agents")).toBe(
      "matrx-admin/system-agents",
    );
    expect(
      surfaceFromPathname("/administration/agents/system-agents/agents/abc"),
    ).toBe("matrx-admin/system-agents");
    expect(surfaceFromPathname("/administration/agents/agent-apps/apps")).toBe(
      "matrx-admin/agent-apps",
    );
    expect(surfaceFromPathname("/administration/agents/mcp-tools")).toBe(
      "matrx-admin/tool-registry",
    );
    expect(surfaceFromPathname("/administration/chat/cx-dashboard/usage")).toBe(
      "matrx-admin/cx-dashboard",
    );
    expect(surfaceFromPathname("/administration/compute/server-logs/api")).toBe(
      "matrx-admin/server-logs",
    );
    expect(surfaceFromPathname("/administration/applications/catalogs")).toBe(
      "matrx-admin/applications",
    );
    expect(
      surfaceFromPathname("/administration/automation/scheduling/runs"),
    ).toBe("matrx-admin/scheduling");
    expect(
      surfaceFromPathname("/administration/ui/official-components"),
    ).toBe("matrx-admin/official-components");
  });

  it("users children win over the users hub", () => {
    expect(surfaceFromPathname("/administration/users/feedback")).toBe(
      "matrx-admin/feedback",
    );
    expect(surfaceFromPathname("/administration/users/email")).toBe(
      "matrx-admin/email",
    );
    expect(surfaceFromPathname("/administration/users/agent-review")).toBe(
      "matrx-admin/agent-review",
    );
    expect(surfaceFromPathname("/administration/users/admins")).toBe(
      "matrx-admin/users",
    );
    expect(surfaceFromPathname("/administration/users")).toBe(
      "matrx-admin/users",
    );
  });

  it("unmapped admin routes resolve to null, never to system-agents", () => {
    expect(surfaceFromPathname("/administration")).toBeNull();
    expect(surfaceFromPathname("/administration/utilities")).toBeNull();
    expect(surfaceFromPathname("/administration/documentation")).toBeNull();
    expect(surfaceFromPathname("/admin")).toBeNull();
  });
});
