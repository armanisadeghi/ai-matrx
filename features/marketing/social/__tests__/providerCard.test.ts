import { coverageOf, formatSpend } from "../components/SocialProviderCard";

describe("coverageOf", () => {
  const platforms = {
    tiktok: { scrapecreators: ["post", "profile"], apify: "not configured: no key" },
    instagram: { scrapecreators: ["post"] },
    youtube: { scrapecreators: [], apify: ["post"] },
  };
  it("lists the platforms a provider has at least one capability on", () => {
    expect(coverageOf(platforms, "scrapecreators")).toEqual(["instagram", "tiktok"]);
  });
  it("a provider that is not configured covers nothing", () => {
    expect(coverageOf(platforms, "apify")).toEqual(["youtube"]);
    expect(coverageOf(platforms, "unknown")).toEqual([]);
  });
});

const pts = (usd: number) => `${Math.ceil(usd * 20_000).toLocaleString("en-US")} points`;

describe("formatSpend", () => {
  const org = { usd: 0.02256, calls: 12 };
  it("shows the organization figure, and the platform total only when the server sent it", () => {
    expect(formatSpend({ provider: "scrapecreators", month_start: "2026-10-01", organization: org, platform: null }, null, pts)).toBe("452 points · 12 calls");
    expect(
      formatSpend({ provider: "scrapecreators", month_start: "2026-10-01", organization: org, platform: { usd: 0.07144, calls: 38 } }, null, pts),
    ).toBe("452 points · 12 calls (organization) · 1,429 points · 38 calls (platform)");
  });
  it("a missing figure says so, never zero", () => {
    expect(formatSpend(null, "boom", pts)).toBe("Spend unavailable");
    expect(formatSpend(null, null, pts)).toBe("Not reported");
  });
});
