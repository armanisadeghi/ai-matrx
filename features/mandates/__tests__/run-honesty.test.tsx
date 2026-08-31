/**
 * THE RUN PANEL PRINTS WHAT THE SERVER SAID, AND KEEPS WHAT IT REFUSED.
 *
 * 🚨 Two defects, both filed by the V3 round-4 honesty pass, both pinned here
 * because both can regress independently:
 *
 *   1. `MandateTestResult.notes` — the server's own account of what a run did
 *      that nobody asked for, the `mandate_consumption_map_no_op` scream among
 *      them — arrives in the body of a 200 and so turns nothing red. No run
 *      panel rendered it: the scream reached the browser on every affected run
 *      and appeared nowhere on screen.
 *   2. A 409/422 from the run door collapsed into a transient toast while the
 *      result panel was cleared to nothing, so the sentence that says WHAT
 *      refused and WHY had to be caught mid-flight.
 *
 * Each test asserts what a PERSON would see, on the rendered component — never
 * on an internal shape only this file knows about.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ServerNotes } from "@/components/official/ServerNotes";
import { RunFailureCard } from "../RunFailureCard";
import {
  MandateRunRefusal,
  describeMandateRunFailure,
  mandateRefusalHeadline,
} from "../test-run";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The server's real no-op scream, as `mandate_consumption_map_no_op` writes
 * it — the sentence that was arriving and vanishing. */
const NO_OP_SCREAM =
  "The consumption map on this binding did nothing: none of its sources " +
  "produced a value, so the run used the holder's own defaults instead.";

/** The 409 the mandate door answers when nothing fulfils the job. */
const UNFULFILLED =
  "variable binding blocks this run: no Holder is bound for this job at any " +
  "rung — bind an agent or a workflow to it and run again.";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe("ServerNotes — counted, verbatim, or absent", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = mount());
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("prints the run's notes VERBATIM, and says how many there are", () => {
    act(() => {
      root.render(
        <ServerNotes
          heading="What this run did"
          notes={[NO_OP_SCREAM, "A second thing happened."]}
        />,
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain(NO_OP_SCREAM);
    expect(text).toContain("A second thing happened.");
    // COUNTED — "there is a note" and "there are two" are different facts.
    expect(text).toContain("What this run did — 2 notes");
  });

  it("counts one note in the singular", () => {
    act(() => {
      root.render(
        <ServerNotes heading="What this run did" notes={[NO_OP_SCREAM]} />,
      );
    });
    expect(container.textContent).toContain("What this run did — 1 note");
  });

  it("renders NOTHING at all when the server said nothing", () => {
    act(() => {
      root.render(<ServerNotes heading="What this run did" notes={[]} />);
    });
    // No empty amber box, no "no notes" — absent must read as absent.
    expect(container.textContent).toBe("");
    expect(container.querySelector("[data-testid='server-notes']")).toBeNull();
  });

  it("drops blanks and non-sentences rather than printing empty rows", () => {
    act(() => {
      root.render(
        <ServerNotes
          heading="What this run did"
          notes={[NO_OP_SCREAM, "", "   ", 42, null, undefined]}
        />,
      );
    });
    expect(container.textContent).toContain("What this run did — 1 note");
  });
});

describe("a refusal is read whole, never flattened to a string", () => {
  it("carries the status, the code, the notes and the request id", () => {
    const failure = describeMandateRunFailure(
      new MandateRunRefusal({
        message: UNFULFILLED,
        status: 409,
        code: "mandate_unfulfilled",
        notes: [NO_OP_SCREAM, ""],
        requestId: "6db776c6bb76493f952b79bcdd792ccf",
      }),
    );
    expect(failure.sentence).toBe(UNFULFILLED);
    expect(failure.status).toBe(409);
    expect(failure.code).toBe("mandate_unfulfilled");
    expect(failure.notes).toEqual([NO_OP_SCREAM]);
    expect(failure.requestId).toBe("6db776c6bb76493f952b79bcdd792ccf");
    expect(failure.refused).toBe(true);
  });

  it("reads a plain transport failure as NOT a server verdict", () => {
    const failure = describeMandateRunFailure(new Error("Failed to fetch"));
    expect(failure.sentence).toBe("Failed to fetch");
    expect(failure.status).toBeNull();
    expect(failure.refused).toBe(false);
    // Never invents a verdict the server did not give.
    expect(mandateRefusalHeadline(failure)).toBe(
      "The run never reached the server",
    );
  });

  it("names the two refusal classes the mandate doors answer with", () => {
    expect(
      mandateRefusalHeadline(
        describeMandateRunFailure(
          new MandateRunRefusal({ message: UNFULFILLED, status: 409 }),
        ),
      ),
    ).toContain("nothing fulfils this job");
    expect(
      mandateRefusalHeadline(
        describeMandateRunFailure(
          new MandateRunRefusal({ message: "bad values", status: 422 }),
        ),
      ),
    ).toContain("the values this run sent");
  });
});

describe("RunFailureCard — the refusal STAYS on the screen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = mount());
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the server's sentence, its status and its code in the panel", () => {
    const failure = describeMandateRunFailure(
      new MandateRunRefusal({
        message: UNFULFILLED,
        status: 409,
        code: "mandate_unfulfilled",
        notes: [NO_OP_SCREAM],
        requestId: "req-1",
      }),
    );
    act(() => {
      root.render(<RunFailureCard failure={failure} />);
    });
    const text = container.textContent ?? "";
    // The server's own words, verbatim — not a softened paraphrase.
    expect(text).toContain(UNFULFILLED);
    expect(text).toContain("409");
    expect(text).toContain("mandate_unfulfilled");
    // Notes a refusal carried are printed too, through the same counted block.
    expect(text).toContain(NO_OP_SCREAM);
    expect(text).toContain("request req-1");
    // It is a PANEL, readable at leisure — not a toast that expires.
    expect(
      container.querySelector("[data-testid='mandate-run-failure']"),
    ).not.toBeNull();
  });

  it("says plainly when the run never reached an HTTP answer", () => {
    act(() => {
      root.render(
        <RunFailureCard
          failure={describeMandateRunFailure(new Error("Failed to fetch"))}
        />,
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("The run never reached the server");
    expect(text).toContain("Failed to fetch");
  });
});
