import {
  describeDiscoveredSocialProfile,
  inferDiscoveredPropertyType,
} from "@/features/marketing/lib/discovery-promotion";

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

  it.each([
    [
      "https://www.instagram.com/datadestruction/",
      "instagram",
      "@datadestruction",
      "Profile",
    ],
    [
      "https://www.linkedin.com/in/arman-sadeghi-8b176627/",
      "linkedin",
      "arman-sadeghi-8b176627",
      "Personal profile",
    ],
    [
      "https://www.linkedin.com/company/acme/",
      "linkedin",
      "acme",
      "Company page",
    ],
    [
      "https://www.youtube.com/channel/UCF4Ku_RBslqV3A36j6KddZQ",
      "youtube",
      "UCF4Ku_RBslqV3A36j6KddZQ",
      "Channel ID",
    ],
    ["https://twitter.com/armantitanium", "x", "@armantitanium", "Profile"],
  ] as const)(
    "describes %s as a verifiable %s identity",
    (url, expectedKind, expectedIdentity, expectedProfileType) => {
      expect(
        describeDiscoveredSocialProfile({
          guessed_kind: "social_profile",
          url,
        }),
      ).toMatchObject({
        kind: expectedKind,
        identity: expectedIdentity,
        profileType: expectedProfileType,
      });
    },
  );
});
