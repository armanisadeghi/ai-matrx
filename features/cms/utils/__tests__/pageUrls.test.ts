/**
 * C4 drift guard (master plan §5). This TS twin tests against the SAME
 * `url-rules.json` fixture as aidream's `test_cms_urls.py`. If either side's URL
 * logic drifts from the fixture, one of the two suites goes red.
 *
 * The fixture is the canonical copy committed at
 * `aidream/aidream/services/cms/url-rules.json` — keep this copy byte-identical
 * (re-copy on any change; the two suites must load the same rules).
 */
import fixture from "./url-rules.json";
import { clientPageUrl, clientPageRoute, htmlPageUrl, clientSiteRootUrl, normalizeDomainInput } from "../pageUrls";

interface ClientCase {
  name: string;
  input: {
    site_slug: string;
    slug: string;
    category: string | null;
    is_home_page: boolean;
    domain?: string | null;
    /**
     * `client_pages.route` (CMS migration 0028). When the fixture supplies it,
     * it is the saved trigger-computed path and wins over slug/category. When
     * it is absent, the builder must DERIVE the same path the DB would.
     */
    route?: string;
    parent_route?: string | null;
  };
  expect: { path: string; live_url: string; preview_url: string; root_url: string | null };
}

interface HtmlCase {
  name: string;
  input: { page_id: string };
  expect: { path: string; url: string };
}

describe("C4 URL contract — fixture parity", () => {
  it("base_url matches the fixture", () => {
    // The TS twin's non-domain host is the fixture base_url.
    expect(fixture.base_url).toBe("https://mymatrx.com");
  });

  // Every case runs — no skips, no quarantine. If this count drops, a case
  // stopped executing and the guard silently shrank.
  it("runs every fixture case", () => {
    expect(fixture.client_page_cases).toHaveLength(13);
    expect(fixture.html_page_cases).toHaveLength(1);
  });

  it("every client_page case matches", () => {
    let ran = 0;
    for (const c of fixture.client_page_cases as ClientCase[]) {
      const { site_slug, slug, category, domain, route, parent_route } = c.input;

      const live = clientPageUrl({ siteSlug: site_slug, slug, route, category, parentRoute: parent_route, domain });
      expect(live).toBe(c.expect.live_url);

      const preview = clientPageUrl({
        siteSlug: site_slug,
        slug,
        route,
        category,
        parentRoute: parent_route,
        domain,
        preview: true,
      });
      expect(preview).toBe(c.expect.preview_url);

      // Cases WITHOUT a saved `route` pin the derivation itself — the twin of
      // `public._client_page_route_of`. Cases WITH one deliberately carry a
      // path the derivation could not produce (that is the point of the column).
      if (route === undefined) {
        const derived = clientPageRoute({ slug, category, parentRoute: parent_route });
        expect(domain ? `https://${domain}${derived}` : `${fixture.base_url}/c/${site_slug}${derived}`)
          .toBe(c.expect.live_url);
      }

      if (c.expect.root_url !== null) {
        expect(clientSiteRootUrl(site_slug, false, domain)).toBe(c.expect.root_url);
      }
      ran++;
    }
    expect(ran).toBe(fixture.client_page_cases.length);
  });

  it("every html_page case matches", () => {
    for (const c of fixture.html_page_cases as HtmlCase[]) {
      expect(htmlPageUrl(c.input.page_id)).toBe(c.expect.url);
    }
  });
});

/**
 * The fixture pins every derivation rule EXCEPT parent nesting (no case carries
 * `parent_route`) and a whitespace-only category. Those two live here; do not
 * re-test anything the fixture already covers — that copy would drift silently.
 */
describe("clientPageRoute — rules the fixture does not reach", () => {
  it("nests under the parent route at arbitrary depth, ignoring category", () => {
    expect(clientPageRoute({ slug: "pricing", category: "general", parentRoute: "/locations/austin" }))
      .toBe("/locations/austin/pricing");
    expect(clientPageRoute({ slug: "enterprise", category: "plans", parentRoute: "/locations/austin/pricing" }))
      .toBe("/locations/austin/pricing/enterprise");
  });
  it("treats a whitespace-only category as no category", () => {
    expect(clientPageRoute({ slug: "landing", category: "  " })).toBe("/landing");
  });
});

describe("normalizeDomainInput", () => {
  it("strips scheme, path, port, trailing dot and lowercases", () => {
    expect(normalizeDomainInput("  HTTPS://WWW.Example.com:8443/path/x  ")).toBe("www.example.com");
    expect(normalizeDomainInput("Example.COM.")).toBe("example.com");
    expect(normalizeDomainInput("")).toBe("");
    expect(normalizeDomainInput("   ")).toBe("");
    expect(normalizeDomainInput("www.clientsite.com")).toBe("www.clientsite.com");
  });
});
