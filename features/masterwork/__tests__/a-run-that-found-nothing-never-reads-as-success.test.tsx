/**
 * A RUN THAT ADDED NOTHING NEVER READS AS A SUCCESS — AND NEVER THROWS AWAY
 * THE SERVER'S EXPLANATION OF WHY.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 8, 2026-09-17). `platform.masterwork_run`
 * row e40f158e-212e-435a-aa1b-c594e7a3af41 — operation `ingest_meeting`, status
 * `completed`, result `{"added":0,"failed_chunks":0,...}` — was painted by the
 * Meeting Scavenger in the success box (`border-primary/40 bg-primary/5`) with
 * one summary line and no heading. The Expert read a tick over an empty
 * Rulebook and concluded the product was broken.
 *
 * The server was NOT silent. `meeting_ingest.py` emits a `nothing_found` step
 * ("We read N moment(s) of yours from these meetings and none of them was a
 * judgment call…"), a filter census, and an already-distilled note — all three
 * ride `MasterworkIngestProgressData` into `run.stages`. The dialog never
 * referenced `run.stages` at all, so every one of those sentences was emitted,
 * streamed, received and dropped.
 *
 * `IngestOutcome` is the one place that now answers both halves, so this is the
 * forcing function on it. Nothing here is mocked: the real component, the real
 * `describeIngest` sentence, real DOM.
 *
 * RED before the fix, proven 2026-09-17 with `plant.py` against the real
 * component: making the box unconditionally the success box fails the first
 * test by name, and dropping `<RunStages>` fails the third.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { describeIngest } from "../components/detail/IngestSourceDialog";
import { IngestOutcome } from "../components/RunStages";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The server's own account of the run — captured wording from meeting_ingest.py. */
const STAGES = [
  "We read 96 moment(s) of yours from these meetings and none of them was a judgment call — nothing was added.",
  "Skipped 41 turns shorter than 8 words.",
];

const ZERO = {
  added: 0,
  duplicatesSkipped: 0,
  quotesUnverified: 0,
  failedChunks: 0,
  skippedWords: 0,
  followupSeed: null,
  alreadyDistilled: 0,
};

async function render(node: React.ReactElement): Promise<{
  box: HTMLElement;
  text: string;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  // The tinted outcome box itself: the first child of the component's wrapper.
  const box = container.firstElementChild?.firstElementChild as HTMLElement | null;
  if (!box) throw new Error("nothing rendered");
  return {
    box,
    text: container.textContent ?? "",
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("a finished run that added nothing", () => {
  it("is headed with what did NOT happen, not with a tick", async () => {
    const view = await render(
      <IngestOutcome
        summary={describeIngest(ZERO)}
        added={0}
        run={{ stages: STAGES, running: false }}
      />,
    );
    expect(view.text).toContain("Nothing was added to your Rulebook");
    // And the remedy half, which is what makes it honest rather than merely
    // accurate. It comes from `describeIngest`, never from this component.
    expect(view.text).toMatch(/try one where you were deciding something/i);
    await view.unmount();
  });

  it("does not wear the same box a run that added rules wears", async () => {
    const nothing = await render(
      <IngestOutcome
        summary={describeIngest(ZERO)}
        added={0}
        run={{ stages: STAGES, running: false }}
      />,
    );
    const nothingClass = nothing.box.className;
    await nothing.unmount();

    const added = await render(
      <IngestOutcome
        summary={describeIngest({ ...ZERO, added: 3 })}
        added={3}
        run={{ stages: STAGES, running: false }}
      />,
    );
    const addedClass = added.box.className;
    // The success heading belongs ONLY to the run that succeeded.
    expect(added.text).not.toContain("Nothing was added to your Rulebook");
    expect(added.text).toContain("3 suggested rules added as drafts");
    await added.unmount();

    // The defect was that these two were the SAME box. Asserting they differ
    // (rather than pinning a class string) keeps this a statement about the
    // product — a zero must not look like a success — and not about Tailwind.
    expect(nothingClass).not.toEqual(addedClass);
  });

  it("keeps the server's explanation of WHY on screen after the run ends", async () => {
    const view = await render(
      <IngestOutcome
        summary={describeIngest(ZERO)}
        added={0}
        run={{ stages: STAGES, running: false }}
      />,
    );
    // This is the sentence that was emitted and thrown away. Both stage lines
    // are asserted: a component that rendered only the last one would still be
    // dropping the server's account.
    expect(view.text).toContain("none of them was a judgment call");
    expect(view.text).toContain("Skipped 41 turns shorter than 8 words.");
    await view.unmount();
  });
});
