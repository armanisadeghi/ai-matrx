// features/crm/outreach-start/__tests__/normalize-domain-key.test.ts
//
// `normalizeDomainKey` is the TS twin of aidream's
// `crm.canonicalize.normalize_domain`. Divergence is invisible in types and
// shows up as a FALSE REFUSAL on the "Start outreach" door — the surface
// reports "could not be turned into an organization" about a party the server
// just created. These cases mirror the Python rules line for line.

import { normalizeDomainKey } from "../service";

describe("normalizeDomainKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeDomainKey("  Example.COM ")).toBe("example.com");
  });

  it("strips the scheme", () => {
    expect(normalizeDomainKey("https://example.com")).toBe("example.com");
    expect(normalizeDomainKey("http://example.com")).toBe("example.com");
  });

  it("strips a leading www. — the exact case that produced a false refusal", () => {
    expect(normalizeDomainKey("www.andysowards.com")).toBe("andysowards.com");
    expect(normalizeDomainKey("https://www.andysowards.com/post?x=1")).toBe(
      "andysowards.com",
    );
  });

  it("keeps other subdomains, which really are different hosts", () => {
    expect(normalizeDomainKey("blog.example.com")).toBe("blog.example.com");
  });

  it("drops path, query and fragment", () => {
    expect(normalizeDomainKey("example.com/a/b?c=d#e")).toBe("example.com");
  });

  it("treats a fully-qualified trailing dot as the same host", () => {
    expect(normalizeDomainKey("example.com.")).toBe("example.com");
  });

  it("is idempotent — a normalized value survives a second pass", () => {
    const once = normalizeDomainKey("HTTPS://WWW.Example.com/path/");
    expect(normalizeDomainKey(once)).toBe(once);
    expect(once).toBe("example.com");
  });
});
