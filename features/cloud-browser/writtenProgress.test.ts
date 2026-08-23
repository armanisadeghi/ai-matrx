/**
 * The DEFAULT face's live refresh — D-8 tier 1.
 *
 * Written on 2026-08-23 with the aidream producer half. The panel used to call
 * `loadSnapshot()` once on mount and never again: no interval, no channel, and
 * `appendProgress` was a reducer nothing dispatched. This locks down the three
 * pieces that make the default face live and keep it cheap.
 */

import reducer, { appendProgress } from "./redux/cloudBrowserSlice";
import type { ProgressEvent } from "./types";

function step(sequence: number, action = "click"): ProgressEvent {
  return {
    id: `evt-${sequence}`,
    runId: "run-1",
    sequence,
    occurredAt: "2026-08-23T18:00:00.000Z",
    actor: "agent",
    action,
    resultClass: "ok",
    summary: `Clicked \`#b${sequence}\``,
    origin: "https://example.com",
  };
}

describe("appendProgress — ONE dispatch per page of steps", () => {
  const empty = reducer(undefined, { type: "@@INIT" });

  it("appends a whole batch in a single dispatch", () => {
    const next = reducer(empty, appendProgress([step(1), step(2), step(3)]));
    expect(next.progress.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it("de-dups by sequence so a re-read can never double a step", () => {
    const first = reducer(empty, appendProgress([step(1), step(2)]));
    const second = reducer(first, appendProgress([step(2), step(3)]));
    expect(second.progress.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it("keeps the timeline ordered even when a batch arrives out of order", () => {
    const next = reducer(empty, appendProgress([step(5), step(2), step(9)]));
    expect(next.progress.map((e) => e.sequence)).toEqual([2, 5, 9]);
  });

  it("is a no-op when the batch is entirely already-seen (a quiet browser)", () => {
    const first = reducer(empty, appendProgress([step(1)]));
    const second = reducer(first, appendProgress([step(1)]));
    expect(second.progress).toBe(first.progress);
  });
});

describe("the written-progress cadence is a code constant, not an env toggle", () => {
  it("is defined in constants.ts and short enough to read as live", async () => {
    const { WRITTEN_PROGRESS_POLL_MS } = await import("./constants");
    expect(typeof WRITTEN_PROGRESS_POLL_MS).toBe("number");
    expect(WRITTEN_PROGRESS_POLL_MS).toBeGreaterThan(0);
    expect(WRITTEN_PROGRESS_POLL_MS).toBeLessThanOrEqual(5_000);
  });
});
