jest.mock("@/features/rag/api/rag-jobs", () => ({ fetchFileRagStatus: jest.fn() }));

import { nextFileStep } from "./fileSource";

/**
 * A stored file on a Source card becomes its Source from the SERVER's state
 * (USI-3e). Before, the card learned its Source only from this tab's own
 * processing run: a reused copy (no run) was never kept, a reload (run gone)
 * stranded the card on "Still being read", and a text file the tab's run read
 * without making a Source stayed there forever.
 */
const idle = { started: false, localRunning: false };

describe("which step a file card takes", () => {
  it("keeps a reused copy's existing Source at once — no run started", () => {
    expect(
      nextFileStep({ state: "completed", processed_document_id: "doc-photosynthesis" }, idle),
    ).toEqual({ do: "keep", processedDocumentId: "doc-photosynthesis" });
  });

  it("re-attaches after a reload to the run the upload started — never a second run", () => {
    expect(nextFileStep({ state: "running", processed_document_id: null }, idle)).toEqual({
      do: "wait",
    });
  });

  it("waits on this tab's own run even before the server row shows it", () => {
    expect(
      nextFileStep({ state: "not_scheduled", processed_document_id: null }, { started: true, localRunning: true }),
    ).toEqual({ do: "wait" });
  });

  it("starts the one run for a file nothing is reading and that has no Source", () => {
    for (const state of ["not_scheduled", "scheduled", "cancelled", "completed"] as const)
      expect(nextFileStep({ state, processed_document_id: null }, idle)).toEqual({ do: "start" });
  });

  it("says a file cannot be read, in the server's words, instead of waiting forever", () => {
    const step = nextFileStep(
      { state: "failed", processed_document_id: null, error: { error_type: "X", message: "the file is password-protected" } },
      idle,
    );
    expect(step.do).toBe("unreadable");
    expect(step.do === "unreadable" && step.reason).toContain("password-protected");
  });

  it("stops after its one run ended without a Source", () => {
    expect(
      nextFileStep({ state: "completed", processed_document_id: null }, { started: true, localRunning: false }).do,
    ).toBe("unreadable");
  });
});
