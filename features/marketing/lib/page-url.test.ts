import { webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";
import {
  normalisePageUrl,
  pagePathOf,
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
