/**
 * THE FLOATING HANDOFF — the seam that keeps a run alive across navigation,
 * plus the one line the float has room to say.
 *
 * The handoff is invisible from a rendered page: it happens in a cleanup, at
 * the moment a surface is being torn down, and the only evidence it worked is
 * that something ELSE is holding the run a frame later. Nothing about it is
 * catchable with a type. So the joins are asserted at the source level here,
 * because the failure mode is silent — the hook keeps compiling, the page
 * keeps rendering, and runs quietly start dying on navigation again.
 */

import { readFileSync } from "fs";
import { join } from "path";

import type { RunActivityEntry } from "../../redux/workflow-runs.slice";
import { currentLivenessLine } from "../run-liveness";

const ROOT = join(__dirname, "..", "..", "..", "..");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

const RUN_STAGE = "features/workflow-runtime/components/run/RunStage.tsx";
const FLOATING_HOOK =
  "features/workflow-runtime/floating/useFloatingWorkflowRun.ts";
const WINDOW = "features/window-panels/windows/workflows/WorkflowRunWindow.tsx";

let seq = 0;
function entry(
  kind: RunActivityEntry["kind"],
  text: string | null,
  nodeId: string | null = "step_one",
): RunActivityEntry {
  seq += 1;
  return { id: seq, nodeId, kind, text, detail: null, ts: "2026-08-28T00:00:00Z" };
}

describe("the run's own page hands it to the float", () => {
  it("RunStage mounts the floating hook", () => {
    const source = read(RUN_STAGE);
    expect(source).toContain("useFloatingWorkflowRun");
  });

  it("hands over the step labels, so the float never narrates node ids", () => {
    // THE NO-GRAPH-IDS LAW. The window renders outside every provider that
    // knows the workflow, so the surface giving the run up is the last thing
    // that can supply them. Dropping this argument is invisible until someone
    // reads "T in · Started" in the wild.
    expect(read(RUN_STAGE)).toMatch(/useFloatingWorkflowRun\(\{[^}]*stepLabels/);
  });
});

describe("the handoff hook", () => {
  const source = read(FLOATING_HOOK);

  it("opens the float from the CLEANUP, not from a render", () => {
    // The page is the thing being navigated away from — its last act has to be
    // handing the run on. An open during render would fight the visibility
    // gate and stack a float over the page that already shows the run.
    expect(source).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*openWorkflowRunWindowAction/);
  });

  it("closes the float while the surface is on screen", () => {
    expect(source).toContain("closeWorkflowRunWindowAction");
  });

  it("never hands off a run that already finished", () => {
    expect(source).toContain("TERMINAL_STATUSES");
    expect(source).toMatch(/TERMINAL_STATUSES\.has\(finalStatus\)/);
  });

  it("reads the LATEST status at cleanup, not the one captured at setup", () => {
    // A run that completed while the page was open must not be floated; the
    // effect's captured `status` is stale by definition.
    expect(source).toContain("latest.current");
  });
});

describe("the float itself adopts the run", () => {
  it("calls useWorkflowRun — the adoption IS the survival", () => {
    // Without this the window is a picture of a dead stream: the page's
    // refcount already dropped to zero and stopped the transports.
    expect(read(WINDOW)).toContain("useWorkflowRun(runId)");
  });
});

describe("currentLivenessLine — the one line the float has room for", () => {
  it("is null on an empty feed, so the caller can say 'Starting…'", () => {
    expect(currentLivenessLine([])).toBeNull();
  });

  it("prefers the newest liveness marker over older lifecycle noise", () => {
    const line = currentLivenessLine([
      entry("started", null),
      entry("phase", "streaming"),
      entry("completed", null),
    ]);
    // "completed" is newer but says nothing about what is happening NOW.
    expect(line?.text).toBe("Writing it out");
  });

  it("speaks the closed AgentStepPhase vocabulary in the reader's words", () => {
    for (const [phase, words] of [
      ["preparing", "Getting ready"],
      ["streaming", "Writing it out"],
      ["reasoning", "Reasoning"],
      ["finalizing", "Finishing up"],
      ["retrying", "Trying again"],
    ] as const) {
      expect(currentLivenessLine([entry("phase", phase)])?.text).toBe(words);
    }
  });

  it("falls back to the newest entry of any kind rather than going silent", () => {
    // A run whose backend reports only lifecycle events still has to say
    // something — an empty line reads as a stall.
    const line = currentLivenessLine([entry("started", null)]);
    expect(line?.text).toBe("Started");
  });

  it("uses the handed-over step label, never the node id", () => {
    const line = currentLivenessLine(
      [entry("phase", "streaming", "t_in")],
      { t_in: "What are we approving?" },
    );
    expect(line?.stepLabel).toBe("What are we approving?");
  });

  it("humanises an unknown node id rather than printing it raw", () => {
    expect(currentLivenessLine([entry("phase", "streaming", "t_in")])?.stepLabel)
      .not.toContain("t_in");
  });
});
