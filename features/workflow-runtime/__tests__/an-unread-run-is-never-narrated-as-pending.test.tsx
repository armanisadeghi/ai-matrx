/**
 * @jest-environment jsdom
 */
/**
 * A RUN THIS PAGE HAS NOT READ YET IS NEVER NARRATED AS A RUN THAT IS STARTING.
 *
 * ## The defect this exists to catch (cold walk 7, finding 5, 2026-09-17)
 *
 * Cold walk 7 finished a Masterwork on Encore ("Finished · 1m 08s · $0.32"),
 * clicked the excerpt of that finished run to READ the rest of it, and
 * reported that the click had started a brand-new paid run: the next screen
 * said "GETTING READY — 0 of 13 steps". It then pressed "Cancel now" to stop
 * the run it believed it had just been charged for, and wrote up the product
 * as one that can silently re-spend money on a click that reads as "show me
 * what I already got".
 *
 * No new run was started. The click is a `<Link>` to `/workflows/runs/{id}`,
 * the finished run's permalink, and it was a link at the commit the walk drove
 * (`git diff 4778958a..HEAD -- EncoreRunPage.tsx MasterworksPage.tsx` is
 * empty). What the walk actually saw was the permalink's own opening frames:
 *
 *     `RunHero`:        STATUS_COPY[status ?? "pending"]   → "Getting ready"
 *     `run-controls.ts`: runStateLabel(null)               → "Getting ready"
 *
 * `null` means THIS PAGE has not read the run yet. `pending` means THE RUN has
 * not started yet. They were the same default, so every run permalink opened
 * by announcing a run that was about to start — whatever it was pointed at.
 * Measured live on a warm dev server against a run that had been `completed`
 * for 22 minutes: 1.2s of `data-run-status="pending"` and
 * "GETTING READY · 0 of 13 steps", settling to "DONE · 13 of 13 steps" at
 * 1.8s. On a cold server, or across the preview-server restart that happened
 * during the walk, that window is seconds to tens of seconds.
 *
 * W39 (2026-09-12, `run-permalink-waits-for-workspace.test.ts`) closed the
 * half where the attach read FAILED. This is the half where the read has
 * simply not answered yet — which is every single load of the page.
 *
 * Proven red before green (2026-09-17): against `status ?? "pending"` and
 * `case null: return "Getting ready"`, every case here fails on the word
 * "Getting ready" and on the "0 of 13 steps" counter.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  runStateLabel,
  verbAvailability,
} from "../components/run/run-controls";
import reducer, { attachRun } from "../redux/workflow-runs.slice";

jest.mock("@ai-matrx/icons", () => ({
  IconResolver: () => null,
}));

jest.mock(
  "@/components/official-candidate/elapsed-time/ElapsedTime",
  () => ({ ElapsedTime: () => null }),
);

/** The run store, driven by the one thing under test: what the page knows. */
let runStatus: string | null = null;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(null),
}));

jest.mock("../redux/workflow-runs.selectors", () => ({
  selectRunStatus: () => () => runStatus,
  selectRunStartedAt: () => () => null,
  selectRunStatusTs: () => () => null,
  selectNodeAggregatePhases: () => () => ({}),
  selectRunCostTotal: () => () => null,
  selectRunReadFailure: () => () => null,
  // The store's own discriminator: the page knows the status only once the
  // server has said one. `runStatus = null` here IS "nothing read yet".
  selectRunStatusKnown: () => () => runStatus !== null,
}));

import { RunHero } from "../components/run/RunHero";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STEPS = Array.from({ length: 13 }, (_, i) => ({
  nodeId: `n${i}`,
  label: `Step ${i + 1}`,
  family: "general",
  outputKind: null,
})) as never[];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function hero(): string {
  act(() => {
    root.render(
      <RunHero
        runId="09a644d4-3f10-4f35-8bac-72248861f7f1"
        workflowName="Kitchen Remodel Estimator"
        steps={STEPS}
        deliverables={[]}
        totalSteps={13}
      />,
    );
  });
  return container.innerText ?? container.textContent ?? "";
}

describe("the run hero, before the run row has been read", () => {
  it("does not claim the run is getting ready to start", () => {
    runStatus = null;
    const text = hero();
    expect(text).toContain("Opening this run");
    expect(text).not.toContain("Getting ready");
  });

  it("does not count steps it has not seen", () => {
    runStatus = null;
    const text = hero();
    // "0 of 13 steps" is a measurement of nothing, and it reads as a run that
    // just started. The denominator is all the definition honestly gives us.
    expect(text).not.toContain("0 of 13 steps");
    expect(text).toContain("13 steps");
  });

  it("still says 'Getting ready' for a run that genuinely has not started", () => {
    runStatus = "pending";
    const text = hero();
    expect(text).toContain("Getting ready");
  });

  it("says what a finished run is the moment the row lands", () => {
    runStatus = "completed";
    const text = hero();
    expect(text).toContain("Done");
    expect(text).toContain("13 steps");
  });
});

describe("the run control bar's own label", () => {
  it("names the page's state, not a run state, while nothing is read", () => {
    expect(runStateLabel(null)).toBe("Opening this run");
  });

  it("still names 'Starting' for a run the server says is pending", () => {
    expect(runStateLabel("pending")).toBe("Starting");
  });

  it("still names a finished run finished", () => {
    expect(runStateLabel("completed")).toBe("Finished");
  });
});

describe("the run store itself", () => {
  const RUN = "09a644d4-3f10-4f35-8bac-72248861f7f1";

  it("does not claim to know the status of a run it has only attached to", () => {
    const state = reducer(
      undefined,
      attachRun({ runId: RUN, definitionId: null }),
    );
    const run = state.byRunId[RUN];
    // `status` stays non-nullable and stays "pending" — every consumer of the
    // type keeps working. What changes is that the store no longer PRETENDS
    // that default is something the server said.
    expect(run.status).toBe("pending");
    expect(run.statusKnown).toBe(false);
  });
});

describe("the run's own controls, before anything is read", () => {
  it("offers no verb, and says why — not Stop and Cancel on an unknown run", () => {
    // This is the sharp edge of the defect: "pending" is not terminal, so
    // Stop and Cancel were ENABLED for the whole read window on a permalink
    // opened over a run that had already finished. Cold walk 7 pressed
    // "Cancel now" there, believing it was stopping a duplicate paid run.
    for (const verb of ["pause", "resume", "stop", "cancel"] as const) {
      expect(verbAvailability(verb, null)).toEqual({
        enabled: false,
        reason: "Waiting for this run to report in.",
      });
    }
    expect(verbAvailability("stop", "pending").enabled).toBe(true);
  });
});
