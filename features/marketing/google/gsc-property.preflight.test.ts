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
  preflightGscProperty,
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
