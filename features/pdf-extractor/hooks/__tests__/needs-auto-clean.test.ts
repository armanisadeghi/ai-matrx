import {
  needsAutoClean,
  markAutoCleanHandled,
  resetAutoCleanHandled,
} from "../useAutoCleanOnOpen";
import type { PdfDocument } from "../usePdfExtractor";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const OLD = "2026-10-06T11:00:00Z";

const doc = (over: Partial<PdfDocument> = {}): PdfDocument =>
  ({
    id: "d1",
    name: "report.pdf",
    content: "raw text",
    cleanContent: null,
    createdAt: OLD,
    updatedAt: OLD,
    mimeType: "application/pdf",
    totalPages: 48,
    ...over,
  }) as PdfDocument;

const ok = { busy: false, pagesSettled: true, pagesHaveCleanText: false, now: NOW };

beforeEach(() => resetAutoCleanHandled());

describe("needsAutoClean", () => {
  it("runs for an old PDF with raw text and no clean text", () => {
    expect(needsAutoClean(doc(), ok)).toBe(true);
  });
  it("skips a non-PDF source", () => {
    expect(needsAutoClean(doc({ mimeType: "text/plain", name: "a.txt" }), ok)).toBe(false);
  });
  it("accepts a PDF by extension when mime is missing", () => {
    expect(needsAutoClean(doc({ mimeType: null }), ok)).toBe(true);
    expect(needsAutoClean(doc({ mimeType: null, name: "a.docx" }), ok)).toBe(false);
  });
  it("skips docs over 200 pages (paid per-page path), allows exactly 200", () => {
    expect(needsAutoClean(doc({ totalPages: 201 }), ok)).toBe(false);
    expect(needsAutoClean(doc({ totalPages: 200 }), ok)).toBe(true);
  });
  it("falls back to the loaded page count", () => {
    expect(needsAutoClean(doc({ totalPages: null }), { ...ok, pageCount: 500 })).toBe(false);
  });
  it("skips when any page has a section_kind", () => {
    expect(needsAutoClean(doc(), { ...ok, pagesHaveSectionKind: true })).toBe(false);
  });
  it("skips a doc touched under 3 minutes ago (server run may be in flight)", () => {
    const recent = new Date(NOW - 2 * 60_000).toISOString();
    expect(needsAutoClean(doc({ updatedAt: recent }), ok)).toBe(false);
    const older = new Date(NOW - 4 * 60_000).toISOString();
    expect(needsAutoClean(doc({ updatedAt: older }), ok)).toBe(true);
  });
  it("skips when busy, unsettled, already cleaned, handled, or has clean content", () => {
    expect(needsAutoClean(doc(), { ...ok, busy: true })).toBe(false);
    expect(needsAutoClean(doc(), { ...ok, pagesSettled: false })).toBe(false);
    expect(needsAutoClean(doc(), { ...ok, pagesHaveCleanText: true })).toBe(false);
    expect(needsAutoClean(doc({ cleanContent: "x" }), ok)).toBe(false);
    expect(needsAutoClean(doc({ content: "  " }), ok)).toBe(false);
    markAutoCleanHandled("d1");
    expect(needsAutoClean(doc(), ok)).toBe(false);
  });
});
