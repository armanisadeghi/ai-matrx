import { competitorDetailModel, rowsToSearch, untrackedLinks } from "./competitor-detail";
import type { BrandCompetitor, CompetitorAccount } from "./brand-competitors";

const account = (over: Partial<CompetitorAccount> = {}): CompetitorAccount => ({
  trackedAccountId: "t1", profileId: "p1", platform: "instagram", handle: "acme", displayName: null,
  profileUrl: "https://instagram.com/acme", followers: 12_400, status: "active", trackingStatus: "active",
  lastRefreshedAt: null, postsTracked: 42, topOutlier: { score: 6.25, postUrl: "https://i/p", views: 90_000 }, ...over,
});
const row = (over: Partial<BrandCompetitor> = {}): BrandCompetitor => ({
  key: "seo:faed67bf-0000", name: "Acme Shredding", domain: "acme.com", seoCompetitorId: "faed67bf-0000",
  siteId: "s1", websiteTracking: "candidate", accounts: [], ...over,
});

describe("competitorDetailModel", () => {
  it("maps a website-only competitor with no key, JSON or account leakage", () => {
    const m = competitorDetailModel(row(), "data-destruction");
    expect(m.name).toBe("Acme Shredding");
    expect(m.website).toEqual({ label: "acme.com", href: "https://acme.com" });
    expect(m.accounts).toEqual([]);
    expect(m.canFindSocials).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/seo:|faed67bf/);
  });
  it("maps accounts with stats, routes and the best outlier first", () => {
    const m = competitorDetailModel(
      row({ accounts: [account(), account({ trackedAccountId: "t2", platform: "tiktok", handle: "acme", topOutlier: { score: 9, postUrl: null, views: null } })] }),
      "data-destruction",
    );
    expect(m.accounts[0]).toMatchObject({ platformLabel: "Instagram", handle: "@acme", followers: "12.4K", posts: "42", outlier: "6.3×" });
    expect(m.accounts[0].href).toBe("/marketing/data-destruction/socials/instagram/p1");
    expect(m.outliers.map((o) => o.platformLabel)).toEqual(["TikTok", "Instagram"]);
    expect(m.outliers[1].views).toBe("90K");
  });
  it("a social-only competitor cannot search a website", () => {
    expect(competitorDetailModel(row({ domain: null }), "x").canFindSocials).toBe(false);
  });
});

describe("find / track rules", () => {
  it("skips found links for platforms already tracked", () => {
    const links = [{ platform: "instagram", url: "https://instagram.com/acme" }, { platform: "tiktok", url: "https://tiktok.com/@acme" }] as const;
    expect(untrackedLinks(row({ accounts: [account()] }), links).map((l) => l.platform)).toEqual(["tiktok"]);
  });
  it("bulk search takes only website rows with no socials that were not already searched", () => {
    const rows = [row(), row({ key: "b", domain: null }), row({ key: "c", accounts: [account()] }), row({ key: "d" })];
    expect(rowsToSearch(rows, new Set(["d"])).map((r) => r.key)).toEqual(["seo:faed67bf-0000"]);
  });
});
