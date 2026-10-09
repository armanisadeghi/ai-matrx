import {
  applyPostalAddressFields,
  businessFactValueText,
  postalAddressFields,
  withFactText,
} from "@/features/marketing/lib/business-fact-value";

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

describe("editing a structured fact keeps its shape", () => {
  const wrapped = {
    address: {
      "@type": "PostalAddress",
      streetAddress: "1 Main St",
      addressLocality: "Springfield",
      addressRegion: "IL",
      postalCode: "62701",
      addressCountry: { "@type": "Country", name: "US" },
      postOfficeBoxNumber: "PO 5",
    },
  };

  it("round-trips a wrapped address without changing its shape", () => {
    const edited = applyPostalAddressFields(wrapped, postalAddressFields(wrapped));
    expect(edited).toStrictEqual(wrapped);
  });

  it("round-trips a flat address without changing its shape", () => {
    const flat = {
      "@type": "PostalAddress",
      streetAddress: "1 Main St",
      addressLocality: "Springfield",
      addressCountry: "US",
    };
    expect(applyPostalAddressFields(flat, postalAddressFields(flat))).toStrictEqual(flat);
  });

  it("changes only the field that was edited and keeps the wrapper and hidden keys", () => {
    const fields = { ...postalAddressFields(wrapped), city: "Shelbyville" };
    expect(applyPostalAddressFields(wrapped, fields)).toStrictEqual({
      address: {
        ...wrapped.address,
        addressLocality: "Shelbyville",
      },
    });
  });

  it("removes a field cleared to empty rather than storing a blank", () => {
    const fields = { ...postalAddressFields(wrapped), region: "" };
    const edited = applyPostalAddressFields(wrapped, fields) as {
      address: Record<string, unknown>;
    };
    expect("addressRegion" in edited.address).toBe(false);
  });

  it("builds a PostalAddress from fields for a new address and never stores JSON text", () => {
    const built = applyPostalAddressFields(null, {
      street: "2 Oak Ave",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
    });
    expect(built).toStrictEqual({
      "@type": "PostalAddress",
      streetAddress: "2 Oak Ave",
      addressLocality: "Austin",
      addressRegion: "TX",
      postalCode: "78701",
      addressCountry: "US",
    });
    expect(typeof built).toBe("object");
  });

  it("keeps a legacy plain-string address by putting its text in the street", () => {
    expect(postalAddressFields("9 Elm Rd, Dayton").street).toBe("9 Elm Rd, Dayton");
  });

  it("edits the readable line of a structured non-address value and keeps the other keys", () => {
    const original = { "@type": "Organization", name: "Old Name", founder: "Jane" };
    expect(businessFactValueText(original)).toBe("Old Name");
    expect(withFactText(original, "New Name")).toStrictEqual({
      "@type": "Organization",
      name: "New Name",
      founder: "Jane",
    });
  });

  it("replaces the key the Overview reads first, which is url before name", () => {
    const original = { "@type": "Organization", name: "Old Name", url: "https://x.test" };
    expect(businessFactValueText(original)).toBe("https://x.test");
    expect(withFactText(original, "https://y.test")).toStrictEqual({
      "@type": "Organization",
      name: "Old Name",
      url: "https://y.test",
    });
  });

  it("returns plain text when the stored value is not a record", () => {
    expect(withFactText("old", "new")).toBe("new");
    expect(withFactText(null, "new")).toBe("new");
  });
});
