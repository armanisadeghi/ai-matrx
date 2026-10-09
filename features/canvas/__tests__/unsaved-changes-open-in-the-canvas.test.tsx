/**
 * An agent's unsaved changes open IN THE CANVAS — never a second right-hand
 * panel (Arman, 2026-10-02).
 *
 * Drives the app's REAL chat canvas port (`appChatCanvasPort.useTab`) over the
 * root reducer and its ONE canvas binding: one tab per agent, the body is the
 * package's UnsavedChangesDiff, the save status's eye toggles. The opener is
 * read from source: an AgentSaveStatus that mounts its own panel again goes RED.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * the body case is RED; against the pre-canvas AgentSaveStatus the source
 * case is RED.
 */

import React, { act, useEffect } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn, useCanvas } from "@ai-matrx/canvas/react";
import type { ChatCanvasTab } from "@ai-matrx/chat/host";
import { AGENT_UNSAVED_CHANGES_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { appChatCanvasPort } from "@/features/canvas/host/chatCanvasPort";
import { TooltipProvider } from "@/components/ui/tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/chat/c-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/agents/components/diff/UnsavedChangesDiff", () => ({
  UnsavedChangesDiff: ({ agentId }: { agentId: string }) => <p data-diff-body="">{agentId}</p>,
}));

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("the eye opens the agent's unsaved-changes tab with the diff; again closes it", async () => {
  const store = makeStore();
  const seen: { tab: ChatCanvasTab | null } = { tab: null };
  function Pill() {
    seen.tab = appChatCanvasPort.useTab({ kind: AGENT_UNSAVED_CHANGES_KIND, key: "a-1" });
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <TooltipProvider>
            <CanvasHostProvider>
              <CanvasColumn />
              <PresentedColumn />
              <Pill />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const ids = () => Object.keys(store.getState().canvasHost.items);
  const open = { title: "Unsaved changes", data: { agentId: "a-1" } };

  act(() => seen.tab?.toggle(open));
  await flush();
  expect(ids()).toContain(`${AGENT_UNSAVED_CHANGES_KIND}::a-1`);
  expect(seen.tab?.isVisible).toBe(true);
  expect(document.querySelector("[data-diff-body]")?.textContent).toBe("a-1");

  act(() => seen.tab?.toggle(open));
  expect(ids()).not.toContain(`${AGENT_UNSAVED_CHANGES_KIND}::a-1`);
  act(() => root.unmount());
  container.remove();
});

it("the save status's eye toggles the canvas tab — no docked panel", () => {
  // AgentSaveStatus is a host slot implemented in this repo.
  const source = readFileSync(join(__dirname, "..", "..", "agents/components/shared/AgentSaveStatus.tsx"), "utf8");
  expect(source).not.toContain("MatrxDynamicPanelHost");
  expect(source).not.toContain("<UnsavedChangesDiff");
  expect(source).toContain("kind: AGENT_UNSAVED_CHANGES_KIND, key: agentId");
});
