/**
 * A doc's run request id survives a same-tab refresh (sessionStorage), is
 * replaced by a newer run, is cleared only for the run it names, and expires.
 */
import {
  clearPdfRunRequest,
  readPdfRunRequest,
  savePdfRunRequest,
} from "../runRequests";

const DOC = "8a1f0c2e-6b7d-4e5f-9a0b-1c2d3e4f5a6b";

beforeEach(() => window.sessionStorage.clear());

it("keeps the latest run per doc and survives a re-read", () => {
  savePdfRunRequest(DOC, "req-upload", "upload", 1_000);
  savePdfRunRequest(DOC, "req-clean", "clean", 2_000);
  expect(readPdfRunRequest(DOC, 3_000)).toEqual({
    requestId: "req-clean",
    kind: "clean",
    at: 2_000,
  });
});

it("clears only the run it names", () => {
  savePdfRunRequest(DOC, "req-new", "clean");
  clearPdfRunRequest(DOC, "req-old");
  expect(readPdfRunRequest(DOC)?.requestId).toBe("req-new");
  clearPdfRunRequest(DOC, "req-new");
  expect(readPdfRunRequest(DOC)).toBeNull();
});

it("expires after a day and ignores a missing id", () => {
  savePdfRunRequest(DOC, "req", "clean", 0);
  expect(readPdfRunRequest(DOC, 25 * 60 * 60_000)).toBeNull();
  savePdfRunRequest(DOC, null, "clean");
  expect(readPdfRunRequest(DOC)).toBeNull();
});

it("tolerates garbage in storage", () => {
  window.sessionStorage.setItem("pdf-extractor:runs", "{not json");
  expect(readPdfRunRequest(DOC)).toBeNull();
});
