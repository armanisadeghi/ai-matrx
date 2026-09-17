/*
  THE PRE-FLIGHT, proven against the four silent mismatches it exists to catch.

  Every case here is a real Search Console shape: binding
  `https://example.com/` to a site that lives at `https://www.example.com/`
  returns HTTP 200 with zero rows forever, and until this pre-flight existed
  nothing in the product said so — the dashboard showed "connected" and an empty
  chart. Each assertion names the verdict AND that the message carries both
  sides, because a refusal that does not name the site and the property is not a
  fix, it is a scolding badge.
*/

import {
  gscDomainPropertyRef,
  judgeGscBindingWrite,
  preflightGscProperty,
  shouldStartGscFirstImport,
  siteCanonicalUrl,
} from "@/features/marketing/google/gsc-property";

const wwwSite = { root_url: "https://www.example.com", domain: "example.com" };
const bareSite = { root_url: "https://example.com/", domain: "example.com" };
const subSite = { root_url: "https://blog.example.com/", domain: "blog.example.com" };

describe("siteCanonicalUrl", () => {
  it("prefers root_url and falls back to the domain when it cannot parse", () => {
    expect(siteCanonicalUrl(wwwSite).host).toBe("www.example.com");
    expect(siteCanonicalUrl({ root_url: "not a url", domain: "Example.com" }).display).toBe(
      "https://example.com/",
    );
  });
});

describe("preflightGscProperty", () => {
  it("accepts the site's own domain property without nudging toward a URL version", () => {
    const result = preflightGscProperty("sc-domain:example.com", wwwSite);
    expect(result.verdict).toBe("ok");
    // THE DOMAIN-PROPERTY RULE: never suggest a URL version when the domain
    // property covers the site.
    expect(result.detail).not.toContain("https://www.example.com/");
  });

  it("accepts a matching URL-prefix property", () => {
    expect(preflightGscProperty("https://www.example.com/", wwwSite).verdict).toBe("ok");
  });

  it("refuses a www/non-www swap by name, with the fix", () => {
    const result = preflightGscProperty("https://example.com/", wwwSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.headline).toContain("https://www.example.com/");
    expect(result.headline).toContain("https://example.com/");
    expect(result.suggestedRef).toBe("sc-domain:example.com");
  });

  it("refuses a scheme swap by name", () => {
    const result = preflightGscProperty("http://www.example.com/", wwwSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.detail).toContain("sc-domain:example.com");
  });

  it("refuses a URL prefix whose path excludes the site", () => {
    const result = preflightGscProperty("https://example.com/shop/", bareSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.headline).toContain("/shop/");
  });

  it("refuses another domain's domain property, naming both domains", () => {
    const result = preflightGscProperty("sc-domain:other.com", wwwSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.headline).toContain("other.com");
    expect(result.headline).toContain("https://www.example.com/");
  });

  it("refuses a property that is not a property at all", () => {
    expect(preflightGscProperty("example.com", wwwSite).verdict).toBe("mismatch");
  });

  it("warns, but allows, a parent domain property bound to one subdomain", () => {
    const result = preflightGscProperty("sc-domain:example.com", subSite);
    expect(result.verdict).toBe("advisory");
    expect(result.detail).toContain("blog.example.com");
  });

  it("refuses an empty pick instead of letting a blank binding save", () => {
    expect(preflightGscProperty("", wwwSite).verdict).toBe("mismatch");
  });
});

/*
  THE LIVE MISMATCH, as a fixture. Read from the platform database on
  2026-09-17: site `d7c4aeb1-a920-4fa0-b118-00ffed913c22`
  ("AI Matrx OAuth QA GA4 00fb6a62a3", domain `ga4-oauth-qa-00fb6a62a3.invalid`,
  root_url `https://ga4-oauth-qa-00fb6a62a3.invalid`) carries an ENABLED Search
  Console binding to the property `http://bhrcenter.com/`. Nothing was changed
  in the database; the row is copied here so the refusal is proven against the
  pair that actually got through.
*/
const LIVE_MISMATCHED_SITE = {
  root_url: "https://ga4-oauth-qa-00fb6a62a3.invalid",
  domain: "ga4-oauth-qa-00fb6a62a3.invalid",
};
const LIVE_MISMATCHED_PROPERTY = "http://bhrcenter.com/";

describe("THE CONNECT-TIME REFUSAL (the live mismatched pair)", () => {
  it("refuses the binding that is live today, naming both sides", () => {
    const judgement = judgeGscBindingWrite(
      { resourceRef: LIVE_MISMATCHED_PROPERTY },
      LIVE_MISMATCHED_SITE,
    );
    expect(judgement.allowed).toBe(false);
    expect(judgement.sentence).toContain("ga4-oauth-qa-00fb6a62a3.invalid");
    expect(judgement.sentence).toContain("bhrcenter.com");
  });

  it("refuses it while the binding is still DISABLED — the first Enable is the moment that matters", () => {
    // Before the fix every guard read `enabled`, so the draft a person is
    // about to switch on was judged by nothing at all.
    expect(
      judgeGscBindingWrite(
        { resourceRef: LIVE_MISMATCHED_PROPERTY },
        LIVE_MISMATCHED_SITE,
      ).allowed,
    ).toBe(false);
  });

  it("says nothing about a binding with no property picked — that is the validator's job", () => {
    const judgement = judgeGscBindingWrite({ resourceRef: "" }, LIVE_MISMATCHED_SITE);
    expect(judgement.allowed).toBe(true);
    expect(judgement.refusal).toBeNull();
  });

  it("allows a correct property", () => {
    expect(
      judgeGscBindingWrite({ resourceRef: "sc-domain:example.com" }, wwwSite).allowed,
    ).toBe(true);
  });
});

describe("THE BACKFILL GATE", () => {
  const goodBinding = {
    enabled: true,
    credentialRef: "31b75c97-3710-4c2f-9834-dd6da29ca8b6",
    resourceRef: "sc-domain:example.com",
  };

  it("never starts the ~16-month import on a refused binding", () => {
    expect(
      shouldStartGscFirstImport(
        { ...goodBinding, resourceRef: LIVE_MISMATCHED_PROPERTY },
        LIVE_MISMATCHED_SITE,
        { alreadySynced: false },
      ),
    ).toBe(false);
  });

  it("starts it for a complete, matching, never-synced binding", () => {
    expect(
      shouldStartGscFirstImport(goodBinding, wwwSite, { alreadySynced: false }),
    ).toBe(true);
  });

  it("does not restart it for a site that already synced", () => {
    expect(
      shouldStartGscFirstImport(goodBinding, wwwSite, { alreadySynced: true }),
    ).toBe(false);
  });

  it("does not start it for an incomplete binding", () => {
    expect(
      shouldStartGscFirstImport(
        { ...goodBinding, credentialRef: "" },
        wwwSite,
        { alreadySynced: false },
      ),
    ).toBe(false);
  });
});

/*
  THE SILENT ACCEPTS (found by an adversarial 18-case probe, 2026-09-17). A
  port, a trailing-dot host and an uppercase ref all sailed through as `ok`,
  and the uppercase one was echoed back as the ref to bind — a ref Google's
  API rejects outright.
*/
describe("preflightGscProperty — shapes that used to be accepted silently", () => {
  it("refuses a port, naming it", () => {
    const result = preflightGscProperty("https://example.com:8443/", bareSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.headline).toContain("port");
    expect(result.detail).toContain("8443");
  });

  it("refuses a trailing-dot host, naming the dot", () => {
    const result = preflightGscProperty("https://example.com./", bareSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.headline).toContain("trailing dot");
  });

  it("normalizes an uppercase domain ref and never recommends the uppercase one", () => {
    const result = preflightGscProperty("SC-DOMAIN:EXAMPLE.COM", wwwSite);
    expect(result.suggestedRef).toBe("sc-domain:example.com");
    expect(result.detail).toContain("lowercase");
    expect(result.headline).not.toContain("SC-DOMAIN:EXAMPLE.COM");
  });

  it("leaves a correctly cased domain ref's wording alone", () => {
    const result = preflightGscProperty("sc-domain:example.com", wwwSite);
    expect(result.verdict).toBe("ok");
    expect(result.detail).not.toContain("lowercase");
  });

  it("still accepts the standard https port written explicitly", () => {
    // `new URL` drops :443 for https — the property is the same one.
    expect(preflightGscProperty("https://example.com:443/", bareSite).verdict).toBe("ok");
  });

  it("refuses a foreign host carrying a port, by host not by port", () => {
    const result = preflightGscProperty("https://other.com:8443/", bareSite);
    expect(result.verdict).toBe("mismatch");
  });
});

/*
  ROUND-2 VERDICT (google-native VERIFY-U-P4-U-M1-R2, NEW-B1 / NEW-B2). The
  ancestry asymmetry the uppercase sweep left behind: `bareDomain()` stripped
  `www.` from BOTH sides, so `sc-domain:www.example.com` compared equal to
  `example.com` and a sixteen-month backfill was allowed to start against a
  property that will never hold one row for that site. A Search Console domain
  property covers its domain and its SUBdomains — never its parent. And the
  domain-ref branch was never given the URL branch's FQDN-dot normalization, so
  `sc-domain:example.com.` passed AND was echoed back as the ref to bind.
*/
describe("preflightGscProperty — a domain property covers subdomains, never its parent", () => {
  it("refuses sc-domain:www.example.com on a non-www site, by name, with the right property", () => {
    const result = preflightGscProperty("sc-domain:www.example.com", bareSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.headline).toContain("sc-domain:www.example.com");
    expect(result.headline).toContain("https://example.com/");
    expect(result.suggestedRef).toBe("sc-domain:example.com");
  });

  it("never lets that binding start the sixteen-month backfill", () => {
    const binding = {
      enabled: true,
      credentialRef: "conn-1",
      resourceRef: "sc-domain:www.example.com",
    };
    expect(judgeGscBindingWrite(binding, bareSite).allowed).toBe(false);
    expect(
      shouldStartGscFirstImport(binding, bareSite, { alreadySynced: false }),
    ).toBe(false);
  });

  it("still accepts the registrable domain property for a www site", () => {
    expect(preflightGscProperty("sc-domain:example.com", wwwSite).verdict).toBe("ok");
  });

  it("accepts the www domain property for a site that really lives at www", () => {
    expect(preflightGscProperty("sc-domain:www.example.com", wwwSite).verdict).toBe("ok");
  });

  it("refuses a sibling subdomain's domain property", () => {
    const result = preflightGscProperty("sc-domain:shop.example.com", subSite);
    expect(result.verdict).toBe("mismatch");
    expect(result.suggestedRef).toBe("sc-domain:blog.example.com");
  });

  it("normalizes a trailing-dot domain ref and never recommends the dotted one", () => {
    const result = preflightGscProperty("sc-domain:example.com.", bareSite);
    expect(result.suggestedRef).toBe("sc-domain:example.com");
    expect(result.detail).toContain("trailing dot");
    expect(result.headline).not.toContain("example.com.");
  });

  it("uses ONE normalizer for both branches: the canonical ref never carries a dot", () => {
    expect(gscDomainPropertyRef("Example.com.")).toBe("sc-domain:example.com");
    expect(preflightGscProperty("sc-domain:OTHER.COM.", bareSite).suggestedRef).toBe(
      "sc-domain:example.com",
    );
  });
});
