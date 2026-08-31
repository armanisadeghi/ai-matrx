/**
 * THE RUN PANEL ITSELF — the two honesty defects, proven on the real component.
 *
 * `features/mandates/__tests__/run-honesty.test.tsx` pins the pieces (the
 * counted notes block, the whole-refusal read). This file pins the SURFACE the
 * V3 round-4 honesty pass actually walked: the mandate workspace's "Run this
 * job" panel.
 *
 *   1. A 200 whose `notes` carry the `mandate_consumption_map_no_op` scream
 *      must SHOW that sentence. It used to arrive and vanish.
 *   2. A 409 must leave the refusal IN THE PANEL. It used to clear the panel
 *      and put the server's sentence in a toast the person had to race.
 *
 * Only the seams are mocked — the network call, the served input surface, and
 * the heavy render children the answer would go through. The panel's own logic
 * is the thing under test.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

// One value answers every selector this panel reads: super-admin (truthy), the
// viewer's user id and their organization id.
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => "viewer-1",
  // `ProTextarea`'s agent action reads the store object itself.
  useAppStore: () => ({
    getState: () => ({}),
    dispatch: jest.fn(),
    subscribe: () => () => undefined,
  }),
}));

jest.mock("../../input-surface", () => {
  const actual = jest.requireActual("../../input-surface");
  return {
    ...actual,
    useMandateInputSurface: () => ({
      status: "ready",
      surface: {
        mandateKey: "mandate.goal_writer",
        provisionKey: null,
        surfaceSource: "mandate_inputs",
        holderName: null,
        acceptsUserInput: true,
        inputs: [],
        notes: [],
      },
    }),
  };
});

jest.mock("../../test-run", () => {
  const actual = jest.requireActual("../../test-run");
  return { ...actual, runMandateAdHocTest: jest.fn() };
});

// Heavy render children — the answer's pipeline is not what this file tests,
// and it is pinned by the content-ir suites.
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
jest.mock(
  "@/components/official/structured-value/StructuredValueView",
  () => ({
    StructuredValueView: () => <div>structured</div>,
  }),
);
jest.mock(
  "@/features/agents/components/inputs/input-components/VariableInputComponent",
  () => ({ VariableInputComponent: () => <div /> }),
);
// The free-text box drags the whole agent-action / context-menu tree in; it is
// an input this panel forwards, not behaviour this file tests.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: { value: string }) => <textarea readOnly value={props.value} />,
}));

import { RunThisJobSection } from "../RunThisJobSection";
import { MandateRunRefusal, runMandateAdHocTest } from "../../test-run";
import type { MandateWorkspaceData } from "../useMandateWorkspaceData";

const mockedRun = runMandateAdHocTest as unknown as jest.Mock;

const NO_OP_SCREAM =
  "The consumption map on this binding did nothing: none of its sources " +
  "produced a value, so the run used the holder's own defaults instead.";

const UNFULFILLED =
  "variable binding blocks this run: no Holder is bound for this job at any " +
  "rung — bind an agent or a workflow to it and run again.";

/** Only what this panel reads off the workspace data. */
const DATA = {
  mandate: { mandate_key: "mandate.goal_writer" },
} as unknown as MandateWorkspaceData;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Press "Run it" and let the mocked call settle. */
async function pressRun() {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Run it"),
  );
  if (!button) throw new Error("The run button is not on the panel.");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function render() {
  act(() => {
    root.render(<RunThisJobSection data={DATA} />);
  });
}

it("SHOWS the no-op scream a 200 carried, counted, on the result panel", async () => {
  mockedRun.mockResolvedValue({
    id: "r1",
    created_at: "2026-08-31T00:00:00Z",
    mandate_key: "mandate.goal_writer",
    exemplar_id: null,
    candidate_id: "c1",
    candidate_label: "Run this job",
    provenance: "user",
    is_version: false,
    output: "A goal.",
    duration_ms: 1200,
    structural: { checked: false, ok: true, errors: [] },
    notes: [NO_OP_SCREAM],
  });
  render();
  await pressRun();
  const text = container.textContent ?? "";
  expect(text).toContain(NO_OP_SCREAM);
  expect(text).toContain("What this run did — 1 note");
});

it("KEEPS a 409 refusal in the panel instead of clearing it to nothing", async () => {
  mockedRun.mockRejectedValue(
    new MandateRunRefusal({
      message: UNFULFILLED,
      status: 409,
      code: "mandate_unfulfilled",
      requestId: "req-9",
    }),
  );
  render();
  await pressRun();
  const text = container.textContent ?? "";
  // The panel — not a toast — carries the refusal.
  expect(
    container.querySelector("[data-testid='mandate-run-failure']"),
  ).not.toBeNull();
  expect(text).toContain(UNFULFILLED);
  expect(text).toContain("409");
  expect(text).toContain("mandate_unfulfilled");
  expect(text).toContain("Refused — nothing fulfils this job yet");
});

it("replaces the refusal when the next run succeeds — never stacks stale verdicts", async () => {
  mockedRun.mockRejectedValueOnce(
    new MandateRunRefusal({ message: UNFULFILLED, status: 409 }),
  );
  render();
  await pressRun();
  expect(container.textContent).toContain(UNFULFILLED);

  mockedRun.mockResolvedValueOnce({
    id: "r2",
    created_at: "2026-08-31T00:00:00Z",
    mandate_key: "mandate.goal_writer",
    exemplar_id: null,
    candidate_id: "c2",
    candidate_label: "Run this job",
    provenance: "user",
    is_version: false,
    output: "A goal.",
    duration_ms: 900,
    structural: { checked: false, ok: true, errors: [] },
    notes: [],
  });
  await pressRun();
  const text = container.textContent ?? "";
  expect(text).not.toContain(UNFULFILLED);
  expect(text).toContain("A goal.");
});
