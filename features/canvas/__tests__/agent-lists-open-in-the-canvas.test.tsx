/**
 * A conversation's agent lists (plan · agent tasks · the person's todos) open
 * IN THE CANVAS — never a second right-hand panel (Arman, 2026-10-02).
 *
 * Drives the app's REAL chat canvas port (`appChatCanvasPort.useTab`) over the
 * root reducer and its ONE canvas binding (`CanvasHostProvider` +
 * `<CanvasColumn>`): one tab per conversation, the body is the package's
 * TaskPanel, a press toggles. The openers (the composer rail's Tasks pill and
 * TaskPanelChip) are read from source: one that mounts its own panel again
 * goes RED.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * the body case is RED; against the pre-canvas TaskPanel / rail / chip the
 * source case is RED.
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
import { CONVERSATION_LISTS_KIND, conversationListsTabId } from "@ai-matrx/chat/host/canvas-tabs";
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
jest.mock("@ai-matrx/chat/agents/ui-first-tools/ui/lists/TaskPanel", () => ({
  TaskPanel: ({ conversationId }: { conversationId: string }) => <p data-lists-body="">{conversationId}</p>,
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

it("a press opens the conversation's lists tab with the TaskPanel; again closes it", async () => {
  const store = makeStore();
  const seen: { tab: ChatCanvasTab | null } = { tab: null };
  function Pill() {
    seen.tab = appChatCanvasPort.useTab({ kind: CONVERSATION_LISTS_KIND, key: "c-1" });
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
  const open = { title: "Agent lists", data: { conversationId: "c-1" } };

  act(() => seen.tab?.toggle(open));
  await flush();
  expect(ids()).toContain(conversationListsTabId("c-1"));
  expect(seen.tab?.isVisible).toBe(true);
  expect(document.querySelector("[data-lists-body]")?.textContent).toBe("c-1");

  act(() => seen.tab?.toggle(open));
  expect(ids()).not.toContain(conversationListsTabId("c-1"));
  act(() => root.unmount());
  container.remove();
});

it("every lists opener toggles the canvas tab — none mounts its own panel", () => {
  const src = join(__dirname, "..", "..", "..", "..", "aidream", "apps", "shared", "chat", "src");
  const read = (file: string) => readFileSync(join(src, file), "utf8");
  const panel = read("agents/ui-first-tools/ui/lists/TaskPanel.tsx");
  expect(panel).not.toContain("MatrxDynamicPanelHost");
  expect(panel).toContain("kind: CONVERSATION_LISTS_KIND");
  for (const opener of [
    "agents/ui-first-tools/ui/lists/TaskPanelChip.tsx",
    "agents/components/inputs/smart-input/ConversationContextRail.tsx",
  ]) {
    const source = read(opener);
    expect(source).not.toContain("<TaskPanel");
    expect(source).toContain("useConversationListsTab(conversationId)");
  }
});
