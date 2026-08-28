/**
 * The "waiting on you" projection, parsed — census #38.
 *
 * The fixtures are the two shapes the server actually serves plus the two ways
 * a row can be thin: a recovered (`stale`) interrupt, and a park whose gap list
 * is empty. All four have to reach the screen as a usable row, because this
 * inbox is the ONLY way to find these runs.
 */

import {
  isOverdue,
  parseWaitingRun,
  parseWaitingRuns,
  waitingAction,
  waitingRunHref,
  waitingSummary,
} from "../waiting";

const INTERRUPT = {
  run_id: "run-1",
  definition_id: "def-1",
  workflow_name: "Weekly digest",
  status: "interrupted",
  snapshot: {
    kind: "interrupt",
    node_id: "ask_1",
    checkpoint_id: "cp-9",
    title: "Approve the headline?",
    prompt: "Is this headline right for the audience?",
    presentation: "panel",
    preset: "approval",
    stale: false,
  },
  asked_at: "2026-08-27T10:00:00Z",
  deadline: "2026-08-29T10:00:00Z",
  parent_run_id: null,
};

const PARK = {
  run_id: "run-2",
  definition_id: "def-2",
  workflow_name: "Emissions fixture",
  status: "awaiting_input",
  snapshot: {
    kind: "awaiting_input",
    preset: "form",
    missing: [
      { name: "topic", label: "Topic" },
      { name: "audience", label: null },
      { name: "", label: "dropped — no name" },
    ],
    stale: false,
  },
  asked_at: "2026-08-27T09:00:00Z",
  deadline: null,
  parent_run_id: "run-parent",
};

describe("parseWaitingRun", () => {
  it("reads an interrupt row whole", () => {
    const row = parseWaitingRun(INTERRUPT);
    expect(row).toMatchObject({
      runId: "run-1",
      definitionId: "def-1",
      workflowName: "Weekly digest",
      kind: "interrupt",
      title: "Approve the headline?",
      stale: false,
      parentRunId: null,
    });
  });

  it("reads a park row and keeps only named gaps", () => {
    const row = parseWaitingRun(PARK);
    expect(row?.kind).toBe("awaiting_input");
    expect(row?.missing).toEqual([
      { name: "topic", label: "Topic" },
      { name: "audience", label: null },
    ]);
    expect(row?.parentRunId).toBe("run-parent");
  });

  it("classifies from the STATUS when the snapshot declares no kind", () => {
    const row = parseWaitingRun({ ...PARK, snapshot: { missing: [] } });
    expect(row?.kind).toBe("awaiting_input");
  });

  it("drops a row with no run id — a door to nowhere is not a row", () => {
    expect(parseWaitingRun({ ...INTERRUPT, run_id: "" })).toBeNull();
    expect(parseWaitingRun(null)).toBeNull();
  });

  it("survives a snapshot that is missing entirely", () => {
    const row = parseWaitingRun({ run_id: "run-3", status: "interrupted" });
    expect(row).toMatchObject({ runId: "run-3", kind: "interrupt", title: null });
  });
});

describe("parseWaitingRuns", () => {
  it("reads the response envelope in server order", () => {
    const rows = parseWaitingRuns({ runs: [INTERRUPT, PARK], total: 2 });
    expect(rows.map((row) => row.runId)).toEqual(["run-1", "run-2"]);
  });

  it("is empty, not thrown, on a shape it does not recognise", () => {
    expect(parseWaitingRuns({ runs: "nope" })).toEqual([]);
    expect(parseWaitingRuns(undefined)).toEqual([]);
  });
});

describe("waitingSummary — what the row says it wants", () => {
  it("prefers the author's title, then the question", () => {
    expect(waitingSummary(parseWaitingRun(INTERRUPT)!)).toBe("Approve the headline?");
    const titleless = parseWaitingRun({
      ...INTERRUPT,
      snapshot: { ...INTERRUPT.snapshot, title: null },
    })!;
    expect(waitingSummary(titleless)).toBe("Is this headline right for the audience?");
  });

  it("falls back honestly when a recovered row carries neither", () => {
    const thin = parseWaitingRun({
      run_id: "run-4",
      status: "interrupted",
      snapshot: { kind: "interrupt", stale: true },
    })!;
    expect(thin.stale).toBe(true);
    expect(waitingSummary(thin)).toBe("Asked you a question");
  });

  it("names the missing inputs on a park, in reader's language", () => {
    expect(waitingSummary(parseWaitingRun(PARK)!)).toBe("Needs Topic and audience");
  });

  it("summarises three or more without listing them all", () => {
    const many = parseWaitingRun({
      ...PARK,
      snapshot: {
        kind: "awaiting_input",
        missing: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }],
      },
    })!;
    expect(waitingSummary(many)).toBe("Needs a, b and 2 more");
  });

  it("says something usable when a park declares no gaps at all", () => {
    const gapless = parseWaitingRun({
      ...PARK,
      snapshot: { kind: "awaiting_input", missing: [] },
    })!;
    expect(waitingSummary(gapless)).toBe("Needs the inputs it was started without");
  });
});

describe("the row's door and its verb", () => {
  it("opens the run's permalink — never a second answer form", () => {
    expect(waitingRunHref(parseWaitingRun(INTERRUPT)!)).toBe("/workflows/runs/run-1");
  });

  it("asks for the right thing per kind", () => {
    expect(waitingAction(parseWaitingRun(INTERRUPT)!)).toBe("Answer");
    expect(waitingAction(parseWaitingRun(PARK)!)).toBe("Provide inputs");
  });
});

describe("isOverdue", () => {
  const row = parseWaitingRun(INTERRUPT)!;

  it("is false before the deadline and true after it", () => {
    expect(isOverdue(row, Date.parse("2026-08-28T10:00:00Z"))).toBe(false);
    expect(isOverdue(row, Date.parse("2026-08-30T10:00:00Z"))).toBe(true);
  });

  it("is false when there is no deadline — silence is not lateness", () => {
    expect(isOverdue(parseWaitingRun(PARK)!)).toBe(false);
  });
});
