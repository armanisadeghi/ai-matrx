/**
 * A conversation's working-document version history opens IN THE CANVAS — one
 * `working-document-history` tab per conversation, beside the document — never
 * a docked panel or a drawer of its own.
 *
 * Drives the app's REAL chat canvas port over the root reducer and its ONE
 * canvas binding: the History button's press opens the tab (pressed while in
 * front), the next press closes it. The document's controls and panel are read
 * from source: one that mounts its own history panel again goes RED.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * the body case is RED; against the docked-panel era the source case is RED.
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
import { WORKING_DOCUMENT_HISTORY_KIND } from "@ai-matrx/chat/host/canvas-tabs";
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
jest.mock("@ai-matrx/chat/agents/components/working-document/WorkingDocumentVersionHistory", () => ({
  WorkingDocumentVersionHistory: ({ conversationId }: { conversationId: string }) => (
    <p data-wd-history="">{conversationId}</p>
  ),
}));

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("History toggles the conversation's version-history tab, pressed while in front", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { tab: ChatCanvasTab | null } = { tab: null };
  function HistoryButton() {
    seen.tab = appChatCanvasPort.useTab({ kind: WORKING_DOCUMENT_HISTORY_KIND, key: "c-1" });
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
              <HistoryButton />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const id = `${WORKING_DOCUMENT_HISTORY_KIND}::c-1`;

  act(() => seen.tab?.toggle({ title: "Version history", data: { conversationId: "c-1" } }));
  await flush();
  expect(store.getState().canvasHost.items[id]).toBeDefined();
  expect(seen.tab?.isVisible).toBe(true);
  expect(document.querySelector("[data-wd-history]")?.textContent).toBe("c-1");

  act(() => seen.tab?.toggle({ title: "Version history", data: { conversationId: "c-1" } }));
  expect(store.getState().canvasHost.items[id]).toBeUndefined();
  act(() => root.unmount());
  container.remove();
});

it("the document's History button opens the canvas tab — the panel mounts no history of its own", () => {
  const dir = join(__dirname, "..", "..", "..", "..", "aidream", "apps", "shared", "chat", "src", "agents", "components", "working-document");
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  expect(read("WorkingDocumentViewControls.tsx")).toContain("WORKING_DOCUMENT_HISTORY_KIND");
  expect(read("WorkingDocumentPanel.tsx")).not.toContain("WorkingDocumentVersionHistory");
  const body = read("WorkingDocumentVersionHistory.tsx");
  expect(body).not.toContain("MatrxDynamicPanelHost");
  expect(body).not.toContain("DrawerContent");
});
