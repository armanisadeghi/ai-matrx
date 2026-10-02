/**
 * A grouped batch that holds a surface write follows `diff_start_open`.
 *
 * Verifier round 1 (2026-09-26): `ToolCallBatch` decided open/closed from the
 * verbose/minimal preference alone, so a failed patch plus its retry — grouped
 * into one batch — folded away on reload even with the knob on. Use case: a
 * clinic manager's intake checklist edited in two calls.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let knob: unknown = true;
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

import { ToolCallBatch } from "../../components/ToolCallBatch";
import { SURFACE_WRITE_STEP } from "../readSurfaceWrite";

function entry(callId: string, withReceipt: boolean): ToolLifecycleEntry {
  return {
    callId,
    toolName: "context_patch",
    displayName: "context_patch",
    status: "completed",
    arguments: {},
    startedAt: "2026-09-26T00:00:00Z",
    completedAt: "2026-09-26T00:00:01Z",
    latestMessage: null,
    latestData: null,
    result: {},
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: withReceipt
      ? [
          {
            event: "tool_step",
            call_id: callId,
            tool_name: "context_patch",
            data: {
              step: SURFACE_WRITE_STEP,
              metadata: {
                target_type: "note",
                mode: "patch",
                before: "- Take blood pressure",
                after: "- Take blood pressure (seated)",
              },
            },
          },
        ]
      : [],
  };
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

describe("a reloaded batch holding a surface write", () => {
  it("stays open when diff_start_open is on", () => {
    knob = true;
    const el = renderBatch([entry("a", false), entry("b", true)]);
    expect(el.querySelector("[data-testid=cards]")).not.toBeNull();
  });

  it("folds when diff_start_open is off", () => {
    knob = false;
    const el = renderBatch([entry("a", false), entry("b", true)]);
    expect(el.querySelector("[data-testid=cards]")).toBeNull();
  });

  it("a batch with no write keeps the default (folded on reload)", () => {
    knob = true;
    const el = renderBatch([entry("a", false), entry("b", false)]);
    expect(el.querySelector("[data-testid=cards]")).toBeNull();
  });
});
