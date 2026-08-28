import { captureScraperError } from "@/features/scraper/diagnostics/captureScraperError";
import type { ScraperApiErrorDiagnostics } from "@/features/scraper/hooks/useScraperApi";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

describe("captureScraperError", () => {
  beforeEach(() => {
    clearCapturedErrors();
    window.history.replaceState({}, "", "/scraper");
  });

  it("captures a failed scrape row from a successful NDJSON response", () => {
    const diagnostics: ScraperApiErrorDiagnostics = {
      hook: "useScraperApi",
      operation: "scrapeUrl",
      stage: "validate_result_success",
      message: "https://matrix.ai/: proxy_error",
      at: "2026-08-28T00:00:00.000Z",
      received: {
        requestedUrl: "https://matrix.ai/",
        endpoint: "/api/scraper/quick-scrape",
        streamEventLog: [],
        resultsCount: 1,
        results: [],
        envelopeMetadata: {},
        firstResult: {
          success: false,
          failure_reason: "proxy_error",
          failure_details: [{ message: "proxy pool exhausted" }],
          url: "https://matrix.ai/",
        },
        http: { status: 200, statusText: "OK", headers: {} },
      },
    };

    captureScraperError(new Error(diagnostics.message), diagnostics);

    expect(getSnapshot()[0]).toMatchObject({
      source: "scraper",
      tier: "red",
      relation: "POST /api/scraper/quick-scrape",
      code: "proxy_error",
      status: 200,
      message: "https://matrix.ai/: proxy_error",
      route: "/scraper",
    });
  });

  it("does not duplicate HTTP failures already captured by python-client", () => {
    const diagnostics: ScraperApiErrorDiagnostics = {
      hook: "useScraperApi",
      operation: "scrapeUrl",
      stage: "api.post",
      message: "HTTP 503",
      at: "2026-08-28T00:00:00.000Z",
      received: {
        endpoint: "/api/scraper/quick-scrape",
        streamEventLog: [],
        resultsCount: 0,
        results: [],
        envelopeMetadata: {},
        firstResult: null,
      },
    };

    captureScraperError(new Error(diagnostics.message), diagnostics);

    expect(getSnapshot()).toEqual([]);
  });
});
