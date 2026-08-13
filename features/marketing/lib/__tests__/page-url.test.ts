/**
 * The TypeScript half of the CROSS-REPO IDENTITY GUARD.
 *
 * `url-identity-rules.json` beside this file is a byte-identical copy of
 * aidream's `packages/matrx-scraper/matrx_scraper/utils/url-identity-rules.json`.
 * Both suites run the SAME cases against their own implementation and both pin
 * the fixture's SHA-256, so editing the rules on one side reddens the OTHER
 * repo. That is what makes this a contract instead of a hand-maintained twin
 * (growth-loop gap `G-CMS-IDENTITY`).
 *
 * Changing the rules is a FOUR-file change: edit the canonical fixture in
 * aidream, copy it here verbatim, update `_FIXTURE_SHA256` in
 * `packages/matrx-scraper/tests/test_url_identity_rules.py`, update
 * `FIXTURE_SHA256` below. Never "fix" a red by loosening the check.
 *
 * `pnpm check:url-identity` compares the two copies directly when an aidream
 * checkout sits beside this one — the guard that catches a one-sided edit
 * before either test suite runs.
 */
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TextEncoder as NodeTextEncoder } from "node:util";
import {
  normalizeIdentityUrl,
  normalisePageUrl,
  pagePathOf,
  pageRouteKey,
  pageRouteMatchKey,
  pageUrlHash,
} from "@/features/marketing/lib/page-url";

// jsdom ships neither TextEncoder nor SubtleCrypto; the browser has both.
beforeAll(() => {
  if (typeof globalThis.TextEncoder === "undefined") {
    Object.assign(globalThis, { TextEncoder: NodeTextEncoder });
  }
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  }
});

describe("normalisePageUrl (must match the scraper's _normalise_url)", () => {
  it("lowercases scheme and host", () => {
    expect(normalisePageUrl("HTTPS://Example.COM/About")).toBe(
      "https://example.com/About",
    );
  });
  it("defaults to https when no scheme is typed", () => {
    expect(normalisePageUrl("example.com/pricing")).toBe(
      "https://example.com/pricing",
    );
  });
  it("drops fragments and keeps query strings", () => {
    expect(normalisePageUrl("https://example.com/a?b=1#top")).toBe(
      "https://example.com/a?b=1",
    );
  });
  it("strips trailing slashes except on the root", () => {
    expect(normalisePageUrl("https://example.com/blog/")).toBe(
      "https://example.com/blog",
    );
    expect(normalisePageUrl("https://example.com/")).toBe(
      "https://example.com/",
    );
  });
  it("rejects non-HTTP schemes and garbage", () => {
    expect(() => normalisePageUrl("ftp://example.com/x")).toThrow();
    expect(() => normalisePageUrl("   ")).toThrow();
  });
});

describe("pageUrlHash", () => {
  it("produces the scraper's sha256 hex digest", async () => {
    // hashlib.sha256("https://example.com/".encode()).hexdigest()
    expect(await pageUrlHash("https://example.com/")).toBe(
      "0f115db062b7c0dd030b16878c99dea5c354b49dc37b38eb8846179c7783e9d7",
    );
  });
});

describe("pagePathOf", () => {
  it("returns the path, '/' for the root", () => {
    expect(pagePathOf("https://example.com/")).toBe("/");
    expect(pagePathOf("https://example.com/a/b")).toBe("/a/b");
  });
});

// ─── Cross-repo identity guard ──────────────────────────────────────────────

const FIXTURE_PATH = path.join(__dirname, "url-identity-rules.json");

// SHA-256 of url-identity-rules.json, pinned IDENTICALLY in aidream's
// packages/matrx-scraper/tests/test_url_identity_rules.py. See the file header.
const FIXTURE_SHA256 =
  "08eec55b9db0313d34bb056dff113fd1b6ceb9111cc69f9c8f7f67dcbcaa082e";

interface IdentityCase {
  name: string;
  input: string;
  expect: string;
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<
  string,
  IdentityCase[] | string
>;

const casesOf = (key: string): [string, string, string][] => {
  const cases = fixture[key];
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error(`url-identity-rules.json has no cases for "${key}"`);
  }
  return cases.map((entry) => [entry.name, entry.input, entry.expect]);
};

describe("cross-repo identity guard", () => {
  it("runs the same fixture bytes as the Python twin", () => {
    const digest = createHash("sha256")
      .update(readFileSync(FIXTURE_PATH))
      .digest("hex");
    expect(digest).toBe(FIXTURE_SHA256);
  });

  it.each(casesOf("normalize_url_cases"))(
    "normalizeIdentityUrl: %s",
    (_name, raw, expected) => {
      expect(normalizeIdentityUrl(raw)).toBe(expected);
    },
  );

  it.each(casesOf("url_hash_cases"))(
    "pageUrlHash: %s",
    async (_name, raw, expected) => {
      expect(await pageUrlHash(normalizeIdentityUrl(raw))).toBe(expected);
    },
  );

  it.each(casesOf("page_route_key_cases"))(
    "pageRouteKey: %s",
    (_name, raw, expected) => {
      expect(pageRouteKey(raw)).toBe(expected);
    },
  );

  it.each(casesOf("page_route_match_key_cases"))(
    "pageRouteMatchKey: %s",
    (_name, raw, expected) => {
      expect(pageRouteMatchKey(raw)).toBe(expected);
    },
  );

  it("pageRouteKey is idempotent", () => {
    // A normalizer that does not recognise its own output is how a route gets
    // re-wrapped and a page loses its measurement history.
    for (const [, raw] of casesOf("page_route_key_cases")) {
      const once = pageRouteKey(raw);
      expect(pageRouteKey(once)).toBe(once);
    }
  });

  it("the digest is derived from normalizeIdentityUrl, never a second normalizer", async () => {
    for (const [, raw] of casesOf("normalize_url_cases")) {
      const viaHelper = await pageUrlHash(normalizeIdentityUrl(raw));
      const direct = createHash("sha256")
        .update(normalizeIdentityUrl(raw), "utf8")
        .digest("hex");
      expect(viaHelper).toBe(direct);
    }
  });
});
