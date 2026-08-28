/**
 * THE RUN CONTROL MODEL — the rule census #34 turns on.
 *
 * These assertions are the reason the decision is a pure module and not
 * inlined into the bar: "which verb does this status allow, and what does the
 * disabled one say" is exactly the thing that rots silently when it lives in
 * JSX, and it is the thing a person notices first when it is wrong.
 */

import {
  isInFlight,
  isParked,
  nodeVerbAvailability,
  runStateLabel,
  stepOffersControls,
  verbAvailability,
} from "./run-controls";
import type { WorkflowRunStatus } from "@/types/python-generated/workflow-events";

const TERMINAL: WorkflowRunStatus[] = ["completed", "failed", "cancelled"];
const EVERY_STATUS: WorkflowRunStatus[] = [
  "pending",
  "running",
  "paused",
  "interrupted",
  "awaiting_input",
  "errored",
  "completed",
  "failed",
  "cancelled",
  "pausing",
  "cancelling",
];

describe("verbAvailability", () => {
  it("never disables a verb without saying why", () => {
    for (const status of [...EVERY_STATUS, null]) {
      for (const verb of ["pause", "resume", "stop", "cancel"] as const) {
        const state = verbAvailability(verb, status);
        if (!state.enabled) {
          expect(typeof state.reason).toBe("string");
          expect(state.reason && state.reason.length).toBeGreaterThan(0);
        } else {
          expect(state.reason).toBeNull();
        }
      }
    }
  });

  it("allows pause only while the run is actually going", () => {
    expect(verbAvailability("pause", "running").enabled).toBe(true);
    expect(verbAvailability("pause", "pending").enabled).toBe(true);
    expect(verbAvailability("pause", "paused").enabled).toBe(false);
    expect(verbAvailability("pause", "pausing").enabled).toBe(false);
    expect(verbAvailability("pause", "awaiting_input").enabled).toBe(false);
  });

  it("allows resume only from paused — a parked-for-an-answer run needs the answer", () => {
    expect(verbAvailability("resume", "paused").enabled).toBe(true);
    for (const status of ["awaiting_input", "interrupted"] as const) {
      const state = verbAvailability("resume", status);
      expect(state.enabled).toBe(false);
      expect(state.reason).toMatch(/answer/i);
    }
    expect(verbAvailability("resume", "running").enabled).toBe(false);
  });

  it("allows stopping any run that has not finished", () => {
    for (const status of ["pending", "running", "paused", "awaiting_input", "interrupted", "errored"] as const) {
      expect(verbAvailability("stop", status).enabled).toBe(true);
      expect(verbAvailability("cancel", status).enabled).toBe(true);
    }
  });

  it("refuses every verb on a finished run, and says it has finished", () => {
    for (const status of TERMINAL) {
      for (const verb of ["pause", "resume", "stop", "cancel"] as const) {
        const state = verbAvailability(verb, status);
        expect(state.enabled).toBe(false);
        expect(state.reason).toMatch(/finished/i);
      }
    }
  });

  it("refuses every verb before the run has reported, without claiming it failed", () => {
    for (const verb of ["pause", "resume", "stop", "cancel"] as const) {
      const state = verbAvailability(verb, null);
      expect(state.enabled).toBe(false);
      expect(state.reason).toMatch(/report/i);
    }
  });
});

describe("parked / in-flight", () => {
  it("counts every waiting state as parked", () => {
    expect(isParked("paused")).toBe(true);
    expect(isParked("awaiting_input")).toBe(true);
    expect(isParked("interrupted")).toBe(true);
    expect(isParked("running")).toBe(false);
    expect(isParked(null)).toBe(false);
  });

  it("counts the transitional control states as in flight", () => {
    expect(isInFlight("pausing")).toBe(true);
    expect(isInFlight("cancelling")).toBe(true);
    expect(isInFlight("running")).toBe(true);
    expect(isInFlight("paused")).toBe(false);
  });

  it("labels a parked run as resumable in the reader's language", () => {
    expect(runStateLabel("paused")).toMatch(/carry on/i);
    expect(runStateLabel("awaiting_input")).toMatch(/answer/i);
    expect(runStateLabel("interrupted")).toMatch(/answer/i);
  });

  it("labels every status — never an empty string", () => {
    for (const status of [...EVERY_STATUS, null]) {
      expect(runStateLabel(status).length).toBeGreaterThan(0);
    }
  });
});

describe("per-step verbs", () => {
  it("offers controls only on a stopped step of a live run", () => {
    expect(stepOffersControls("running", "failed")).toBe(true);
    expect(stepOffersControls("running", "skipped")).toBe(true);
    expect(stepOffersControls("running", "settled")).toBe(false);
    expect(stepOffersControls("completed", "failed")).toBe(false);
    expect(stepOffersControls(null, "failed")).toBe(false);
  });

  it("retries a failed OR skipped step, but only skips a failed one", () => {
    expect(nodeVerbAvailability("retry", "running", "failed").enabled).toBe(true);
    expect(nodeVerbAvailability("retry", "running", "skipped").enabled).toBe(true);
    expect(nodeVerbAvailability("retry", "running", "running").enabled).toBe(false);

    expect(nodeVerbAvailability("skip", "running", "failed").enabled).toBe(true);
    expect(nodeVerbAvailability("skip", "running", "skipped").enabled).toBe(false);
  });

  it("takes both verbs away once the run is over", () => {
    for (const verb of ["retry", "skip"] as const) {
      const state = nodeVerbAvailability(verb, "completed", "failed");
      expect(state.enabled).toBe(false);
      expect(state.reason).toMatch(/finished/i);
    }
  });
});
