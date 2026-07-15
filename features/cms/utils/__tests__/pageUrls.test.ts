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
import { clientPageUrl, htmlPageUrl, clientSiteRootUrl, normalizeDomainInput } from "../pageUrls";

interface ClientCase {
  name: string;
  input: { site_slug: string; slug: string; category: string | null; is_home_page: boolean; domain?: string | null };
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

  it("every client_page case matches", () => {
    for (const c of fixture.client_page_cases as ClientCase[]) {
      const { site_slug, slug, category, is_home_page, domain } = c.input;

      const live = clientPageUrl({ siteSlug: site_slug, slug, category, domain });
      expect(live).toBe(c.expect.live_url);

      const preview = clientPageUrl({ siteSlug: site_slug, slug, category, domain, preview: true });
      expect(preview).toBe(c.expect.preview_url);

      if (c.expect.root_url !== null) {
        expect(clientSiteRootUrl(site_slug, false, domain)).toBe(c.expect.root_url);
      }
    }
  });

  it("every html_page case matches", () => {
    for (const c of fixture.html_page_cases as HtmlCase[]) {
      expect(htmlPageUrl(c.input.page_id)).toBe(c.expect.url);
    }
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
