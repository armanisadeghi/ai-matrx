/**
 * A sent message's context receipt opens IN THE CANVAS — one
 * `message-context-receipt` tab per message, the full receipt table with each
 * value's delivered text one click in — never a cramped popover.
 *
 * Drives the app's REAL chat canvas port over the root reducer and its ONE
 * canvas binding (body mocked). The pill is read from source: a receipt that
 * opens a popover again goes RED.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * the body case is RED; against the popover receipt the source case is RED.
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
import { MESSAGE_CONTEXT_RECEIPT_KIND } from "@ai-matrx/chat/host/canvas-tabs";
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
jest.mock("@ai-matrx/chat/agents/components/context-policies-display/MessageContextReceipt", () => ({
  MessageContextReceiptView: ({ messageId }: { messageId: string }) => <p data-diff-body="">{messageId}</p>,
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

it("the receipt pill opens the message's receipt tab; again closes it", async () => {
  const store = makeStore();
  const seen: { tab: ChatCanvasTab | null } = { tab: null };
  function Pill() {
    seen.tab = appChatCanvasPort.useTab({ kind: MESSAGE_CONTEXT_RECEIPT_KIND, key: "m-1" });
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
  const open = { title: "Sent values · 3", data: { conversationId: "c-1", messageId: "m-1" } };

  act(() => seen.tab?.toggle(open));
  await flush();
  expect(ids()).toContain(`${MESSAGE_CONTEXT_RECEIPT_KIND}::m-1`);
  expect(seen.tab?.isVisible).toBe(true);
  expect(document.querySelector("[data-diff-body]")?.textContent).toBe("m-1");

  act(() => seen.tab?.toggle(open));
  expect(ids()).not.toContain(`${MESSAGE_CONTEXT_RECEIPT_KIND}::m-1`);
  act(() => root.unmount());
  container.remove();
});

it("the receipt pill toggles the canvas tab — no popover", () => {
  const src = join(__dirname, "..", "..", "..", "..", "aidream", "apps", "shared", "chat", "src", "agents", "components");
  const receipt = readFileSync(join(src, "context-policies-display/MessageContextReceipt.tsx"), "utf8");
  expect(receipt).not.toContain("PopoverContent");
  expect(receipt).toContain("kind: MESSAGE_CONTEXT_RECEIPT_KIND, key: messageId");
  const message = readFileSync(join(src, "messages-display/user/AgentUserMessage.tsx"), "utf8");
  expect(message).toContain("messageId={messageId}");
});
