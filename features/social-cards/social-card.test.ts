import {
  SOCIAL_CARD_THEMES,
  buildSocialCardUrl,
  resolveSocialCardTheme,
  sanitizeSocialCardText,
} from "./social-card";

describe("social cards", () => {
  it("offers 24 curated visual treatments", () => {
    expect(SOCIAL_CARD_THEMES).toHaveLength(24);
    expect(new Set(SOCIAL_CARD_THEMES.map((theme) => theme.id)).size).toBe(24);
  });

  it("selects a stable theme and safely ignores an unknown requested theme", () => {
    expect(resolveSocialCardTheme("same-seed")).toEqual(
      resolveSocialCardTheme("same-seed"),
    );
    expect(resolveSocialCardTheme("seed", "not-a-theme")).toEqual(
      resolveSocialCardTheme("seed"),
    );
  });

  it("normalizes and caps public preview copy", () => {
    expect(sanitizeSocialCardText("  hello\n world  ", 20)).toBe("hello world");
    const url = buildSocialCardUrl({
      title: "T".repeat(200),
      description: "D".repeat(300),
      intent: "Action waiting",
    });
    const params = new URL(url, "https://www.aimatrx.com").searchParams;
    expect(params.get("title")).toHaveLength(96);
    expect(params.get("description")).toHaveLength(180);
  });
});
