import { inferDiscoveredPropertyType } from "@/features/marketing/lib/discovery-promotion";

describe("inferDiscoveredPropertyType", () => {
  it.each([
    ["https://www.instagram.com/acme", "instagram"],
    ["https://facebook.com/acme", "facebook"],
    ["https://twitter.com/acme", "x"],
    ["https://x.com/acme", "x"],
    ["https://www.tiktok.com/@acme", "tiktok"],
    ["https://youtube.com/@acme", "youtube"],
    ["https://youtu.be/video", "youtube"],
    ["https://linkedin.com/company/acme", "linkedin"],
    ["https://pin.it/example", "pinterest"],
  ] as const)("maps %s to %s", (url, expected) => {
    expect(
      inferDiscoveredPropertyType({ guessed_kind: "social_profile", url }),
    ).toBe(expected);
  });

  it("preserves a specific supported guess", () => {
    expect(
      inferDiscoveredPropertyType({
        guessed_kind: "google_business_profile",
        url: "https://maps.google.com/example",
      }),
    ).toBe("google_business_profile");
  });

  it("keeps an unknown network as Other so review can label it", () => {
    expect(
      inferDiscoveredPropertyType({
        guessed_kind: "social_profile",
        url: "https://community.example.com/acme",
      }),
    ).toBe("other");
  });
});
