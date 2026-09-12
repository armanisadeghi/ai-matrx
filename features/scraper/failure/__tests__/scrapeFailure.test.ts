/**
 * THE AUDIENCE LAW FOR SCRAPE FAILURES (W44, 2026-09-12).
 *
 * SUT: `classifyScrapeFailure`. It owns turning whatever `useScraperApi` is
 * holding after a failure into plain words plus a remedy, with the engineer
 * string kept separately for support.
 *
 * Real here: the classifier and the exact strings the live hook produced on
 * 2026-09-12 for https://georgekao.substack.com/p/how-to-write-without-sounding-like.
 * Nothing is mocked — the input IS the engineer string the person was shown.
 */

import {
  classifyScrapeFailure,
  type ScrapeFailureKind,
} from "@/features/scraper/failure/scrapeFailure";
import type { ScraperApiErrorDiagnostics } from "@/features/scraper/hooks/useScraperApi";

/** Tokens that belong to engineers. None may appear in a user-facing string. */
const DEVELOPER_TOKENS = [
  "useScraperApi",
  "validate_result_success",
  "errorDiagnostics",
  "bad_status",
  "consumeScrapeStream",
  "api.post",
  "at Object.",
  "stack",
  "Error:",
  "→",
];

function diagnostics(
  overrides: Partial<ScraperApiErrorDiagnostics["received"]> = {},
): ScraperApiErrorDiagnostics {
  return {
    hook: "useScraperApi",
    operation: "scrapeUrl",
    stage: "validate_result_success",
    message: "https://georgekao.substack.com/p/x: bad_status",
    stack:
      "Error: bad_status\n    at assertRawScrapeRowSucceeded (useScraperApi.ts:236:11)",
    at: "2026-09-12T00:00:00.000Z",
    received: {
      requestedUrl: "https://georgekao.substack.com/p/x",
      endpoint: "/scraper/quick-scrape",
      streamEventLog: [],
      resultsCount: 1,
      results: [],
      envelopeMetadata: {},
      firstResult: { success: false, failure_reason: "bad_status", status_code: 403 },
      ...overrides,
    },
  };
}

const LIVE_ERROR_STRING =
  "https://georgekao.substack.com/p/how-to-write-without-sounding-like: bad_status" +
  " — failed at useScraperApi.scrapeUrl → validate_result_success (see errorDiagnostics)";

describe("classifyScrapeFailure", () => {
  it("gives the Substack bad_status failure plain words, a remedy and the status", () => {
    const failure = classifyScrapeFailure({
      error: LIVE_ERROR_STRING,
      diagnostics: diagnostics(),
    });

    // 403 on a row the backend marked failed reads as a bot/paywall block.
    expect(failure.kind).toBe<ScrapeFailureKind>("blocked");
    expect(failure.httpStatus).toBe(403);
    expect(failure.remedy.toLowerCase()).toContain("paste");
    for (const token of DEVELOPER_TOKENS) {
      expect(failure.title).not.toContain(token);
      expect(failure.remedy).not.toContain(token);
    }
    // The engineer string is kept — loud, just not in the person's face.
    expect(failure.developerMessage).toContain("useScraperApi.scrapeUrl");
    expect(failure.diagnostics).not.toBeNull();
  });

  it.each<[string, string, ScraperFailureCase]>([
    [
      "site_refused",
      "https://example.com/a: bad_status",
      { firstResult: { success: false, status_code: 500 }, expectKind: "site_refused" },
    ],
    [
      "timeout",
      "Scrape timed out after 30s",
      { firstResult: null, expectKind: "timeout" },
    ],
    [
      "empty",
      "No results returned from scraper",
      { firstResult: null, expectKind: "empty" },
    ],
    [
      "bad_address",
      "getaddrinfo ENOTFOUND nosuchdomain.example",
      { firstResult: null, expectKind: "bad_address" },
    ],
    [
      "unknown",
      "Something nobody has classified yet",
      { firstResult: null, expectKind: "unknown" },
    ],
  ])(
    "every failure kind the hook can return gets plain words and a remedy (%s)",
    (_name, message, cfg) => {
      const failure = classifyScrapeFailure({
        error: `${message} — failed at useScraperApi.scrapeUrl → validate_result_success (see errorDiagnostics)`,
        diagnostics: diagnostics({ firstResult: cfg.firstResult }),
      });
      expect(failure.kind).toBe(cfg.expectKind);
      expect(failure.title.length).toBeGreaterThan(10);
      expect(failure.remedy.length).toBeGreaterThan(10);
      for (const token of DEVELOPER_TOKENS) {
        expect(failure.title).not.toContain(token);
        expect(failure.remedy).not.toContain(token);
      }
    },
  );

  it("never leaks a stack trace into the words the person reads", () => {
    const failure = classifyScrapeFailure({
      error: new Error(
        "boom\n    at scrapeUrl (features/scraper/hooks/useScraperApi.ts:763:9)",
      ),
      diagnostics: diagnostics({ firstResult: null }),
    });
    expect(failure.title).not.toContain("useScraperApi.ts");
    expect(failure.remedy).not.toContain("at scrapeUrl");
  });
});

interface ScraperFailureCase {
  firstResult: Record<string, unknown> | null;
  expectKind: ScrapeFailureKind;
}
