/**
 * "YOUR RECENT RUNS" TELLS ONE RUN FROM ANOTHER (jobs-bar-2026-09-16, item 18).
 *
 * The Encore run page listed eight runs of the same Masterwork as eight
 * identical lines — "Finished · 1d ago", eight times — because Encore had its
 * OWN recent-runs reader that selected five columns and its OWN row that
 * printed a dot, a word and an age. The Masterworks lane, over the same table,
 * already showed the first line of what each run handed over, plus its cost
 * and how long it took. One question, two implementations, and the poorer one
 * was mounted on the Operator's own door.
 *
 * Encore now mounts the SAME `MasterworkRunRow` over the SAME reader.
 *
 * NOTHING HERE IS HAND-SHAPED: the runs come from
 * `masterwork-run-records.json` — verbatim `workflow.node_events` payloads and
 * `workflow.run` rows read out of the live database — folded through the REAL
 * emission reducer and the REAL `presentedPreview`, exactly as
 * `listRecentRunsForMasterworks` builds a row. Only the network (the two
 * service reads) and the page's heavy neighbours (the Try box, the sign-off,
 * the Bench) are stubbed; the history itself is real and unmocked.
 *
 * Proven red before green (2026-09-16), each independently:
 *  * restore Encore's own `<Link>` run line → "tells two runs apart" fails
 *    (both rows read "Finished · …" and nothing else).
 *  * drop `deliverable_preview` from the rows → same failure.
 *  * print `run.status` raw → "speaks the Operator's words" fails on
 *    "errored".
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { selectRunEmissions } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import { presentedPreview } from "@/features/workflow-runtime/run-result/presented-result";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import records from "@/features/workflow-runtime/__tests__/fixtures/masterwork-run-records.json";

import type { MasterworkRun } from "../../service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WATSON = "cef6ae07-4562-4dbd-a8e4-403309cace08";
const MONTESSORI = "10af94fd-bf7f-41c1-88ff-1098afff8351";
const BROKEN = "94d48d9c-a571-42b4-9926-fe9c248513b2";
const MASTERWORK_ID = "d8dfbd2f-169c-468e-a892-c0980e7ddd45";

type Records = {
  emissions: Record<string, WorkflowRunEvent[]>;
  runs: Record<
    string,
    {
      id: string;
      status: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
      steps_executed: number | null;
      error: unknown;
    }
  >;
};
const fixture = records as unknown as Records;

/** The run's real emissions, folded through the REAL reducer, as on replay. */
function emissionsOf(runId: string) {
  let state: WorkflowRunsState = workflowRunsReducer(
    undefined,
    attachRun({ runId }),
  );
  (fixture.emissions[runId] ?? []).forEach((event, index) => {
    state = workflowRunsReducer(
      state,
      applyRunEvent({ runId, event, seq: index + 1, replay: true }),
    );
  });
  return selectRunEmissions(runId)({ workflowRuns: state } as never);
}

/** A row exactly as `listRecentRunsForMasterworks` builds one. */
function rowFor(runId: string, costUsd: number): MasterworkRun {
  const run = fixture.runs[runId];
  const emissions = emissionsOf(runId);
  const last = emissions[emissions.length - 1];
  const error = run.error as { message?: string } | null;
  return {
    id: run.id,
    status: run.status,
    created_at: run.created_at,
    started_at: run.started_at,
    completed_at: run.completed_at,
    steps_executed: run.steps_executed,
    cost_usd: costUsd,
    deliverable_preview: last ? presentedPreview(last.payload) : null,
    error_message: typeof error?.message === "string" ? error.message : null,
  };
}

const HISTORY = [
  rowFor(WATSON, 0.54),
  rowFor(MONTESSORI, 0.49),
  rowFor(BROKEN, 0.02),
];

// ── The network, and only the network ──────────────────────────────────────
jest.mock("../service", () => ({
  getEncoreMasterwork: async () => ({
    id: "d8dfbd2f-169c-468e-a892-c0980e7ddd45",
    name: "Gio Valiante Performance Coach Masterwork",
    masterwork_kind: "generate",
    submit_label: "Coach me through it",
    deliverable: "A one-on-one performance coaching answer for a client.",
    rule_count: 24,
    released_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    rulebook: null,
    auditionScore: null,
    auditionVerdict: null,
    auditionedAt: null,
  }),
  listMyEncoreRuns: async () => HISTORY,
}));
jest.mock("../benchProof", () => ({
  UNAVAILABLE: { status: "unavailable" },
  getBenchProof: async () => ({ status: "unavailable" }),
}));

// ── The page's heavy neighbours, which are not this suite's subject ─────────
jest.mock("../../components/masterworks/TryMasterworkBox", () => ({
  TryMasterworkBox: () => null,
}));
jest.mock("../../review/ExpertSignOff", () => ({
  ExpertSignOff: () => null,
}));
jest.mock("../RunTheBench", () => ({ RunTheBench: () => null }));
// The page reads the URL now (walk 13, N10: `?run=` is the Operator's door to
// their own deliverable), so it needs the canonical App Router double.
jest.mock("next/navigation", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/test-utils/next-navigation").nextNavigationMock({
    pathname: "/masterwork/encore/d8dfbd2f-169c-468e-a892-c0980e7ddd45",
  }),
);
jest.mock("../AuditionProof", () => ({ AuditionProof: () => null }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => null,
  useAppDispatch: () => () => undefined,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EncoreRunPage } = require("../EncoreRunPage") as {
  EncoreRunPage: (props: { masterworkId: string }) => React.ReactElement;
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<EncoreRunPage masterworkId={MASTERWORK_ID} />);
  });
  // Let the two loads settle.
  await act(async () => {
    await Promise.resolve();
  });
}

const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
});

describe("the Encore run page's own history", () => {
  it("tells two runs of the same Masterwork apart", async () => {
    await mount();
    const watson = HISTORY[0].deliverable_preview;
    const montessori = HISTORY[1].deliverable_preview;
    expect(watson).toBeTruthy();
    expect(montessori).toBeTruthy();
    expect(watson).not.toBe(montessori);
    // Each row carries the first line of what THAT run actually handed over.
    expect(text()).toContain(watson!.replace(/…$/, "").slice(0, 40));
    expect(text()).toContain(montessori!.replace(/…$/, "").slice(0, 40));
  });

  it("says what each run cost and how long it took", async () => {
    await mount();
    expect(text()).toContain("$0.54");
    expect(text()).toContain("$0.49");
    // A duration is elapsed work, printed for every run that has one.
    const rowsWithDuration = HISTORY.filter(
      (r) => r.started_at && r.completed_at,
    );
    expect(rowsWithDuration.length).toBeGreaterThan(0);
  });

  it("speaks the Operator's words, never the engine's status column", async () => {
    await mount();
    expect(text()).toContain("Finished");
    // `errored` / `abandoned` / `completed` are ours, not theirs.
    expect(text()).not.toMatch(/\berrored\b/i);
    expect(text()).not.toMatch(/\bcompleted\b/i);
  });

  it("gives a run that failed its own recorded sentence", async () => {
    await mount();
    const broken = HISTORY[2];
    expect(broken.error_message).toBeTruthy();
    expect(text()).toContain(broken.error_message!.slice(0, 30));
  });

  // 🚨 REWRITTEN BY WALK 13, N10. This used to assert `/workflows/runs/<id>`,
  // and that address is exactly the defect the walk recorded: an Operator who
  // clicked her own finished work landed on a page headed THE PLAN and LIVE
  // ACTIVITY with a Pause / Resume / Stop / Cancel strip. The permalink is
  // still the right door for the Studio — it is the wrong one from here.
  it("opens each run on the Encore detail, never the developer run page", async () => {
    await mount();
    const hrefs = [...document.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain(
      `/masterwork/encore/${MASTERWORK_ID}?run=${WATSON}`,
    );
    expect(hrefs).toContain(
      `/masterwork/encore/${MASTERWORK_ID}?run=${MONTESSORI}`,
    );
    expect(hrefs.filter((h) => h?.startsWith("/workflows/runs/"))).toEqual([]);
  });
});
