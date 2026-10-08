/**
 * The frames a rejoined PDF run replays map onto the status line and live text
 * exactly as the original stream did — and another doc's progress is ignored.
 */
import { readPdfRunFrame } from "../usePdfDocRun";

const DOC = "8a1f0c2e-6b7d-4e5f-9a0b-1c2d3e4f5a6b";

it("maps progress, text and clean results", () => {
  expect(readPdfRunFrame({ event: "info", data: { user_message: "Cleaning page 3 of 40" } }, DOC)).toEqual({
    label: "Cleaning page 3 of 40",
  });
  expect(readPdfRunFrame({ event: "chunk", data: { text: "Incident " } }, DOC)).toEqual({
    appendText: "Incident ",
  });
  expect(
    readPdfRunFrame({ event: "data", data: { doc_id: DOC, clean_content: "# Incident Response" } }, DOC),
  ).toEqual({ text: "# Incident Response" });
  expect(
    readPdfRunFrame(
      { event: "data", data: { type: "pdf_page_extracted", page_number: 2, total_pages: 9 } },
      DOC,
    ),
  ).toEqual({ label: "Extracted page 2 of 9…" });
});

it("keeps only this doc's processing progress", () => {
  const progress = (id: string) => ({
    event: "data",
    data: { kind: "content.processing.progress", processed_document_id: id, stage: "clean", message: "page 4/40" },
  });
  expect(readPdfRunFrame(progress(DOC), DOC)).toEqual({ label: "clean: page 4/40" });
  expect(readPdfRunFrame(progress("other-doc"), DOC)).toBeNull();
  expect(readPdfRunFrame({ event: "heartbeat", data: {} }, DOC)).toBeNull();
});
