/**
 * A TOOL CALL WAITING ON A PERSON SAYS SO (OpenSEO Wave 1, Lane L, 2026-09-28).
 *
 * `seo_keywords.research` parked its own call on an `approve_spend` request. The chat drew it
 * as "Completed. No output was captured for this call." (or, with the row loaded, a spinner
 * saying "Working…") — both lies about a call nobody has answered. Parked on a person, the
 * card names the wait on its line and mounts the ask itself, open, whatever the fold default;
 * once the call is answered the ordinary card takes over.
 *
 * RED before the lane: TOOL_CALL_VISUALIZATION_UNDER_TEST points at the HEAD copy.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let suspended: string[] | undefined;
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  // The suspension selector is tagged; every other selector reads "default".
  useAppSelector: (sel: { suspendedFor?: string }) =>
    sel?.suspendedFor ? suspended : "default",
}));
jest.mock(
  "@/features/agents/redux/execution-system/active-requests/active-requests.selectors",
  () => ({
    selectSuspendedCallIds: (requestId: string) =>
      Object.assign(() => undefined, { suspendedFor: requestId }),
  }),
);
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: jest.fn() }));
jest.mock("@/components/loaders/ShimmerText", () => ({
  ShimmerText: ({ text }: { text: string }) => <span data-testid="shimmer">{text}</span>,
}));
jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({ selectToolDisplayPreference: jest.fn() }),
);
jest.mock(
  "@/features/agents/redux/execution-system/observability/observability.selectors",
  () => ({ selectCorrectedToolCallIds: () => () => new Set<string>() }),
);
jest.mock("../../registry/registry", () => ({
  getInlineRenderer: jest.fn(() => () => (
    <div data-testid="generic-body">Completed. No output was captured for this call.</div>
  )),
  getToolDisplayName: jest.fn(() => "Seo Keywords"),
  getToolPhaseLabel: jest.fn(() => "Seo Keywords"),
  getHeaderSubtitle: jest.fn(() => null),
  getToolDisplayMode: jest.fn(() => "auto"),
  getToolGlyph: jest.fn(() => ({ icon: () => null, accent: "slate" })),
  getToolChrome: jest.fn(() => "line"),
  hasCustomRenderer: jest.fn(() => false),
}));
jest.mock("../../renderers/_shared-entity/ToolGlyph", () => ({ ToolGlyph: () => null }));
jest.mock("../../db-renderer/useDbToolMeta", () => ({
  useDbToolRendererState: () => ({ meta: null, resolution: "generic" }),
}));
jest.mock("../../db-renderer/toolRendererCache", () => ({ prefetchToolRenderer: jest.fn() }));
jest.mock("../../renderers/useAutoScrollOnStream", () => ({
  useAutoScrollOnStream: () => ({ current: null }),
}));
jest.mock("../toolCardUiSession", () => ({
  getToolCardUserChoice: () => null,
  setToolCardUserChoice: jest.fn(),
  markToolCardLive: jest.fn(),
  wasToolCardLive: () => false,
}));
jest.mock("../../result-fields/ToolErrorCard", () => ({ ToolErrorCard: () => <div>tool error</div> }));
jest.mock("../ToolUpdatesOverlay", () => ({ ToolUpdatesOverlay: () => null }));
jest.mock("../../registry/toolArtifact", () => ({ getToolArtifact: () => null }));
jest.mock("../ArtifactResultBar", () => ({ ArtifactResultBar: () => null }));
jest.mock("@/features/action-requests/components/ParkedOnPersonCard", () => ({
  ParkedOnPersonCard: ({ actionRequestId }: { actionRequestId: string | null }) => (
    <div data-testid="parked-ask">{actionRequestId ?? "newest-open-ask"}</div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ToolCallVisualization } = require(
  process.env.TOOL_CALL_VISUALIZATION_UNDER_TEST ?? "../ToolCallVisualization",
) as typeof import("../ToolCallVisualization");

const REQUEST = "09322c83-d5ab-403b-b29e-f38ea6149b4d";

function entry(over: Partial<ToolLifecycleEntry> = {}): ToolLifecycleEntry {
  return {
    callId: "toolu_018c26HaYp5NH7YjxGT3rpvZ",
    toolName: "seo_keywords",
    displayName: "seo_keywords",
    status: "started",
    arguments: { action: "research" },
    startedAt: "2026-09-28T23:04:55.992Z",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    parkedOn: { kind: "action_request", actionRequestId: REQUEST },
    events: [],
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(entries: ToolLifecycleEntry[], requestId?: string): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <ToolCallVisualization
        entries={entries}
        isPersisted={!requestId}
        {...(requestId ? { requestId } : {})}
      />,
    ),
  );
  return host;
}

beforeEach(() => {
  suspended = undefined;
});

it("a reloaded call parked on a person is drawn as waiting, with the ask open beneath it", () => {
  const el = render([entry()]);
  expect(el.textContent).toContain("Waiting for you");
  expect(el.querySelector("[data-testid=parked-ask]")?.textContent).toBe(REQUEST);
  expect(el.textContent).not.toContain("Completed. No output was captured");
  expect(el.textContent).not.toContain("Working");
  // Waiting is not working: the line does not shimmer.
  expect(el.querySelector("[data-testid=shimmer]")).toBeNull();
});

it("once the call is answered, the ordinary card takes over", () => {
  const el = render([
    entry({ status: "completed", parkedOn: null, result: { status: "answered" } }),
  ]);
  expect(el.textContent).not.toContain("Waiting for you");
  expect(el.querySelector("[data-testid=parked-ask]")).toBeNull();
});

it("live, the turn suspended on a call no client was handed: waiting, not working", () => {
  suspended = ["toolu_018c26HaYp5NH7YjxGT3rpvZ"];
  const el = render([entry({ parkedOn: undefined })], "req-live");
  expect(el.textContent).toContain("Waiting for you");
  expect(el.querySelector("[data-testid=parked-ask]")?.textContent).toBe("newest-open-ask");
  expect(el.querySelector("[data-testid=shimmer]")).toBeNull();
});

it("live, a call handed to a client (a browser tool) is not a person's ask", () => {
  suspended = ["toolu_018c26HaYp5NH7YjxGT3rpvZ"];
  const el = render([entry({ parkedOn: undefined, isDelegated: true })], "req-live");
  expect(el.textContent).not.toContain("Waiting for you");
  expect(el.querySelector("[data-testid=parked-ask]")).toBeNull();
});

it("live, a call still running is still working", () => {
  suspended = undefined;
  const el = render([entry({ parkedOn: undefined })], "req-live");
  expect(el.textContent).not.toContain("Waiting for you");
  expect(el.querySelector("[data-testid=shimmer]")).not.toBeNull();
});
