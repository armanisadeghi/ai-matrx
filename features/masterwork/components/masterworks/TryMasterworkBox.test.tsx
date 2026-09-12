/**
 * AN ERRORED RUN SETTLES FROM ITS OWN TERMINAL EVENT.
 *
 * The original guard (2026-08-18) drove a captured `onEvent` from the old
 * `attachWorkflowRun` thunk. That thunk is gone: the box now adopts its run
 * through the Run Stream Adapter, and every status fact reaches it through the
 * `workflowRuns` slice. The suite went dead at that rename (recorded in
 * FOUND_DEFECTS 2026-08-28) and is rewritten here to drive the STORE, which is
 * where the live terminal event now lands.
 *
 * What it still guards is the same defect, and the defect was live again: the
 * box asked the GENERATED `TERMINAL_RUN_STATUSES`, which answers the ENGINE's
 * "can this resume?" question and excludes `errored`. So a run the engine
 * recorded as errored left this box spinning — nothing told the caller, no
 * failure was explained, and only a row-poll recovery backstop could ever
 * settle the screen. `runIsOver` (features/workflow-runtime/types.ts) is the
 * watcher's question and the box asks that now.
 *
 * Only TRANSPORT is stubbed: the adapter thunk is replaced by one that
 * attaches the run the way the real adapter's first step does, and the test
 * then folds a real `run_errored` event through the real reducer.
 *
 * ── WALL W15 (Expert Book Challenge, 2026-09-10) ───────────────────────────
 * The box remembered the last run id in sessionStorage and RE-ATTACHED to it
 * on mount without asking whether it was still going. A run that had errored
 * or completed came back wearing "Working…", with nothing on screen to say it
 * was old; and when the Expert pressed Run, the new run started server-side
 * while the box stayed on the dead id. So the remembered id is a CANDIDATE
 * now: the row is read first, a run that `runIsOver` is forgotten rather than
 * adopted, a freshly started run always replaces it, and the box says which
 * run it is showing. The added tests below guard exactly that.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import type { UnknownAction } from "@reduxjs/toolkit";

import { makeStore } from "@/lib/redux/store";
import { applyRunEvent } from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import { TryMasterworkBox } from "./TryMasterworkBox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// The served input controls measure themselves; jsdom has no ResizeObserver.
// Layout machinery, not the behaviour under test.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let adoptedRunId: string | null = null;
const getMasterworkRunVerdict = jest.fn();
const getMasterworkDefinition = jest.fn();
/** The sealed-case lane's two DB reads. The NODE DETECTION stays real — it is
 *  the thing under test, and a stubbed detector would prove nothing. */
const toastError = jest.fn();
const rulebookIdForMasterwork = jest.fn();
const listSealedCases = jest.fn();

// TRANSPORT ONLY. The real adapter opens SSE/pollers against the server; its
// first step is `attachRun`, and that is the part this test needs so the real
// reducer will accept the run's events.
jest.mock("@/features/workflow-runtime/redux/adopt-workflow-run.thunk", () => ({
  adoptWorkflowRun:
    ({ runId }: { runId: string }) =>
    (dispatch: (action: UnknownAction) => void) => {
      adoptedRunId = runId;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const slice = require("@/features/workflow-runtime/redux/workflow-runs.slice") as {
        attachRun: (payload: { runId: string }) => UnknownAction;
      };
      dispatch(slice.attachRun({ runId }));
      return {
        runId,
        stop: () => undefined,
        ensureLane: () => null,
      };
    },
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: () => ({ type: "test/call-api" }),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => <textarea aria-label="Masterwork input" />,
}));

jest.mock("@/features/rich-document/RichDocument", () => ({
  RichDocument: () => <div>Rendered verdict</div>,
}));

/**
 * A HARNESS AROUND THE REAL PICKER, never a replacement for it: the real
 * `SealedCasePicker` still renders (the tests below assert its own copy), and
 * the harness only adds a way for a test to make the choice a person makes
 * with a mouse, plus a readout of what the box is currently holding. Stubbing
 * the picker itself would mean asserting against the stub.
 */
jest.mock("../../unfolding/SealedCasePicker", () => {
  const actual = jest.requireActual("../../unfolding/SealedCasePicker");
  return {
    ...actual,
    SealedCasePicker: (props: {
      state: { status: string; cases?: { id: string }[] };
      value: string | null;
      onChange: (id: string) => void;
    }) => (
      <>
        <actual.SealedCasePicker {...props} />
        {props.state.status === "ready"
          ? (props.state.cases ?? []).map((item) => (
              <button
                key={item.id}
                data-harness={`choose-${item.id}`}
                onClick={() => props.onChange(item.id)}
              >
                choose {item.id}
              </button>
            ))
          : null}
        <span data-harness="chosen-case">{props.value ?? ""}</span>
      </>
    ),
  };
});

jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    message: jest.fn(),
  },
}));

jest.mock("../../unfolding/sealedCases", () => ({
  ...jest.requireActual("../../unfolding/sealedCases"),
  rulebookIdForMasterwork: (...args: unknown[]) =>
    rulebookIdForMasterwork(...args),
  listSealedCases: (...args: unknown[]) => listSealedCases(...args),
}));

jest.mock("../../service", () => ({
  getMasterworkDefinition: (...args: unknown[]) =>
    getMasterworkDefinition(...args),
  getMasterworkRunVerdict: (...args: unknown[]) =>
    getMasterworkRunVerdict(...args),
}));

jest.mock("@/features/workflow-runtime/run-failure-explanation", () => ({
  // The real primitive takes the WHOLE error record; the stub mirrors that so
  // this test would catch a caller that went back to passing one string.
  explainRunFailure: (input: unknown, whatItRuns: string) => ({
    headline: `${whatItRuns} stopped`,
    nextStep: "Try again.",
    technical:
      typeof input === "string"
        ? input
        : ((input as { message?: string } | null)?.message ?? null),
    unrecognized: false,
    action: null,
    cause: (input as { cause?: string } | null)?.cause ?? null,
  }),
}));

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  store = makeStore();
  adoptedRunId = null;
  getMasterworkRunVerdict.mockReset();
  getMasterworkDefinition.mockReset();
  getMasterworkDefinition.mockResolvedValue(null);
  toastError.mockReset();
  rulebookIdForMasterwork.mockReset();
  listSealedCases.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

/** The engine's own run_errored event, as the durable log records it. */
function runErrored(runId: string, message: string): WorkflowRunEvent {
  return {
    ts: new Date().toISOString(),
    event: "run_errored",
    run_id: runId,
    status: "errored",
    steps_executed: 1,
    node_id: "draft",
    step: 1,
    attempt: 1,
    error_type: "WorkerRejected",
    error_message: message,
    checkpoint_id: null,
  } as WorkflowRunEvent;
}

const MASTERWORK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function renderBox(
  onRunFinished: jest.Mock,
  onCompare?: (candidate: string) => void,
  masterworkId: string = MASTERWORK_ID,
) {
  return act(async () => {
    root.render(
      <Provider store={store}>
        <TryMasterworkBox
          masterworkId={masterworkId}
          masterworkKind="edit"
          onRunFinished={onRunFinished}
          onCompare={onCompare}
        />
      </Provider>,
    );
  });
}

/** The re-attach check reads the run row before adopting anything. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("settles an errored run from its live terminal event without the row-poll recovery alarm", async () => {
  const masterworkId = MASTERWORK_ID;
  const runId = RUN_ID;
  sessionStorage.setItem(`matrx.masterwork.run.${masterworkId}`, runId);
  // The remembered run is still GOING — that is what makes it rejoinable at
  // all. Its row is read once to decide that, and again for the explanation
  // once the live terminal event lands.
  getMasterworkRunVerdict
    .mockResolvedValueOnce({ status: "running", error: null })
    .mockResolvedValue({
      status: "errored",
      error: { message: "The worker rejected the input." },
    });
  const onRunFinished = jest.fn();
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await renderBox(onRunFinished);
  await settle();

  // A LIVE remembered run is rejoined, and the box says which run it is.
  expect(adoptedRunId).toBe(runId);
  expect(container.textContent).toContain(
    "Rejoined the run you started earlier",
  );
  expect(onRunFinished).not.toHaveBeenCalled();

  await act(async () => {
    store.dispatch(
      applyRunEvent({
        runId,
        event: runErrored(runId, "The worker rejected the input."),
        seq: 1,
        replay: false,
      }),
    );
  });

  expect(onRunFinished).toHaveBeenCalledTimes(1);
  // Settled by the EVENT: the SECOND row read is the explanation read (the
  // first was the re-attach check), not a recovery poll that had to notice on
  // its own.
  expect(getMasterworkRunVerdict).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Your Masterwork stopped");
  expect(container.textContent).toContain("The worker rejected the input.");
  expect(consoleError).not.toHaveBeenCalled();
});

it("never re-attaches to a remembered run that is already OVER", async () => {
  sessionStorage.setItem(`matrx.masterwork.run.${MASTERWORK_ID}`, RUN_ID);
  // THE DEFECT: this run errored minutes ago. The box used to adopt it on the
  // first render and wear "Working…" with nothing to say it was old.
  getMasterworkRunVerdict.mockResolvedValue({
    status: "errored",
    error: { message: "The worker rejected the input." },
  });
  const onRunFinished = jest.fn();

  await renderBox(onRunFinished);
  await settle();

  expect(adoptedRunId).toBeNull();
  // Forgotten, so a later mount cannot resurrect it either.
  expect(
    sessionStorage.getItem(`matrx.masterwork.run.${MASTERWORK_ID}`),
  ).toBeNull();
  expect(container.textContent).not.toContain("Working…");
  expect(container.textContent).not.toContain("Rejoined the run");
  // Nothing finished while this box was watching, so nobody is told one did.
  expect(onRunFinished).not.toHaveBeenCalled();
  // The re-attach question is CLOSED, not left hanging — the other half of
  // the defect was a box still holding a dead id when the Expert pressed Run.
  expect(container.textContent).not.toContain("Checking");
});

it("forgets a remembered run whose row cannot be read at all", async () => {
  sessionStorage.setItem(`matrx.masterwork.run.${MASTERWORK_ID}`, RUN_ID);
  getMasterworkRunVerdict.mockResolvedValue(null);

  await renderBox(jest.fn());
  await settle();

  expect(adoptedRunId).toBeNull();
  expect(
    sessionStorage.getItem(`matrx.masterwork.run.${MASTERWORK_ID}`),
  ).toBeNull();
  expect(container.textContent).not.toContain("Working…");
});

/**
 * ── WALL W33 (Expert Book Challenge, 2026-09-12) ───────────────────────────
 * THE DEFECT: the Audition door was opened off the terminal step's STORED
 * output only. The engine's `output.to_frontend` node EMITS the restructured
 * shape and returns its INPUT unchanged as its output (by design — routing
 * must not change), so the Verification Desk's `{ruling, verdict_pack}` never
 * reached `output`. Live run cdd2eb12-60a0-4d74-8e88-da38e94e257a completed
 * with `ruling.verdict = "NOT REAL"` on the wire, showed no door, and printed
 * "Runs land in your recent runs below." where the reason belonged.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first — `readPresentedResult` ignoring `node_emitted` payloads (drop the
 *    emitted branch and the door never opens);
 *  · second — a completed run with nothing to judge falling back to the idle
 *    filler sentence instead of saying why.
 *
 * Only TRANSPORT is stubbed. The events below are the engine's own frames,
 * folded through the real reducer into the real store.
 */

/** The Verification Desk's shape: an io.user_input step then the to_frontend
 *  handover, exactly as a programmatic definition carries it (`type` on the
 *  node, no builder-written `data.spec_type`). */
const DESK_DEFINITION = {
  nodes: [
    { id: "ask", type: "io.user_input", data: { label: "The claim" } },
    { id: "present", type: "output.to_frontend", data: { label: "The ruling" } },
  ],
  edges: [{ source: "ask", target: "present" }],
};

/** node_completed for the to_frontend step: it passes its INPUT through. */
function presentCompleted(
  runId: string,
  output: Record<string, unknown>,
): WorkflowRunEvent {
  return {
    ts: new Date().toISOString(),
    event: "node_completed",
    run_id: runId,
    step: 2,
    node_id: "present",
    spec_type: "output.to_frontend",
    attempt: 1,
    duration_ms: 12,
    output,
    output_kind: null,
    output_kind_ok: null,
    output_kind_errors: null,
    output_kind_version: null,
    output_kind_degraded: null,
    metadata: null,
    wrapper: null,
  } as WorkflowRunEvent;
}

/** The node_emitted frame to_frontend sends in `restructured` mode. */
function presentEmitted(
  runId: string,
  payload: Record<string, unknown>,
): WorkflowRunEvent {
  return {
    ts: new Date().toISOString(),
    event: "node_emitted",
    run_id: runId,
    step: 2,
    node_id: "present",
    attempt: 1,
    mode: "restructured",
    payload,
    component_ref: null,
    surface: "workflow",
    title: null,
    presentation: "panel",
    kind: null,
    kind_ok: null,
    metadata: null,
  } as WorkflowRunEvent;
}

function runCompleted(runId: string): WorkflowRunEvent {
  return {
    ts: new Date().toISOString(),
    event: "run_completed",
    run_id: runId,
    status: "completed",
    steps_executed: 2,
    last_outputs: {},
    channel_values: {},
  } as WorkflowRunEvent;
}

/** Rejoin a live run, then fold the terminal frames it produces. */
async function runToCompletion(
  events: WorkflowRunEvent[],
  onCompare?: (candidate: string) => void,
) {
  sessionStorage.setItem(`matrx.masterwork.run.${MASTERWORK_ID}`, RUN_ID);
  getMasterworkRunVerdict.mockResolvedValue({ status: "running", error: null });
  getMasterworkDefinition.mockResolvedValue(DESK_DEFINITION);

  await renderBox(jest.fn(), onCompare);
  await settle();
  expect(adoptedRunId).toBe(RUN_ID);

  await act(async () => {
    events.forEach((event, index) => {
      store.dispatch(
        applyRunEvent({ runId: RUN_ID, event, seq: index + 1, replay: false }),
      );
    });
  });
  await settle();
}

it("opens the Audition door from the PRESENTED payload when the terminal step stored no result key", async () => {
  const onCompare = jest.fn();
  await runToCompletion(
    [
      // What to_frontend RETURNS: its input, untouched. No result key in sight.
      presentCompleted(RUN_ID, {
        claim: "The photo shows a flood in Rio.",
        evidence_items: 4,
      }),
      // What to_frontend PRESENTS: the restructured ruling.
      presentEmitted(RUN_ID, {
        ruling: {
          verdict: "NOT REAL",
          headline: "The photo is from a 2011 flood in Thailand.",
          reasoning: "Reverse image search puts it in Bangkok, eight years earlier.",
        },
        verdict_pack: { confidence: "high" },
      }),
      runCompleted(RUN_ID),
    ],
    onCompare,
  );

  expect(container.textContent).toContain("Judge this against your own work");
  // …and the idle filler is gone the moment a run has finished.
  expect(container.textContent).not.toContain(
    "Runs land in your recent runs below.",
  );

  const door = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Judge this against your own work"),
  );
  await act(async () => {
    door?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // An OBJECT-shaped ruling reaches the Audition as the text a person reads:
  // verdict, then headline, then reasoning — never "[object Object]".
  expect(onCompare).toHaveBeenCalledWith(
    "NOT REAL\n\nThe photo is from a 2011 flood in Thailand.\n\nReverse image search puts it in Bangkok, eight years earlier.",
  );
});

it("says WHY there is nothing to judge when neither the presented payload nor the stored output carries a result", async () => {
  const onCompare = jest.fn();
  await runToCompletion(
    [
      presentCompleted(RUN_ID, { claim: "The photo shows a flood in Rio." }),
      presentEmitted(RUN_ID, { notes: "Nothing conclusive.", sources: [] }),
      runCompleted(RUN_ID),
    ],
    onCompare,
  );

  expect(container.textContent).not.toContain(
    "Judge this against your own work",
  );
  // NEVER the idle filler on a finished run.
  expect(container.textContent).not.toContain(
    "Runs land in your recent runs below.",
  );
  expect(container.textContent).toContain(
    "This Masterwork's final step returned no ruling, deliverable or report",
  );
  // The honest line names what it DID return, so the builder can fix it.
  expect(container.textContent).toContain("notes, sources");
});

/**
 * ── THE SEALED CASE (unfolding-case contract §5, 2026-09-12) ───────────────
 * A Masterwork whose workflow carries a `masterwork.case.disclose` node is a
 * DESK: it works a case it has never seen, so the box must offer the
 * Rulebook's sealed cases and send the chosen one as `case_item_id`.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — the picker failing to appear on a definition that HAS the
 *    oracle node (a desk with no way to point it at a case);
 *  · second — the picker leaking onto every ordinary Masterwork, asking for a
 *    sealed case that has nothing to do with the run.
 */

/** A desk: user input → the case oracle → the ruling handover. */
const ORACLE_DEFINITION = {
  nodes: [
    { id: "ask", type: "io.user_input", data: { label: "The opening" } },
    {
      id: "oracle",
      type: "masterwork.case.disclose",
      data: { label: "Ask the case" },
    },
    { id: "present", type: "output.to_frontend", data: { label: "The ruling" } },
  ],
  edges: [
    { source: "ask", target: "oracle" },
    { source: "oracle", target: "present" },
  ],
};

it("offers the sealed cases when the definition carries the case-oracle node", async () => {
  getMasterworkDefinition.mockResolvedValue(ORACLE_DEFINITION);
  rulebookIdForMasterwork.mockResolvedValue("rb-1");
  listSealedCases.mockResolvedValue([
    { id: "case-1", label: "The 61-year-old with a headache", published: "2019" },
  ]);

  await renderBox(jest.fn());
  await settle();
  await settle();

  expect(rulebookIdForMasterwork).toHaveBeenCalledWith(MASTERWORK_ID);
  expect(
    container.querySelector('[data-masterwork-sealed-case="picker"]'),
  ).not.toBeNull();
  expect(container.textContent).toContain(
    "Which sealed case should it work?",
  );
  expect(listSealedCases).toHaveBeenCalledWith("rb-1");
  // A desk WITH cases never shows the empty-state remedy — that sentence is
  // true only when the Rulebook holds none.
  expect(container.textContent).not.toContain("holds no sealed cases yet");
  // The options themselves live in the Select's portal (closed here), and the
  // READER is only ever told the label + date: this box never fetches, holds
  // or renders the sealed timeline (THE WITHHOLDING LAW) — `listSealedCases`
  // selects no `raw_value`/`metadata` column at all.
});

it("never asks for a sealed case on a Masterwork with no case-oracle node", async () => {
  getMasterworkDefinition.mockResolvedValue(DESK_DEFINITION);
  rulebookIdForMasterwork.mockResolvedValue("rb-1");
  listSealedCases.mockResolvedValue([]);

  await renderBox(jest.fn());
  await settle();
  await settle();

  expect(rulebookIdForMasterwork).not.toHaveBeenCalled();
  expect(listSealedCases).not.toHaveBeenCalled();
  expect(
    container.querySelector('[data-masterwork-sealed-case="picker"]'),
  ).toBeNull();
  expect(container.textContent).not.toContain("sealed case");
});

/**
 * ── THE CHOSEN CASE BELONGS TO THIS DESK (Bugbot, PR #222, 2026-09-12) ─────
 * `caseItemId` was never cleared when the box was pointed at a different
 * Masterwork or a different disclose node, so a reused box could start the
 * NEXT desk against the PREVIOUS Masterwork's sealed case — a run against a
 * case from another Rulebook entirely, with nothing on screen to say so.
 *
 * ONE-LINE BUG THIS TEST CATCHES: dropping the render-time reset, so the
 * previous desk's case id survives the change of Masterwork. The other half of
 * the fix — the start guard requiring the id to be ON the list this desk is
 * offering — is `chosenSealedCaseIsCurrent`, forced in
 * `unfolding/sealedCases.test.ts` (the Run button here is disabled until the
 * served input surface resolves, which is a network read this suite stubs
 * nothing for).
 */
const OTHER_MASTERWORK_ID = "33333333-3333-4333-8333-333333333333";

it("forgets the chosen sealed case when the box is pointed at another Masterwork", async () => {
  getMasterworkDefinition.mockResolvedValue(ORACLE_DEFINITION);
  rulebookIdForMasterwork.mockResolvedValue("rb-1");
  listSealedCases.mockResolvedValue([
    { id: "case-a", label: "The first desk's case", published: "2019" },
  ]);

  await renderBox(jest.fn());
  await settle();
  await settle();

  const choose = container.querySelector<HTMLButtonElement>(
    '[data-harness="choose-case-a"]',
  );
  await act(async () => {
    choose?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(
    container.querySelector('[data-harness="chosen-case"]')?.textContent,
  ).toBe("case-a");

  // The SAME box, now showing a different Masterwork with its own cases.
  rulebookIdForMasterwork.mockResolvedValue("rb-2");
  listSealedCases.mockResolvedValue([
    { id: "case-b", label: "The second desk's case", published: "2021" },
  ]);
  await renderBox(jest.fn(), undefined, OTHER_MASTERWORK_ID);
  await settle();
  await settle();

  expect(
    container.querySelector('[data-harness="chosen-case"]')?.textContent,
  ).toBe("");
  expect(listSealedCases).toHaveBeenLastCalledWith("rb-2");
});
