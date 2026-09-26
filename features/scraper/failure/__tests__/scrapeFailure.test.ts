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
    // The two failure_reason values the backend added 2026-09-17. Before the
    // classifier learned them, `wrong_entity` fell through to "unknown" and
    // the person read "We could not read that page" for a page we DID read.
    [
      "empty_content",
      "https://example.com/a: empty_content",
      { firstResult: { success: false, failure_reason: "empty_content" }, expectKind: "empty" },
    ],
    [
      "wrong_entity",
      "https://example.com/a: wrong_entity",
      { firstResult: { success: false, failure_reason: "wrong_entity" }, expectKind: "wrong_page" },
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
      // The host is the person's own words ("georgekao.substack.com" is not the token "stack").
      const title = failure.title.replace(/georgekao\.substack\.com/g, "");
      for (const token of DEVELOPER_TOKENS) {
        expect(title).not.toContain(token);
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

// ── Seated walk #2 (11a): an unreachable host is named ─────────────────────
describe("an address we never reached names its host", () => {
  const unreachable = (firstResult: Record<string, unknown>) =>
    classifyScrapeFailure({
      error:
        "https://no-such-host-walk.invalid: request_error — failed at useScraperApi.scrapeUrl → validate_result_success (see errorDiagnostics)",
      diagnostics: diagnostics({
        requestedUrl: "https://no-such-host-walk.invalid",
        firstResult,
      }),
    });

  it("an older server (bare request_error, fake 500, resolver text in the details) still names the host", () => {
    const f = unreachable({
      success: false,
      failure_reason: "request_error",
      status_code: 500,
      failure_details: [{ error: "[Errno -2] Name or service not known" }],
    });
    expect(f.kind).toBe("bad_address");
    expect(f.title).toContain("no-such-host-walk.invalid");
    expect(f.title).not.toMatch(/500/);
  });

  it("the server's own sentence is shown as written", () => {
    const sentence =
      "We could not reach no-such-host-walk.invalid: that address does not exist (its name did not resolve), so nothing was read and nothing was saved. Check the web address for a typo; if it is right, the site may be offline — try again later.";
    const f = unreachable({
      success: false,
      failure_reason: "request_error",
      status_code: 0,
      failure_message: sentence,
    });
    expect(f.title).toBe(sentence);
  });

  it("any failure we cannot classify still says which host", () => {
    const f = classifyScrapeFailure({
      error: "something odd",
      diagnostics: diagnostics({
        requestedUrl: "https://example.org/a",
        firstResult: { success: false },
      }),
    });
    expect(f.title).toContain("example.org");
  });
});
