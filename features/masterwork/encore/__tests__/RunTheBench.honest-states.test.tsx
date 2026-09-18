/**
 * THE BENCH DOOR'S BUTTON STATES ARE HONEST — a forcing function.
 *
 * `RunTheBench` is the one control in the product that can start a trial that
 * spends real money across six arms and then makes, or refuses to make, a
 * claim about whether a Masterwork beat the best anyone can buy. Four ways it
 * could lie, each of which this suite fails on:
 *
 *   1. A greyed or silent control when the server says a trial cannot start
 *      here. A screen is absent or honest, never dead — so the server's own
 *      reason is rendered verbatim and NOTHING claims it can start a run.
 *   2. Letting a person spend on a run they cannot rejoin without telling them
 *      first. When the server reports the run is files-only, that sentence
 *      appears BEFORE the start control, not after the money is gone.
 *   3. Hiding the arms behind a spinner. Each arm's cost and seconds appear as
 *      it lands.
 *   4. Printing a corpus count the server never took. The read half does not
 *      assemble the corpus (that scrapes pages and reads documents), so the
 *      count is null there — and a null rendered as "0 sources" is a
 *      fabricated fact, not a rounding.
 *   5. THE TWO VERDICTS THAT ARE NOT RESULTS. A void trial proves nothing and
 *      must render no win at all; a panel that failed calibration means the
 *      trial was NOT SCORED — which is not a fail.
 *
 * The run machinery is not under test here (it has its own suites); the hook
 * is stubbed so each screen state can be held still and read.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
  BenchProofState,
  BenchRunFormWire,
  BenchVerdictWire,
} from "../benchProof";

// The dialog renders inline so its content is readable in the test host —
// the same shim the repo's other dialog suites use.
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => (
    <textarea
      id={props.id as string}
      value={props.value as string}
      onChange={props.onChange as () => void}
    />
  ),
}));
jest.mock("@/lib/durable-run/DurableRunFailure", () => ({
  DurableRunFailure: ({ error }: { error: string | null }) =>
    error ? <p>{error}</p> : null,
}));
jest.mock("@/lib/durable-run/DurableRunInterruption", () => ({
  DurableRunInterruption: () => null,
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));

type RunStub = {
  running: boolean;
  stage: string | null;
  // The real durable-run handle (`lib/durable-run/useDurableRun.ts`) always
  // carries `stages: string[]` — a mock missing it is incomplete, not the
  // component's fault, for any consumer that reads it (`RunStages`).
  stages: string[];
  waitMessage: string | null;
  result: BenchVerdictWire | null;
  error: string | null;
  stoppedMessage: string | null;
  interruption: null;
  retry: null;
  reset: () => void;
  launch: () => Promise<void>;
  onDomainEvent?: (name: string, data: Record<string, unknown>) => void;
};

const runStub: RunStub = {
  running: false,
  stage: null,
  stages: [],
  waitMessage: null,
  result: null,
  error: null,
  stoppedMessage: null,
  interruption: null,
  retry: null,
  reset: jest.fn(),
  launch: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: (options: {
    onDomainEvent?: (name: string, data: Record<string, unknown>) => void;
  }) => {
    runStub.onDomainEvent = options.onDomainEvent;
    return runStub;
  },
}));

import { RunTheBench } from "../RunTheBench";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const NO_MASTERWORK_REASON =
  "No Masterwork has been built from this Rulebook yet — arm C is the " +
  "product's real run path, so there is no trial without one.";

const NOT_DURABLE_NOTE =
  "This trial is not recorded as a run you can come back to: if you refresh " +
  "or close this tab you lose the live view, and it keeps spending until it " +
  "finishes.";

const FORM: BenchRunFormWire = {
  budget_multiple: 100,
  budget_multiple_source:
    "The Bench's own default — a hundred times what your Masterwork costs.",
  judge_model: "claude-opus-5",
  frontier_model: "claude-opus-5",
  cheap_model: "claude-haiku-4-5",
  masterwork_id: "mw-1",
  masterwork_name: "Watson on shoes",
  // null is what the READ half actually sends — counting the corpus costs
  // money, so it is not counted until a trial starts.
  corpus_sources: null,
  corpus_note:
    "The frontier arms get this Rulebook's own pre-engagement material. The " +
    "sources are gathered when you start it, and the run says how many it found.",
  durable: false,
  durable_note: NOT_DURABLE_NOTE,
};

const CANNOT_RUN: BenchProofState = {
  status: "none",
  reason: "No bench proof yet.",
  canRunHere: false,
  form: null,
  howToRun: NO_MASTERWORK_REASON,
  running: null,
};

const CAN_RUN: BenchProofState = {
  status: "none",
  reason: "No bench proof yet.",
  canRunHere: true,
  form: FORM,
  howToRun: "",
  running: null,
};

function verdict(over: Partial<BenchVerdictWire>): BenchVerdictWire {
  return {
    trial_id: "TB-x-01",
    passed: false,
    void: false,
    not_scored: false,
    void_reason: "",
    not_scored_reason: "",
    win_claimed: null,
    win_rationale: "",
    arm: "a2",
    budget_multiple: 100,
    panel_winner: "gt",
    panel_votes: 3,
    gt_in_pool: true,
    gt_won: true,
    c_cost_usd: 0.42,
    c_seconds: 96,
    total_cost_usd: 4.2,
    record_path: null,
    report_path: null,
    row_id: null,
    stored: false,
    storage_note: "",
    headline: "Bench trial TB-x-01 finished.",
    ...over,
  };
}

describe("the Bench door never lies about what it can do", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    runStub.running = false;
    runStub.stage = null;
    runStub.waitMessage = null;
    runStub.result = null;
    runStub.error = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (bench: BenchProofState) =>
    act(() => {
      root.render(<RunTheBench rulebookId="rb-1" bench={bench} />);
    });

  it("cannot run here: says why in the server's own words, and offers no control that claims otherwise", () => {
    render(CANNOT_RUN);
    expect(host.textContent ?? "").toContain(NO_MASTERWORK_REASON);
    // Not a greyed button, not a button that does nothing — no control at all.
    expect(host.querySelectorAll("button").length).toBe(0);
    expect(host.querySelectorAll("a").length).toBe(0);
    expect(host.textContent ?? "").not.toContain("Run the trial");
  });

  it("a run that cannot be rejoined says so BEFORE the start control", () => {
    render(CAN_RUN);
    act(() => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
    const text = host.textContent ?? "";
    expect(text).toContain(NOT_DURABLE_NOTE);
    // "Before" is positional, not a figure of speech: the sentence has to be
    // above the control, where a person reads it before they spend.
    const start = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Run the trial",
    );
    expect(start).toBeTruthy();
    const noteIndex = text.indexOf(NOT_DURABLE_NOTE);
    const startIndex = text.indexOf("Run the trial");
    expect(noteIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeLessThan(startIndex);
    // And the consequence of the click is named, not a generic "are you sure".
    expect(text).toContain("real, paid model calls across all six arms");
  });

  it("an uncounted corpus says the rule, never \"0 sources\"", () => {
    render(CAN_RUN);
    act(() => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
    const text = host.textContent ?? "";
    // The READ half does not assemble the corpus (it would scrape and read
    // documents just to draw a page), so the count is null there — and a null
    // rendered as a number would be a fabricated fact.
    expect(text).toContain(FORM.corpus_note);
    expect(text).not.toContain("0 pre-engagement");
    expect(text).not.toContain("null");

    // With a real count — which only a started trial produces — it is shown.
    act(() => {
      root.render(
        <RunTheBench
          rulebookId="rb-1"
          bench={{
            ...CAN_RUN,
            form: { ...FORM, corpus_sources: 12 },
          }}
        />,
      );
    });
    expect(host.textContent ?? "").toContain("12 pre-engagement sources");
  });

  it("while running, each finished arm shows what it is, what it cost and how long it took", () => {
    render(CAN_RUN);
    act(() => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
    runStub.running = true;
    // The real handle sets BOTH in one update (`lib/durable-run/useDurableRun.ts`:
    // `stage: line, stages: [...prev.stages, line]`), so a stub that moves only
    // `stage` is a mock that cannot happen. The assertion below is unchanged —
    // the promise under test is still "the line the server sent is on screen".
    runStub.stage = "Judging arm A2 against the rules.";
    runStub.stages = [...runStub.stages, "Judging arm A2 against the rules."];
    act(() => {
      runStub.onDomainEvent?.("masterwork_bench_arm", {
        type: "masterwork_bench_arm",
        arm: "c",
        label: "C",
        ran: true,
        error: "",
        cost_usd: 0.42,
        seconds: 96,
        model: "matrx",
        note: "",
      });
      runStub.onDomainEvent?.("masterwork_bench_arm", {
        type: "masterwork_bench_arm",
        arm: "a0",
        label: "A0",
        ran: true,
        error: "",
        cost_usd: 1.5,
        seconds: 42,
        model: "claude-opus-5",
      });
    });
    const text = host.textContent ?? "";
    expect(text).toContain("this Masterwork");
    expect(text).toContain("frontier model, raw");
    expect(text).toContain("42.0¢");
    expect(text).toContain("1m 36s");
    expect(text).toContain("$1.50");
    expect(text).toContain("42s");
    expect(text).toContain("Judging arm A2 against the rules.");
    expect(text).toContain("Spent so far: $1.92");
  });

  it("a VOID trial says it proves nothing and renders no win", () => {
    runStub.result = verdict({
      void: true,
      gt_won: false,
      passed: true,
      win_claimed: "quality",
      win_rationale: "C swept the panel three to nil.",
      void_reason: "The expert's own answer placed third of six.",
    });
    render(CAN_RUN);
    act(() => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
    const text = host.textContent ?? "";
    expect(text).toContain("This trial proves nothing");
    expect(text).toContain("The expert's own answer placed third of six.");
    // The claim is not softened, hedged or footnoted — it is not rendered.
    expect(text).not.toContain("quality win claimed");
    expect(text).not.toContain("C swept the panel three to nil.");
    expect(text).not.toContain("passed");
  });

  it("an uncalibrated panel says NOT SCORED, and never reads as a fail", () => {
    runStub.result = verdict({
      not_scored: true,
      passed: false,
      win_claimed: "ceiling",
      win_rationale: "C reached A2's ceiling at a fiftieth of the cost.",
      not_scored_reason: "Only 1 of 3 calibration votes went to the expert.",
    });
    render(CAN_RUN);
    act(() => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
    const text = host.textContent ?? "";
    expect(text).toContain("The panel was not calibrated");
    expect(text).toContain("this trial was not scored");
    expect(text).toContain("not a fail and not a pass");
    expect(text).toContain("Only 1 of 3 calibration votes went to the expert.");
    expect(text).not.toContain("did not pass");
    expect(text).not.toContain("ceiling win claimed");
  });
});
