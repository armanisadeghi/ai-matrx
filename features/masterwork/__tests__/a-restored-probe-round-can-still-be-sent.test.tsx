/**
 * A RESTORED PROBE ROUND CAN STILL BE SENT — AND NEVER FAILS SILENTLY.
 *
 * The break this catches (cold walk 3, 2026-09-16, live-confirmed by a
 * first-time Expert): on `/masterwork/<id>/probe` a round restored from the
 * durable-run pointer put the example, the counter and the answer box back on
 * screen while `caseBrief` — mount-local `useState("")` — came back EMPTY. So
 * `send()`'s opening `if (caseBriefProblem) return;` fired on every press of
 * "Send this and show me the next one" and "I'd never see that — stop here":
 * no request, no error, no loading state, and the critique the Expert had just
 * typed vanished.
 *
 * The forcing function is the REAL component driven over the REAL durable-run
 * hook: a round is launched and settled in one mount, that mount is thrown
 * away exactly as a refresh throws it away, and a SECOND mount rejoins the run
 * off the pointer the first one really wrote. Nothing about the restore is
 * hand-built — only the transport is faked, which is the one thing a client
 * test may fake.
 *
 * Two inputs with DIFFERENT expected values, so no constant satisfies both:
 *  1. the receipt carries the case brief → the press SENDS, and the request
 *     carries that exact brief and the typed critique;
 *  2. the receipt does not (a run started before the brief rode with it) →
 *     the press sends NOTHING and the screen SAYS why, in place.
 *
 * Production changes that make this fail: dropping the memo from the run
 * pointer, not handing it back on restore, not reading it back into
 * `caseBrief`, or turning the guard back into a bare `return`.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockDispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => undefined,
  useAppStore: () => ({ dispatch: mockDispatch, getState: () => ({}) }),
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: Record<string, unknown>) => request,
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({ adoptForeignStream: jest.fn() }),
);

jest.mock(
  "@/features/agents/redux/execution-system/active-requests/active-requests.slice",
  () => ({ removeRequest: jest.fn() }),
);

jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useFloatingLiveRun: jest.fn(),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

/** The knobs are a DB read; this screen's behaviour under them is not what
 *  this test is about, so the rows answer with the declared values. */
jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: async () => 5,
  knobBool: async () => false,
}));

/**
 * The two heavy presentation dependencies, replaced by the plain elements they
 * wrap. They are what the screen CALLS, never what it IS: the state, the
 * guard, the request and the restore all stay real. The stand-ins keep the
 * exact contract the component relies on — `value` / `onChange` / `disabled`
 * for the box, the body text for the document — so a component that stopped
 * honouring either would still fail here.
 */
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: {
    id?: string;
    value: string;
    disabled?: boolean;
    onChange: (e: { target: { value: string } }) => void;
  }) => (
    <textarea
      id={props.id}
      value={props.value}
      disabled={props.disabled}
      onChange={props.onChange}
    />
  ),
}));

jest.mock("@/features/rich-document/RichDocument", () => ({
  RichDocument: (props: { content: string }) => <div>{props.content}</div>,
}));

import { MASTERWORK_RUN_WIRE } from "@/features/masterwork/durable-run/useMasterworkRun";

import { BadExampleProbe } from "../probe/BadExampleProbe";
import type { Rulebook } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK_ID = "3f7c1f52-7b3e-4a2f-9c11-2b6a7d2e4a01";
const RUN_ID = "8a51d0c4-9d77-4a52-9a3f-1c5d2e9f0b33";
const POINTER_KEY = `${MASTERWORK_RUN_WIRE.pointerPrefix}probe:${RULEBOOK_ID}`;
const REJOIN_PATH = "/masterworks/runs/{run_id}/rejoin";
const PROBE_PATH = "/masterworks/probe";

/** The Expert's own words, and the ones the fix has to bring back. */
const CASE_BRIEF =
  "Deciding whether a pallet of mixed office electronics goes to data destruction or straight to sorting";
const CRITIQUE =
  "Nobody routes on the manifest alone — you open the pallet first, and if the drives are already pulled the whole thing changes.";

const RULEBOOK = {
  id: RULEBOOK_ID,
  organization_id: "6b2f9d18-4c55-4e77-9c31-70a3c5e1d442",
  name: "Data destruction — routing",
} as unknown as Rulebook;

/** The terminal document the server sends for round 1, shape-for-shape. */
const ROUND_ONE = {
  type: "masterwork_probe_round",
  rulebook_id: RULEBOOK_ID,
  rulebook_version: 3,
  round_index: 1,
  round_count: 5,
  done: false,
  done_reason: "",
  example_title: "Pallet 4471 — routing decision",
  example_body: "Manifest lists 18 desktops. Routed straight to sorting.",
  probe_label: "manifest_trusted_without_inspection",
  rules_added: 2,
  rule_ids: ["b1a0f1d6-1f66-4a1e-9a02-3b2c5d6e7f80"],
  duplicates_skipped: 0,
  quotes_verified: 2,
  quotes_unverified: 0,
  already_distilled: [],
  answered_rounds: 0,
};

type StreamRequest = {
  path: string;
  body?: Record<string, unknown>;
  onStreamEvent?: (event: {
    event: "data";
    data: Record<string, unknown>;
  }) => void;
};

/** Every probe request that actually reached the wire, in order. */
let sent: Record<string, unknown>[] = [];

function serveTheProbe(): void {
  mockDispatch.mockImplementation(async (request: StreamRequest) => {
    if (request.path === PROBE_PATH) {
      sent.push(request.body ?? {});
      request.onStreamEvent?.({
        event: "data",
        data: { type: "masterwork_run", run_id: RUN_ID },
      });
      request.onStreamEvent?.({ event: "data", data: ROUND_ONE });
      return { data: null, error: null };
    }
    if (request.path === REJOIN_PATH) {
      // The durable row, read back exactly as a reload reads it.
      request.onStreamEvent?.({
        event: "data",
        data: {
          type: "masterwork_run_snapshot",
          run_id: RUN_ID,
          status: "completed",
          error: null,
          result: ROUND_ONE,
        },
      });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

interface Mounted {
  container: HTMLElement;
  unmount: () => Promise<void>;
}

async function mountProbe(): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<BadExampleProbe rulebook={RULEBOOK} canEdit />);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Type into a controlled textarea the way a person does. */
async function type(
  container: HTMLElement,
  id: string,
  value: string,
): Promise<void> {
  const box = container.querySelector<HTMLTextAreaElement>(`#${id}`);
  if (!box) throw new Error(`no #${id} on screen`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonSaying(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => (button.textContent ?? "").includes(text));
  if (!match) throw new Error(`no button saying "${text}" on screen`);
  return match;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Run a whole first round for real, so the pointer on disk is one the
 *  production code wrote — never one this test invented. */
async function runRoundOneThenLeave(): Promise<void> {
  const first = await mountProbe();
  await type(first.container, "probe-case", CASE_BRIEF);
  await click(buttonSaying(first.container, "Write the first one"));
  expect(first.container.textContent).toContain("Round 1 of 5");
  await first.unmount();
}

describe("a probe round restored from the durable run", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    sent = [];
    serveTheProbe();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sends the next round, carrying the case brief the probe was started with", async () => {
    await runRoundOneThenLeave();
    expect(sent).toHaveLength(1);

    // The refresh: a brand new mount with nothing but the pointer.
    const back = await mountProbe();
    expect(back.container.textContent).toContain("Round 1 of 5");
    expect(back.container.textContent).toContain("Pallet 4471");

    await type(back.container, "probe-critique", CRITIQUE);
    await click(buttonSaying(back.container, "Send this and show me the next one"));

    expect(sent).toHaveLength(2);
    const next = sent[1] as {
      case_brief: string;
      rounds: { critique: string }[];
      finish: boolean;
    };
    expect(next.case_brief).toBe(CASE_BRIEF);
    expect(next.rounds[next.rounds.length - 1]?.critique).toBe(CRITIQUE);
    expect(next.finish).toBe(false);

    await back.unmount();
  });

  it("stopping on a restored round sends the finish too", async () => {
    await runRoundOneThenLeave();
    const back = await mountProbe();
    await type(back.container, "probe-critique", CRITIQUE);
    await click(buttonSaying(back.container, "I'd never see that"));

    expect(sent).toHaveLength(2);
    expect((sent[1] as { finish: boolean }).finish).toBe(true);
    expect((sent[1] as { case_brief: string }).case_brief).toBe(CASE_BRIEF);

    await back.unmount();
  });

  it("says why, in place, when the brief really cannot be brought back", async () => {
    await runRoundOneThenLeave();
    // A receipt written before the brief rode with it — the one case where the
    // restore genuinely has nothing. The press must still not be silent.
    const pointer = JSON.parse(localStorage.getItem(POINTER_KEY) ?? "{}");
    delete pointer.memo;
    localStorage.setItem(POINTER_KEY, JSON.stringify(pointer));

    const back = await mountProbe();
    await type(back.container, "probe-critique", CRITIQUE);
    await click(buttonSaying(back.container, "Send this and show me the next one"));

    expect(sent).toHaveLength(1);
    expect(back.container.textContent).toContain(
      "We couldn't bring back what you told us this probe was about",
    );
    // …and the way out is open: the case box is no longer locked.
    const box = back.container.querySelector<HTMLTextAreaElement>("#probe-case");
    expect(box?.disabled).toBe(false);

    await back.unmount();
  });
});
