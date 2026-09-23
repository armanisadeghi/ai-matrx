/**
 * A WORKING RUN NEVER LOOKS FROZEN — a forcing function.
 *
 * ## What it exists to stop happening again
 *
 * 2026-09-17, `common-docs/projects/acquisition-frontier/own-files/
 * VERIFICATION.md` §7: an independent verifier put one 558 KB public-domain
 * EPUB through the real ingest lane on production, watched the dialog, and
 * concluded the platform was broken. It was not. The run
 * (`platform.masterwork_run` 617856c6) completed in 8m11s with 85 draft rules
 * and 82 quotes verified word-for-word. Three things on that screen produced a
 * false negative from a competent reader:
 *
 *   1. "Working — this usually takes about 2 minutes" over an 8m11s run. The
 *      estimate was a per-LANE constant, so one small EPUB and a pile of
 *      nineteen files got the same sentence.
 *   2. 7,412 of a comparable run's 7,414 stream events were raw model tokens
 *      the dialog does not render. The typed per-resource events that DO
 *      arrive were flattened into a list of strings, so nothing on screen
 *      changed state for minutes.
 *   3. A run whose heartbeat could not reach the database showed a spinner.
 *      The server emits `masterwork_run_labouring` with its own sentence
 *      exactly so the screen can say what is happening instead.
 *
 * ## Three legs, each proven RED before the fix
 *
 *   1. no constant estimate — a bigger pile promises a longer wait;
 *   2. a run whose only events are model tokens still MOVES on screen;
 *   3. a late heartbeat shows the server's labouring sentence, not a spinner.
 *
 * The first two legs are driven through the REAL primitives the dialogs use
 * (`sizedEstimateMs` + the lane rates; `reduceIngestProgress` fed the real
 * event shapes `dump_ingest.py` and `ingest.py` emit), and the third renders
 * the REAL shared component every lane now routes through. Nothing here mocks
 * the thing under test.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { sizedEstimateMs } from "@/lib/progress/sizedEstimate";
import {
  DUMP_INGEST_RATE,
  SOURCE_INGEST_RATE,
} from "../durable-run/laneRates";
import {
  EMPTY_INGEST_PROGRESS,
  progressHeadline,
  reduceIngestProgress,
} from "../durable-run/ingestProgress";
import type { WorkSize } from "@/lib/progress/sizedEstimate";
import type { MasterworkRunSurface } from "../durable-run/useMasterworkRun";
import { expectedMsFor, rateForSurface } from "../durable-run/useMasterworkRun";
import { RunStages } from "../components/RunStages";

describe("leg 1 — the promise is measured from the run, never a constant", () => {
  /**
   * THE CLASS, not the instance. Every surface that declares a measured rate
   * is asked the same question through the SAME function its dialog calls:
   * does a bigger pile promise a longer wait? A lane that answers "no" has a
   * constant behind its sentence, which is the defect, whichever lane it is.
   */
  const SIZED_LANES: ReadonlyArray<[MasterworkRunSurface, WorkSize, WorkSize]> = [
    ["dump", { items: 1 }, { items: 19 }],
    ["corpus", { items: 2 }, { items: 40 }],
    ["chat", { items: 3 }, { items: 200 }],
    ["meeting", { items: 1 }, { items: 25 }],
    ["ingest", { bytes: 40 * 1024 }, { bytes: 558 * 1024 }],
    ["timeline", { words: 300 }, { words: 120_000 }],
    ["unfolding", { words: 300 }, { words: 120_000 }],
  ];

  it.each(SIZED_LANES)(
    "%s promises longer for the bigger pile",
    (surface, small, big) => {
      expect(rateForSurface(surface)).not.toBeNull();
      expect(expectedMsFor(surface, big)).toBeGreaterThan(
        expectedMsFor(surface, small),
      );
    },
  );

  it("prices a source in whichever unit its door actually counted", () => {
    // The paste box counts words, the upload counts bytes, the recorder counts
    // seconds — and each of the three has to move the promise on its own.
    expect(expectedMsFor("ingest", { words: 120_000 })).toBeGreaterThan(
      expectedMsFor("ingest", { words: 300 }),
    );
    expect(expectedMsFor("ingest", { bytes: 558 * 1024 })).toBeGreaterThan(
      expectedMsFor("ingest", { bytes: 40 * 1024 }),
    );
    expect(expectedMsFor("ingest", { seconds: 3_600 })).toBeGreaterThan(
      expectedMsFor("ingest", { seconds: 60 }),
    );
  });

  it("does not promise a 558 KB EPUB the same wait it promises an empty box", () => {
    // §7.3's exact file. The screen said "about 2 minutes" for a run the
    // ledger measured at 151.5s at best and 491s (8m11s) at worst, because
    // the sentence was the lane median whatever was in the box.
    const epub = expectedMsFor("ingest", { bytes: 558 * 1024 });
    const nothingKnownYet = expectedMsFor("ingest", {});
    expect(epub).not.toBe(nothingKnownYet);
    expect(epub).toBeGreaterThanOrEqual(145_000);
  });

  it("overlaps a pile only as far as the server's own fan-out cap", () => {
    // `knobs.resource_fan_out` = 4 (aidream mw_066). Nineteen resources are
    // five waves, not one — a promise that divided by nineteen would be the
    // uncapped fan-out that got a working run falsely reaped.
    const nineteen = sizedEstimateMs(DUMP_INGEST_RATE, { items: 19 });
    const four = sizedEstimateMs(DUMP_INGEST_RATE, { items: 4 });
    expect(nineteen).toBeGreaterThan(four * 2);
    expect(SOURCE_INGEST_RATE.measuredFrom).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(DUMP_INGEST_RATE.measuredFrom).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("leg 2 — a run that only emits model tokens still shows movement", () => {
  /** The real event shapes: `dump_ingest.py` and `ingest.py`, verbatim keys. */
  const started = (index: number, count: number, title: string) => ({
    step: "resource_started",
    message: `Reading ${title} (${index + 1} of ${count})…`,
    resource_index: index,
    resource_count: count,
    title,
    rules_added_total: 0,
  });

  it("names every source from the first event, with a state each", () => {
    let progress = EMPTY_INGEST_PROGRESS;
    progress = reduceIngestProgress(
      progress,
      "masterwork_dump_progress",
      started(0, 3, "pride_and_prejudice.epub"),
    );
    expect(progress.resources).toHaveLength(3);
    expect(progress.resources[0]).toMatchObject({
      label: "pride_and_prejudice.epub",
      status: "running",
    });
    // The two nobody has reached yet are ON SCREEN and waiting — how much is
    // still to come is the question a person watching actually has.
    expect(progress.resources[1]?.status).toBe("waiting");
    expect(progress.resources[2]?.status).toBe("waiting");
  });

  it("moves when a source finishes, and carries the server's own count", () => {
    let progress = EMPTY_INGEST_PROGRESS;
    progress = reduceIngestProgress(
      progress,
      "masterwork_dump_progress",
      started(0, 2, "pride_and_prejudice.epub"),
    );
    const before = progressHeadline(progress);
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_done",
      message: "pride_and_prejudice.epub: 125 draft rule(s) added.",
      resource_index: 0,
      resource_count: 2,
      title: "pride_and_prejudice.epub",
      rules_added: 125,
      rules_added_total: 125,
    });
    expect(progress.resources[0]?.status).toBe("completed");
    expect(progress.rulesSoFar).toBe(125);
    expect(progressHeadline(progress)).not.toBe(before);
    expect(progressHeadline(progress)).toContain("125 draft rules so far");
  });

  it("counts the parts of ONE source, which is the 8-minute single-file case", () => {
    let progress = EMPTY_INGEST_PROGRESS;
    progress = reduceIngestProgress(progress, "masterwork_ingest_progress", {
      step: "chunked",
      message: "Source split into 24 chunk(s)",
      total_chunks: 24,
    });
    // Knowing there are 24 parts is not yet progress: until the server says a
    // part is DONE, "0 of 24" cannot move and reads as a stall. Verified live
    // 2026-09-17 — a finished run still said "0 of 3 parts distilled".
    expect(progressHeadline(progress) ?? "").not.toContain("parts distilled");
    progress = reduceIngestProgress(progress, "masterwork_ingest_progress", {
      step: "chunk_distilled",
      message: "Chunk 7: 5 candidate rule(s).",
      chunk_index: 6,
      total_chunks: 24,
      rules_found: 5,
    });
    expect(progress.chunksDone).toBe(7);
    expect(progressHeadline(progress)).toContain("7 of 24 parts distilled");
  });

  it("ignores the token events entirely rather than being confused by them", () => {
    const before = EMPTY_INGEST_PROGRESS;
    const after = reduceIngestProgress(before, "content", { text: "…" });
    expect(after).toBe(before);
  });
});

/** The same bare react-dom harness the sibling RunStages guard uses. */
async function render(node: React.ReactElement): Promise<{
  container: HTMLElement;
  text: () => string;
  status: () => string;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return {
    container,
    text: () => container.textContent ?? "",
    status: () =>
      container.querySelector('[role="status"]')?.textContent ?? "",
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("leg 3 — a late heartbeat shows the server's sentence, never a spinner", () => {
  const LABOURING =
    "Still working, but the server is busy enough that it cannot check in right now. Nothing is lost — what has already been added is saved.";

  it("renders the labouring sentence in place of the stale stage line", async () => {
    const progress = reduceIngestProgress(
      EMPTY_INGEST_PROGRESS,
      "masterwork_run_labouring",
      { message: LABOURING },
    );
    const view = await render(
      <RunStages
        run={{
          running: true,
          stages: ["Reading pride_and_prejudice.epub (1 of 1)…"],
          stage: "Reading pride_and_prejudice.epub (1 of 1)…",
          startedAt: Date.now() - 200_000,
          expectedMs: 150_000,
          progress,
        }}
      />,
    );
    expect(view.status()).toMatch(
      /the server is busy enough that it cannot check in/i,
    );
    await view.unmount();
  });

  it("puts it away again the moment real progress lands", () => {
    let progress = reduceIngestProgress(
      EMPTY_INGEST_PROGRESS,
      "masterwork_run_labouring",
      { message: LABOURING },
    );
    expect(progress.labouring).toBe(LABOURING);
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_done",
      message: "done",
      resource_index: 0,
      resource_count: 1,
      rules_added_total: 12,
    });
    expect(progress.labouring).toBeNull();
  });

  it("keeps a clock moving under whatever the sentence says", async () => {
    jest.useFakeTimers();
    try {
      const view = await render(
        <RunStages
          run={{
            running: true,
            stages: ["Reading pride_and_prejudice.epub (1 of 1)…"],
            stage: "Reading pride_and_prejudice.epub (1 of 1)…",
            startedAt: Date.now(),
            expectedMs: 150_000,
            progress: EMPTY_INGEST_PROGRESS,
          }}
        />,
      );
      // Nothing about time before the first whole second (cold walk 22 read
      // "0ms so far"); from one second on the clock counts in whole seconds.
      expect(view.status()).not.toMatch(/so far/);
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const first = view.status();
      expect(first).toMatch(/\b1s so far/);
      await act(async () => {
        jest.advanceTimersByTime(64_000);
      });
      const later = view.status();
      expect(later).not.toBe(first);
      expect(later).toContain("1m 05s so far");
      await view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
