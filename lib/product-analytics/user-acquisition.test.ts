import {
  classifyAcquisitionTraffic,
  describeAcquisitionClient,
  isLocalAcquisitionHost,
  isRetryableAcquisitionTransportFailure,
  safeObservedUrl,
} from "./user-acquisition";

describe("user acquisition telemetry", () => {
  /**
   * THE REAL POPULATION, not invented strings. Every agent below was read off
   * `users.guest_executions` on the main database over the 3 hours to
   * 2026-09-20 16:00Z, ranked by how many acquisition rows it had created. The
   * server-side first-touch capture runs inside the proxy, so each of these
   * rows is also a service-role RPC issued from a Node Lambda — which is why
   * "it is only an analytics row" is the wrong way to read this list.
   */
  test.each([
    ["SentryUptimeBot/1.0 (+http://docs.sentry.io/product/alerts/uptime)", 165],
    ["curl/8.7.1", 73],
    ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", 72],
    ["node", 20],
    ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", 10],
  ])("classifies %s as a bot (it made %i rows in 3h)", (userAgent) => {
    expect(classifyAcquisitionTraffic(userAgent)).toBe("bot");
  });

  test.each([
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  ])("still calls a real browser a browser: %s", (userAgent) => {
    // The script-client patterns must not catch a person. `java` and `got` are
    // the risky ones — they are short and common-looking — so a word boundary,
    // not a substring, is what the pattern is allowed to use.
    expect(classifyAcquisitionTraffic(userAgent)).toBe("browser");
  });

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

  test("marks localhost referrers as local or agent testing", () => {
    expect(
      classifyAcquisitionTraffic(
        "Mozilla/5.0 Chrome/149.0.0.0",
        "http://localhost:3000/administration",
      ),
    ).toBe("local_test");
    expect(classifyAcquisitionTraffic(null, "http://127.0.0.1:3000/")).toBe(
      "local_test",
    );
    expect(
      classifyAcquisitionTraffic(
        "Mozilla/5.0 Chrome/149.0.0.0",
        null,
        "localhost:3000",
      ),
    ).toBe("local_test");
    expect(isLocalAcquisitionHost("[::1]:3000")).toBe(true);
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

  test.each(["Load failed", "Failed to fetch", "Network request failed"])(
    "classifies browser transport rejection %s for retry without claiming persistence loss",
    (message) => {
      expect(
        isRetryableAcquisitionTransportFailure(new TypeError(message)),
      ).toBe(true);
    },
  );

  test("keeps implementation exceptions out of transport recovery", () => {
    expect(
      isRetryableAcquisitionTransportFailure(
        new TypeError("Cannot read properties of undefined"),
      ),
    ).toBe(false);
  });
});
