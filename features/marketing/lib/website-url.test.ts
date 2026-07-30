import {
  normalizeWebsiteUrl,
  normalizeWebsiteUrlValue,
  secureImageUrl,
} from "./website-url";

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

describe("secureImageUrl", () => {
  it("upgrades http to https so the image is not mixed-content blocked", () => {
    expect(secureImageUrl("http://example.com/logo.png?v=1")).toBe(
      "https://example.com/logo.png?v=1",
    );
  });

  it("leaves https and other values untouched", () => {
    expect(secureImageUrl("https://example.com/logo.png")).toBe(
      "https://example.com/logo.png",
    );
    expect(secureImageUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    expect(secureImageUrl(null)).toBeNull();
  });
});
