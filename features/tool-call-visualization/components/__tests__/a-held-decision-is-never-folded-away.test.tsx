/**
 * A RELOADED BATCH HOLDING A DECISION FOR THE PERSON NEVER FOLDS IT AWAY (lane HANDOVER, 2026-09-27).
 *
 * In Cedar Ridge Physical Therapy's chat, admin asked the assistant to add a "Hydrotherapy Pool"
 * room; it proposed two columns, each held for approval. Live, the cards showed. After a reload
 * both sat inside a folded "Records · 2 calls" line — two questions for the person, hidden. A
 * batch that carries a held write mounts open, whatever the fold default.
 *
 * RED before the lane: TOOL_CALL_BATCH_UNDER_TEST points at the HEAD copy.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let knob: unknown = false;
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  useSessionKnob: () => knob,
  getSessionKnob: () => knob,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "default",
  useAppDispatch: () => jest.fn(),
}));
jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({ selectToolDisplayPreference: jest.fn() }),
);
jest.mock("@/components/loaders/ShimmerText", () => ({
  ShimmerText: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock("../../registry/registry", () => ({ getToolDisplayName: () => "Context" }));
jest.mock("../../db-renderer/useDbToolMeta", () => ({ useDbToolMeta: () => null }));
jest.mock("../../components/toolCardUiSession", () => ({
  getToolCardUserChoice: () => null,
  setToolCardUserChoice: jest.fn(),
  markToolCardLive: jest.fn(),
  wasToolCardLive: () => false,
}));
jest.mock("../../renderers/fs/FsInline", () => ({ asFsListing: () => null, FsBatchCard: () => null }));
jest.mock("../../renderers/cloud-browser/CloudBrowserRunCard", () => ({ CloudBrowserRunCard: () => null }));
jest.mock("../../renderers/cloud-browser/cloudBrowserRun", () => ({ isCloudBrowserRun: () => false }));
jest.mock("../../components/agentWorkTurn", () => ({ useCloudBrowserTurnRun: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ToolCallBatch } = require(process.env.TOOL_CALL_BATCH_UNDER_TEST ?? "../ToolCallBatch") as typeof import("../ToolCallBatch");
import captured from "@/features/record-change-approvals/__tests__/fixtures/awaiting-approval.captured.json";

function entry(callId: string, result: unknown): ToolLifecycleEntry {
  return {
    callId, toolName: "records", displayName: "records", status: "completed", arguments: {},
    startedAt: "2026-09-27T20:58:00Z", completedAt: "2026-09-27T20:58:02Z", latestMessage: null,
    latestData: null, result, resultPreview: null, errorType: null, errorMessage: null,
    isDelegated: false, events: [],
  } as ToolLifecycleEntry;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function renderBatch(entries: ToolLifecycleEntry[]): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <ToolCallBatch entries={entries} isPersisted>
        <div data-testid="cards">cards</div>
      </ToolCallBatch>,
    ),
  );
  return host;
}

it("a reloaded batch with a held column stays open", () => {
  const held = (captured as { approve: { result: unknown } }).approve.result;
  const el = renderBatch([entry("a", held), entry("b", held)]);
  expect(el.querySelector("[data-testid=cards]")).not.toBeNull();
});

it("a reloaded batch with nothing held keeps the fold", () => {
  const el = renderBatch([entry("a", { rows: [] }), entry("b", { rows: [] })]);
  expect(el.querySelector("[data-testid=cards]")).toBeNull();
});
