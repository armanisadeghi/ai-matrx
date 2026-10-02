import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => "default",
}));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({
  openOverlay: jest.fn(),
}));
jest.mock("@/components/loaders/ShimmerText", () => ({
  ShimmerText: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({ selectToolDisplayPreference: jest.fn() }),
);
jest.mock("../registry/registry", () => ({
  getInlineRenderer: jest.fn(),
  getToolDisplayName: jest.fn(() => "Test tool"),
  getToolPhaseLabel: jest.fn(() => "Ran test tool"),
  getHeaderSubtitle: jest.fn(() => null),
  getToolDisplayMode: jest.fn(() => "auto"),
  getToolGlyph: jest.fn(() => ({ icon: () => null, accent: "slate" })),
  getToolChrome: jest.fn(() => "line"),
  hasCustomRenderer: jest.fn(),
}));
jest.mock("../renderers/_shared-entity/ToolGlyph", () => ({
  ToolGlyph: () => <span data-testid="tool-glyph" />,
}));
jest.mock("../db-renderer/useDbToolMeta", () => ({
  useDbToolRendererState: jest.fn(),
}));
jest.mock("../db-renderer/toolRendererCache", () => ({
  prefetchToolRenderer: jest.fn(),
}));
jest.mock("../renderers/useAutoScrollOnStream", () => ({
  useAutoScrollOnStream: () => ({ current: null }),
}));
jest.mock("./toolCardUiSession", () => ({
  getToolCardUserChoice: () => null,
  setToolCardUserChoice: jest.fn(),
  markToolCardLive: jest.fn(),
  wasToolCardLive: () => false,
}));
jest.mock("../result-fields/ToolErrorCard", () => ({
  ToolErrorCard: () => <div>tool error</div>,
}));
jest.mock("./ToolUpdatesOverlay", () => ({
  ToolUpdatesOverlay: () => null,
}));
jest.mock("../registry/toolArtifact", () => ({
  getToolArtifact: () => null,
}));
jest.mock("./ArtifactResultBar", () => ({
  ArtifactResultBar: () => null,
}));

import {
  getInlineRenderer,
  hasCustomRenderer,
} from "../registry/registry";
import { useDbToolRendererState } from "../db-renderer/useDbToolMeta";
import { ToolCallVisualization } from "./ToolCallVisualization";

const mockGetInlineRenderer = getInlineRenderer as jest.MockedFunction<
  typeof getInlineRenderer
>;
const mockHasCustomRenderer = hasCustomRenderer as jest.MockedFunction<
  typeof hasCustomRenderer
>;
const mockUseDbToolRendererState =
  useDbToolRendererState as jest.MockedFunction<
    typeof useDbToolRendererState
  >;

/**
 * A complete lifecycle entry, built without a cast: a partial object forced
 * through `as ToolLifecycleEntry` hid every field the component may read
 * (`displayName` is the primary label it renders), so the test proved the
 * collapse behaviour against a shape the reducer never produces.
 */
function entry(result: unknown = { secret: "raw detail" }): ToolLifecycleEntry {
  return {
    callId: "call-generic-collapse",
    toolName: "unregistered_tool",
    displayName: "unregistered_tool",
    status: "completed",
    arguments: { query: "test" },
    startedAt: "2026-09-18T00:00:00.000Z",
    completedAt: "2026-09-18T00:00:01.000Z",
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

function mount(element: React.ReactNode): {
  container: HTMLDivElement;
  rerender: (next: React.ReactNode) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function toolBody(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="tool-body"]');
}

describe("ToolCallVisualization generic fallback disclosure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInlineRenderer.mockReturnValue(() => (
      <div data-testid="tool-body">raw detail</div>
    ));
  });

  it("keeps a confirmed generic body hidden until the condensed row is clicked", () => {
    mockUseDbToolRendererState.mockReturnValue({
      meta: null,
      resolution: "generic",
    });
    mockHasCustomRenderer.mockReturnValue(false);

    const view = mount(
      <ToolCallVisualization entries={[entry()]} isPersisted={false} />,
    );

    expect(toolBody(view.container)).toBeNull();
    const row = view.container.querySelector("button");
    expect(row?.textContent).toContain("Ran test tool");
    act(() => row?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(toolBody(view.container)).not.toBeNull();

    view.rerender(
      <ToolCallVisualization
        entries={[entry({ secret: "updated raw detail" })]}
        isPersisted={false}
      />,
    );
    expect(toolBody(view.container)).not.toBeNull();
    view.unmount();
  });

  it("does not change the live-open behavior of an in-code custom renderer", () => {
    mockUseDbToolRendererState.mockReturnValue({
      meta: null,
      resolution: "generic",
    });
    mockHasCustomRenderer.mockReturnValue(true);

    const view = mount(
      <ToolCallVisualization entries={[entry()]} isPersisted={false} />,
    );

    expect(toolBody(view.container)).not.toBeNull();
    view.unmount();
  });

  it("does not collapse a custom DB renderer when its async lookup resolves", () => {
    mockUseDbToolRendererState.mockReturnValue({
      meta: null,
      resolution: "resolving",
    });
    mockHasCustomRenderer.mockReturnValue(false);
    const view = mount(
      <ToolCallVisualization entries={[entry()]} isPersisted={false} />,
    );
    expect(toolBody(view.container)).not.toBeNull();

    mockUseDbToolRendererState.mockReturnValue({
      meta: {
        displayName: "DB tool",
        resultsLabel: null,
        subtitle: null,
        displayMode: null,
      },
      resolution: "custom",
    });
    mockHasCustomRenderer.mockReturnValue(true);
    view.rerender(
      <ToolCallVisualization entries={[entry()]} isPersisted={false} />,
    );

    expect(toolBody(view.container)).not.toBeNull();
    view.unmount();
  });
});
