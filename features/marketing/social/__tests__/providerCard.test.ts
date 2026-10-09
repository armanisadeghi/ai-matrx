import { coverageOf } from "../components/SocialProviderCard";

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
