import {
  classifyRecordUpdateStatus,
  pollForCleanContent,
  preferAggregateClean,
  shouldRefreshOnProcessingProgress,
} from "../cleanOutcome";

describe("classifyRecordUpdateStatus", () => {
  it("never reads a failed or queued record_update as success", () => {
    expect(classifyRecordUpdateStatus("failed")).toBe("failed");
    expect(classifyRecordUpdateStatus("awaiting_batch")).toBe("queued");
    expect(classifyRecordUpdateStatus("completed")).toBe("done");
    expect(classifyRecordUpdateStatus(undefined)).toBe("done");
    expect(classifyRecordUpdateStatus("active")).toBe("active");
    // The server's wire shape for a batch-parked clean (aidream pdf_pipeline).
    expect(
      classifyRecordUpdateStatus("active", { run_status: "awaiting_batch" }),
    ).toBe("queued");
    expect(classifyRecordUpdateStatus("completed", {})).toBe("done");
  });
});

describe("shouldRefreshOnProcessingProgress", () => {
  it("refreshes when the clean stage is done, always", () => {
    expect(
      shouldRefreshOnProcessingProgress({ stage: "clean", phase: "done" }, 1000, 1001),
    ).toBe(true);
  });
  it("throttles per-page clean refreshes", () => {
    const evt = { stage: "clean", phase: "page" };
    expect(shouldRefreshOnProcessingProgress(evt, 1000, 2000, 4000)).toBe(false);
    expect(shouldRefreshOnProcessingProgress(evt, 1000, 5000, 4000)).toBe(true);
  });
  it("ignores other stages and phases", () => {
    expect(shouldRefreshOnProcessingProgress({ stage: "embed", phase: "done" }, 0, 99999)).toBe(false);
    expect(shouldRefreshOnProcessingProgress({ stage: "clean", phase: "start" }, 0, 99999)).toBe(false);
  });
});

describe("pollForCleanContent", () => {
  const noSleep = async () => {};
  it("returns text that shows up on a later read", async () => {
    const read = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("cleaned");
    await expect(
      pollForCleanContent(read, { intervalMs: 1, timeoutMs: 10, sleep: noSleep }),
    ).resolves.toBe("cleaned");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("gives up with null after the bounded window", async () => {
    const read = jest.fn<Promise<string | null>, []>().mockResolvedValue(null);
    await expect(
      pollForCleanContent(read, { intervalMs: 1, timeoutMs: 3, sleep: noSleep }),
    ).resolves.toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
  });
});

describe("preferAggregateClean", () => {
  it("prefers the doc text when every page is empty", () => {
    expect(preferAggregateClean(["", " "], "text")).toBe(true);
  });
  it("prefers it when it is clearly fuller than the filled pages", () => {
    expect(preferAggregateClean(["short", ""], "a much longer aggregate clean text")).toBe(true);
  });
  it("keeps per-page view when blank pages are genuinely blank", () => {
    expect(preferAggregateClean(["page one text", ""], "page one text")).toBe(false);
    expect(preferAggregateClean(["a", "b"], "ab")).toBe(false);
  });
});
