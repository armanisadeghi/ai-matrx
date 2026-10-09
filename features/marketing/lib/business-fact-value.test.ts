import { businessFactValueText } from "@/features/marketing/lib/business-fact-value";

describe("businessFactValueText — the Overview reads a fact, never raw JSON", () => {
  it("formats a wrapped schema.org PostalAddress as one readable line", () => {
    const value = {
      address: {
        "@type": "PostalAddress",
        streetAddress: "1 Main St",
        addressLocality: "Springfield",
        addressRegion: "IL",
        postalCode: "62701",
        addressCountry: "US",
      },
    };
    expect(businessFactValueText(value)).toBe(
      "1 Main St, Springfield, IL 62701, US",
    );
  });

  it("formats a flat address and skips the parts that are absent", () => {
    expect(
      businessFactValueText({
        "@type": "PostalAddress",
        addressLocality: "Austin",
        addressRegion: "TX",
      }),
    ).toBe("Austin, TX");
  });

  it("reads a nested country name rather than its object", () => {
    expect(
      businessFactValueText({
        "@type": "PostalAddress",
        streetAddress: "5 Elm Rd",
        addressCountry: { "@type": "Country", name: "Canada" },
      }),
    ).toBe("5 Elm Rd, Canada");
  });

  it("keeps the existing url / text / value reads", () => {
    expect(businessFactValueText({ url: "https://example.com" })).toBe(
      "https://example.com",
    );
    expect(businessFactValueText({ text: "Open daily" })).toBe("Open daily");
    expect(businessFactValueText("plain string")).toBe("plain string");
  });

  it("names other structured values as key: value, not JSON", () => {
    expect(
      businessFactValueText({ "@type": "OpeningHours", opens: "09:00", closes: "17:00" }),
    ).toBe("opens: 09:00; closes: 17:00");
  });

  it("falls back to JSON only when nothing can be named", () => {
    expect(businessFactValueText({ "@type": "Thing" })).toBe('{"@type":"Thing"}');
  });

  it("returns an empty string for null and undefined", () => {
    expect(businessFactValueText(null)).toBe("");
    expect(businessFactValueText(undefined)).toBe("");
  });
});
