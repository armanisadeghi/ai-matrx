/**
 * Lane F8 (Applet audit 2026-10-09): a finished run with no answer anywhere is named, never a blank "Done";
 * a run whose answer exists anywhere (stream, run text, kind) is never called empty.
 */
import type { JobRunView } from "@ai-matrx/applets";
import { finishedWithoutAnswer, retryOf } from "../run-answer";

const done = (over: Partial<JobRunView> = {}): JobRunView => ({ ref: null, status: "done", text: "", result: null, error: null, ...over });

describe("finishedWithoutAnswer", () => {
  it("names a done run with no text and no kind", () => {
    expect(finishedWithoutAnswer(done(), "")).toBe(true);
    expect(finishedWithoutAnswer(done(), "   ")).toBe(true);
  });
  it("never calls a run empty when its answer exists somewhere", () => {
    expect(finishedWithoutAnswer(done(), "Lisbon is the capital.")).toBe(false);
    expect(finishedWithoutAnswer(done({ text: "Lisbon" }), "")).toBe(false);
    expect(finishedWithoutAnswer(done({ result: { __kind: "x" } as JobRunView["result"] }), "")).toBe(false);
  });
  it("never calls a running run empty", () => {
    expect(finishedWithoutAnswer(done({ status: "running" }), "")).toBe(false);
  });
});

describe("retryOf", () => {
  it("hands back the run's retry when it carries one, nothing otherwise", () => {
    const retry = jest.fn();
    retryOf({ ...done(), retry } as JobRunView)?.();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retryOf(done())).toBeNull();
  });
});
