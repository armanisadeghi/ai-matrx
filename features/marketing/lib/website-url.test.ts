import { normalizeWebsiteUrl, normalizeWebsiteUrlValue } from "./website-url";

describe("normalizeWebsiteUrl", () => {
  it("adds HTTPS to a bare domain", () => {
    expect(normalizeWebsiteUrlValue("allgreenrecycling.com")).toBe(
      "https://allgreenrecycling.com/",
    );
  });

  it("preserves an explicitly entered HTTP scheme", () => {
    expect(normalizeWebsiteUrlValue("http://example.com/services")).toBe(
      "http://example.com/",
    );
  });

  it("turns a pasted page URL into the website root", () => {
    expect(
      normalizeWebsiteUrlValue(
        "HTTPS://Example.COM/services/recycling?location=west#hours",
      ),
    ).toBe("https://example.com/");
  });

  it("accepts common subdomains and trims whitespace", () => {
    expect(normalizeWebsiteUrlValue("  www.example.com  ")).toBe(
      "https://www.example.com/",
    );
  });

  it("removes fragments because they do not identify a different site", () => {
    expect(normalizeWebsiteUrlValue("example.com/#about")).toBe(
      "https://example.com/",
    );
  });

  it.each(["", "example", "not a website", "ftp://example.com"])(
    "rejects %p",
    (value) => {
      expect(() => normalizeWebsiteUrl(value)).toThrow();
    },
  );
});
