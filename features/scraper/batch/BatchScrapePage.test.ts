import type { BatchScrapeRow } from "@/features/scraper/hooks/useScraperApi";
import {
  applyBatchResult,
  batchCharacterCount,
  batchNotesFilterText,
  batchRungFilterText,
  batchSourceFilterText,
  estimatedWordCount,
  markMissingBatchResults,
  MISSING_BATCH_RESULT_MESSAGE,
  sameRequestedUrl,
  type BatchRow,
} from "./BatchScrapePage";

function pending(url: string): BatchRow {
  return {
    url,
    status: "pending",
    result: null,
    failureMessage: null,
    ladder: null,
    processedDocumentId: null,
    sourceNotices: [],
    kept: false,
  };
}

function terminal(url: string): BatchScrapeRow {
  return {
    url,
    success: true,
    result: null,
    failureMessage: null,
    processedDocumentId: null,
    sourceNotices: [],
  };
}

describe("BatchScrapePage result reconciliation", () => {
  it("settles a normalized root URL without conflating distinct paths", () => {
    expect(sameRequestedUrl("https://example.com", "https://example.com/")).toBe(true);
    expect(sameRequestedUrl("https://example.com/a", "https://example.com/b")).toBe(false);

    const rows = [pending("https://example.com"), pending("https://example.com/about")];
    const updated = applyBatchResult(rows, terminal("https://example.com/"));

    expect(updated[0]).toMatchObject({ url: "https://example.com", status: "success" });
    expect(updated[1]).toEqual(rows[1]);
  });

  it("turns an omitted terminal result into an explicit retryable failure", () => {
    const rows = [pending("https://example.com"), pending("https://example.com/about")];
    const completed = markMissingBatchResults(rows, ["https://example.com"]);

    expect(completed[0]).toMatchObject({ status: "failed", failureMessage: MISSING_BATCH_RESULT_MESSAGE });
    expect(completed[1]).toEqual(rows[1]);
  });

  it("exposes actual characters separately from an explicitly estimated word count and searchable domain text", () => {
    const successful: BatchRow = {
      ...pending("https://example.com"),
      status: "success",
      result: {
        url: "https://example.com",
        textContent: "",
        plainTextContent: "",
        overview: { char_count: 55 },
        structuredData: {},
        organizedData: {},
        links: {},
        images: [],
        mainImage: null,
        metadata: {},
        scrapedAt: "2026-09-28T00:00:00.000Z",
        engine: "http",
        escalated: false,
        escalationReason: null,
        escalationNote: null,
        contentWarning: "thin_content",
        contentChars: 55,
        proxyBypassed: true,
        ladder: null,
        processedDocumentId: null,
        sourceNotices: [],
      },
      processedDocumentId: "source-1",
      sourceNotices: [{ code: "landed", message: "Saved at intake", remedy: "" }],
      kept: true,
    };

    expect(batchCharacterCount(successful)).toBe(55);
    expect(estimatedWordCount(batchCharacterCount(successful))).toBe(10);
    expect(batchSourceFilterText(successful)).toBe("Open Saved source-1 Saved at intake");
    expect(batchNotesFilterText(successful)).toBe(
      "Direct fetch This page came back with very little readable text — it may not be the full content. A configured proxy was skipped for this page.",
    );
    expect(batchRungFilterText(pending("https://example.com"))).toBe("");
    expect(batchSourceFilterText(pending("https://example.com"))).toBe("");
  });
});
