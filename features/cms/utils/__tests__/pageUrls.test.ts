/**
 * C4 drift guard (master plan §5). This TS twin tests against the SAME
 * `url-rules.json` fixture as aidream's `test_cms_urls.py`. If either side's URL
 * logic drifts from the fixture, one of the two suites goes red.
 *
 * The fixture is the canonical copy committed at
 * `aidream/aidream/services/cms/url-rules.json` — keep this copy byte-identical
 * (re-copy on any change; the two suites must load the same rules).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fixture from "./url-rules.json";
import { activeSiteDomain, clientPageUrl, clientPageRoute, htmlPageUrl, clientSiteRootUrl, normalizeDomainInput } from "../pageUrls";

/**
 * SHA-256 of `url-rules.json`, pinned IDENTICALLY in both repos — aidream's
 * `aidream/services/cms/tests/test_cms_urls.py` holds the same constant. The two
 * copies are supposed to be byte-identical, but nothing MECHANICALLY enforced
 * that: editing one side alone left two silently different guards, which is the
 * same defect class as the `parent_route` divergence itself (CMS 0029). Now a
 * one-sided edit reddens the suite in the repo that was NOT updated.
 *
 * Changing the fixture is a FOUR-file change, deliberately:
 *   1. edit `aidream/aidream/services/cms/url-rules.json` (the CANONICAL copy)
 *   2. copy it verbatim here   3. update this constant
 *   4. update `_FIXTURE_SHA256` in `test_cms_urls.py`
 * Never "fix" a red here by loosening the check — re-sync the copies.
 */
const FIXTURE_SHA256 = "a596e978b936eb977d3a5595dd99204ed1997e59b37671d7e64b84c80d52f25a";

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

interface DerivationCase {
  name: string;
  input: { slug: string; category?: string | null; parent_route?: string | null };
  expect: string;
}

describe("C4 URL contract — fixture parity", () => {
  it("fixture is byte-identical to aidream's canonical copy", () => {
    const actual = createHash("sha256")
      .update(readFileSync(join(__dirname, "url-rules.json")))
      .digest("hex");
    expect(actual).toBe(FIXTURE_SHA256);
  });

  it("base_url matches the fixture", () => {
    // The TS twin's non-domain host is the fixture base_url.
    expect(fixture.base_url).toBe("https://mymatrx.com");
  });

  // Every case runs — no skips, no quarantine. If this count drops, a case
  // stopped executing and the guard silently shrank. That is not hypothetical:
  // before CMS migration 0029 the fixture had ZERO `parent_route` cases, so all
  // three implementations disagreed on parent handling and nothing went red.
  it("runs every fixture case", () => {
    expect(fixture.route_derivation_cases).toHaveLength(30);
    expect(fixture.client_page_cases).toHaveLength(19);
    expect(fixture.html_page_cases).toHaveLength(1);
    const parented = fixture.client_page_cases.filter(
      (c) => "parent_route" in (c as ClientCase).input,
    );
    expect(parented).toHaveLength(6);
  });

  // The PURE derivation — the twin of `public._client_page_route_of`. aidream's
  // pytest suite runs these exact cases from this exact file, AND checks them
  // against the live SQL function, so SQL/Python/TS are pinned to one answer.
  it.each(fixture.route_derivation_cases as DerivationCase[])(
    "derivation case: $name",
    ({ input, expect: want }) => {
      expect(
        clientPageRoute({
          slug: input.slug,
          category: input.category,
          parentRoute: input.parent_route,
        }),
      ).toBe(want);
    },
  );

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
 * Every derivation rule — parent nesting and whitespace-only category included —
 * now lives in `url-rules.json` and runs above as `route_derivation_cases`.
 * The hand-written copies that used to sit here were DELETED with CMS migration
 * 0029: a local copy of a cross-repo rule is a second authority that drifts in
 * silence, which is the exact defect 0029 fixed. Add new rules to the fixture.
 */

describe("normalizeDomainInput", () => {
  it("strips scheme, path, port, trailing dot and lowercases", () => {
    expect(normalizeDomainInput("  HTTPS://WWW.Example.com:8443/path/x  ")).toBe("www.example.com");
    expect(normalizeDomainInput("Example.COM.")).toBe("example.com");
    expect(normalizeDomainInput("")).toBe("");
    expect(normalizeDomainInput("   ")).toBe("");
    expect(normalizeDomainInput("www.clientsite.com")).toBe("www.clientsite.com");
  });
});

describe("custom-domain traffic activation", () => {
  it("preserves legacy live domains but suppresses pending or stale verification", () => {
    expect(activeSiteDomain({ domain: "x.com", settings: {} })).toBe("x.com");
    expect(activeSiteDomain({ domain: "x.com", settings: { domain_traffic: { mode: "platform" } } })).toBeUndefined();
    expect(activeSiteDomain({ domain: "x.com", settings: { domain_traffic: { mode: "custom", verified_domain: "old.com" } } })).toBeUndefined();
    expect(activeSiteDomain({ domain: "x.com", settings: { domain_traffic: { mode: "custom", verified_domain: "x.com" } } })).toBe("x.com");
  });
});
