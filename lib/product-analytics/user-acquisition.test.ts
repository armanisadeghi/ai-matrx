import {
  classifyAcquisitionTraffic,
  describeAcquisitionClient,
  safeObservedUrl,
} from "./user-acquisition";

describe("user acquisition telemetry", () => {
  test("separates crawlers from ordinary browsers", () => {
    expect(
      classifyAcquisitionTraffic(
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      ),
    ).toBe("bot");
    expect(
      classifyAcquisitionTraffic(
        "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
      ),
    ).toBe("browser");
  });

  test("describes the client without exposing the raw agent as the label", () => {
    expect(
      describeAcquisitionClient(
        "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome 149.0.0.0 · macOS");
  });

  test("drops query strings and fragments from referrers", () => {
    expect(
      safeObservedUrl("https://example.com/landing?token=secret#private"),
    ).toBe("https://example.com/landing");
  });
});
