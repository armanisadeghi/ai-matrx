/**
 * A DUMP THAT MOVED SERVERS MUST NEVER LOOK LIKE IT LOST ITS PLACE.
 *
 * ## The defect this guards
 *
 * aidream f22ae67a15 makes `ingest_dump` survive a server replacement: the
 * frontier (`dump_frontier.py`) checkpoints every resource as it finishes, and
 * a resumed run replays each recorded outcome through the SAME
 * `masterwork_dump_progress` steps a first pass emits (`dump_ingest.py`'s
 * `_STEP_FOR_STATUS` — `resource_done` / `resource_failed` /
 * `resource_unsupported` / `resource_already_distilled`), with the
 * continuation sentence riding the FIRST replayed row's `message`
 * ("Continued on a new server — already read. …") because a bare event this
 * reducer did not recognize would be dropped with nobody the wiser.
 *
 * Two things this file must therefore prove:
 *
 *   1. `reduceIngestProgress` never silently drops a `masterwork_dump_progress`
 *      event just because its `step` is not one this table happens to know —
 *      a future recovery step (or any lane addition) is shown by its raw
 *      label, never folded away. "Narrow by name": this only widens what
 *      happens INSIDE an event this file already renders, never turns every
 *      unknown event name into visible noise (the 7,412-raw-model-token
 *      defect `ingestProgress.ts`'s header exists to keep closed).
 *   2. The resource counter (`progress.resources`, `progressHeadline`)
 *      CONTINUES across a resume — the rows a first pass already finished
 *      stay finished, and the running total keeps counting up rather than
 *      resetting when the replayed rows land.
 */

import {
  EMPTY_INGEST_PROGRESS,
  progressHeadline,
  reduceIngestProgress,
} from "../ingestProgress";

describe("an unrecognized masterwork_dump_progress step is shown, never dropped", () => {
  it("keeps the resource row and shows the raw step name when the server sends no message", () => {
    const next = reduceIngestProgress(EMPTY_INGEST_PROGRESS, "masterwork_dump_progress", {
      step: "resource_recovering", // a step this table has never been taught
      resource_index: 0,
      resource_count: 1,
      title: "The Pragmatic Programmer",
    });

    expect(next.resources).toHaveLength(1);
    const row = next.resources[0];
    // Never silently dropped: the row exists...
    expect(row.label).toBe("The Pragmatic Programmer");
    // ...and says something, rather than sitting there with no account of
    // what happened at all — the raw step name, since the server sent no
    // message this time.
    expect(row.detail).toBe("resource_recovering");
  });

  it("prefers the server's own message over the raw step name when both are present", () => {
    const next = reduceIngestProgress(EMPTY_INGEST_PROGRESS, "masterwork_dump_progress", {
      step: "resource_recovering",
      message: "Picked back up on a new server.",
      resource_index: 0,
      resource_count: 1,
    });

    expect(next.resources[0].detail).toBe("Picked back up on a new server.");
  });

  it("still returns state unchanged for an event with no resource index — this reducer is narrow by name, not blanket-permissive", () => {
    const next = reduceIngestProgress(EMPTY_INGEST_PROGRESS, "masterwork_dump_progress", {
      step: "resource_recovering",
      message: "no index at all",
    });
    expect(next).toBe(EMPTY_INGEST_PROGRESS);
  });
});

describe("the resource counter continues across a server replacement, never resets", () => {
  it("keeps earlier finished rows finished and keeps counting up through the replayed rows", () => {
    let progress = EMPTY_INGEST_PROGRESS;

    // ── first server: two of five resources finish before it is replaced ──
    for (const index of [0, 1]) {
      progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
        step: "resource_started",
        resource_index: index,
        resource_count: 5,
        title: `Source ${index + 1}`,
      });
      progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
        step: "resource_done",
        resource_index: index,
        resource_count: 5,
        title: `Source ${index + 1}`,
        rules_added: 4,
        rules_added_total: (index + 1) * 4,
      });
    }
    expect(progressHeadline(progress)).toBe("2 of 5 sources read · 8 draft rules so far");

    // ── the deploy happens here; a `masterwork_run_continuing` event fires on
    //    the live stream (handled by `useDurableRun`, not this reducer) and is
    //    not a `masterwork_dump_progress`/`masterwork_ingest_progress`/
    //    `masterwork_run_labouring` event, so this reducer correctly leaves
    //    the resource list untouched for it.
    const untouched = reduceIngestProgress(progress, "masterwork_run_continuing", {
      run_id: "run-1",
      done: 2,
      remaining: 3,
      user_message: "We are updating the server…",
    });
    expect(untouched).toBe(progress);

    // ── new server: the frontier replays the two finished rows (the FIRST
    //    replayed row carries the continuation sentence, per
    //    `dump_ingest.py`'s `_replayed_message`) BEFORE any new resource
    //    starts. Totals ride on `rules_added_total`, carried from the
    //    frontier's own accumulated `totals["added"]` — never reset to 0.
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_done",
      resource_index: 0,
      resource_count: 5,
      title: "Source 1",
      rules_added: 4,
      rules_added_total: 8,
      message: "Continued on a new server — already read. Source 1: 4 draft rule(s) added.",
    });
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_done",
      resource_index: 1,
      resource_count: 5,
      title: "Source 2",
      rules_added: 4,
      rules_added_total: 8,
      message: "Source 2: 4 draft rule(s) added. (read before this run moved to a new server)",
    });

    // The counter did not reset: still exactly the two rows already finished,
    // never fewer, and the total is still 8 — not re-counted, not zeroed.
    expect(progressHeadline(progress)).toBe("2 of 5 sources read · 8 draft rules so far");
    expect(
      progress.resources.filter((row) => row.status === "completed"),
    ).toHaveLength(2);
    // The continuation sentence is on screen, on the row it actually rode in
    // on — never lost.
    expect(progress.resources[0].detail).toContain("Continued on a new server");

    // ── the new server picks up where the old one stopped: resource 2 ──
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_started",
      resource_index: 2,
      resource_count: 5,
      title: "Source 3",
    });
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_done",
      resource_index: 2,
      resource_count: 5,
      title: "Source 3",
      rules_added: 2,
      rules_added_total: 10,
    });

    expect(progressHeadline(progress)).toBe("3 of 5 sources read · 10 draft rules so far");
  });
});
