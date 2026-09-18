/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";

let rawText = "Live agent words";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(null),
}));
jest.mock("../redux/workflow-runs.selectors", () => ({
  selectRunStatus: () => () => "running",
  selectRunError: () => () => null,
  selectRunResult: () => () => null,
  selectRunStickyFacts: () => () => ({}),
}));
jest.mock("@/features/agents/redux/execution-system/active-requests/active-requests.selectors", () => ({
  selectRequest: () => () => ({ currentTextRunRaw: rawText }),
  selectRequestCarriesKindEnvelope: () => () => false,
  selectRequestStreamingPartialValue: () => () => null,
}));
jest.mock("@/features/agents/components/live-run/LiveRunDisplay", () => ({
  LiveRunDisplay: () => <div>Live agent words</div>,
}));
jest.mock("@/features/content-ir/react/slot/KindSlot", () => ({
  KindSlot: ({ kind }: { kind: string }) => <div>Arriving {kind}</div>,
}));

import { InvocationBody } from "../components/readout-parts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const invocation: NodeInvocationState = {
  invocationKey: "n-agent::root:0",
  nodeId: "n-agent",
  specType: "ai.agent.start",
  dispatchId: null,
  itemIndex: 0,
  attempt: 1,
  phase: "running",
  startedAt: null,
  durationMs: null,
  output: null,
  outputKind: null,
  outputKindDeclared: "agent_result",
  outputKindOk: null,
  irEnvelope: null,
  wrapper: null,
  error: null,
  progress: null,
  iteration: null,
  laneRequestId: "streaming-lane",
  textTail: "Live agent words",
  chunksReceived: 30,
  lastStreamKind: "chunk",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  rawText = "Live agent words";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderReadout(kind: string, tail = invocation.textTail): string {
  act(() => {
    root.render(
      <InvocationBody
        runId="75be076b-82b2-4bad-a41e-7749d23804fe"
        invocation={{ ...invocation, outputKindDeclared: kind, textTail: tail }}
      />,
    );
  });
  return container.textContent ?? "";
}

it("shows live agent prose even though its settled result declares an envelope kind", () => {
  expect(renderReadout("agent_result")).toContain("Live agent words");
});

it("keeps a declared structured output behind its arriving kind slot", () => {
  expect(renderReadout("study_notes")).toContain("Arriving study_notes");
  expect(container.textContent).not.toContain("Live agent words");
});

it("keeps an agent's bare JSON behind the arriving slot", () => {
  rawText = '{"title":"Notes","sections":[{"body":"Text"}]}';
  expect(renderReadout("agent_result")).toContain("Arriving agent_result");
  expect(container.textContent).not.toContain("Live agent words");
});

it("recognizes JSON even when the tracked tail begins mid-document", () => {
  rawText = "";
  expect(
    renderReadout("agent_result", "Inside a JSON string \\n\\n with more text"),
  ).toContain("Arriving agent_result");
});

it("keeps prose visible when the agent later gives a JSON example", () => {
  rawText = 'Here is an example:\n```json\n{"title":"Notes","body":"Text"}\n```';
  expect(renderReadout("agent_result")).toContain("Live agent words");
});
