import {
  crawlOptionsFromSettings,
  invalidCrawlPatterns,
  parsePatternLines,
  settingsWithCrawlDefaults,
} from "@/features/marketing/crawler/crawl-defaults";
import { defaultCrawlOptions } from "@/features/marketing/crawler/direct-client";

describe("crawlOptionsFromSettings", () => {
  it("returns canonical defaults for missing/invalid settings", () => {
    expect(crawlOptionsFromSettings(null)).toEqual(defaultCrawlOptions);
    expect(crawlOptionsFromSettings({ crawl_defaults: "junk" })).toEqual(
      defaultCrawlOptions,
    );
  });

  it("round-trips the FULL contract, including advanced fields", () => {
    const stored = {
      crawl_defaults: {
        max_pages: 1200,
        max_depth: 4,
        concurrency: 3,
        follow_subdomains: true,
        respect_robots: true,
        seed_from_sitemap: false,
        include_patterns: ["^/blog/"],
        exclude_patterns: ["\\.pdf$"],
        politeness_delay_ms: 250,
        render_mode: "browser_with_screenshot",
        capture_screenshots: false,
        screenshot_kinds: ["viewport"],
        seed_urls: ["https://example.com/start"],
        list_mode: true,
        host_rps: 2,
        host_burst: 4,
      },
    };
    const options = crawlOptionsFromSettings(stored);
    expect(options).toEqual(stored.crawl_defaults);
    // And serializing back loses nothing.
    const next = settingsWithCrawlDefaults(stored, options);
    expect(next.crawl_defaults).toEqual(stored.crawl_defaults);
  });

  it("keeps browser_with_screenshot instead of downgrading it", () => {
    const options = crawlOptionsFromSettings({
      crawl_defaults: { render_mode: "browser_with_screenshot" },
    });
    expect(options.render_mode).toBe("browser_with_screenshot");
  });
});

describe("settingsWithCrawlDefaults", () => {
  it("preserves sibling settings keys and unknown crawl_defaults keys", () => {
    const settings = {
      other_system: { keep: true },
      crawl_defaults: { future_field: "keep-me", max_pages: 10 },
    };
    const next = settingsWithCrawlDefaults(settings, {
      ...defaultCrawlOptions,
      max_pages: 99,
    });
    expect(next.other_system).toEqual({ keep: true });
    expect(
      (next.crawl_defaults as Record<string, unknown>).future_field,
    ).toBe("keep-me");
    expect((next.crawl_defaults as Record<string, unknown>).max_pages).toBe(
      99,
    );
  });
});

describe("invalidCrawlPatterns", () => {
  it("accepts valid regexes and flags broken ones with the reason", () => {
    expect(
      invalidCrawlPatterns({
        include_patterns: ["^/blog/", "products/\\d+"],
        exclude_patterns: [],
      }),
    ).toEqual([]);
    const problems = invalidCrawlPatterns({
      include_patterns: ["([unclosed"],
      exclude_patterns: ["ok", "*bad"],
    });
    expect(problems).toHaveLength(2);
    expect(problems[0].field).toBe("include_patterns");
    expect(problems[1].field).toBe("exclude_patterns");
    expect(problems[1].pattern).toBe("*bad");
  });
});

describe("parsePatternLines", () => {
  it("splits lines, trims, and drops empties", () => {
    expect(parsePatternLines(" ^/a$ \n\n  \n^/b$")).toEqual(["^/a$", "^/b$"]);
  });
});
