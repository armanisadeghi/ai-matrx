/**
 * THE COMPOSER'S CONTEXT CHIP OPENS IN THE CANVAS (Arman, 2026-10-02: "the
 * icon pill that appears inside the SmartAgent input when there are context
 * items added to a chat — needs to open in the canvas").
 *
 * The chat package reaches the canvas only through the chat host's canvas
 * port; this drives the app's REAL port (`appChatCanvasPort.useTab`) over the
 * app's root reducer and its ONE canvas binding (`CanvasHostProvider`, which
 * registers every kind). One tab per conversation; a press toggles it; a
 * value pill opens it ON that value and the same pill again closes it.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * "the kind is registered" is RED; with `useTab.toggle` opening without the
 * visible check (press twice → still open) "press again closes" is RED.
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import type { CanvasState } from "@ai-matrx/canvas";
import { getCanvasKind, useCanvas } from "@ai-matrx/canvas/react";
import type { ChatCanvasTab } from "@ai-matrx/chat/host";
import {
  CONVERSATION_CONTEXT_KIND,
  conversationContextTabId,
} from "@ai-matrx/chat/host/canvas-tabs";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { appChatCanvasPort } from "@/features/canvas/host/chatCanvasPort";
import { canvasText } from "@/features/canvas/host/toolCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/chat/c-1",
  useRouter: () => ({ push: () => undefined }),
}));

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;
const canvasOf = (store: Store): CanvasState => store.getState().canvasHost;

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

const CONVERSATION = "c-1";
const OPEN = { title: "Notes", data: { conversationId: CONVERSATION, agentId: "a-1", title: "Notes" } };

function mount(store: Store, seen: { tab: ChatCanvasTab | null }) {
  function Probe() {
    seen.tab = appChatCanvasPort.useTab({ kind: CONVERSATION_CONTEXT_KIND, key: CONVERSATION });
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
              <PresentedColumn />
              <Probe />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

describe("the composer's context chip opens in the canvas", () => {
  it("the kind is registered, keyed by the conversation, with a body", () => {
    const store = makeStore();
    const seen: { tab: ChatCanvasTab | null } = { tab: null };
    const unmount = mount(store, seen);
    const kind = getCanvasKind(CONVERSATION_CONTEXT_KIND);
    expect(kind).toBeDefined();
    expect(kind?.load).toBeDefined();
    expect(conversationContextTabId(CONVERSATION)).toBe(`${CONVERSATION_CONTEXT_KIND}::${CONVERSATION}`);
    unmount();
  });

  it("a press opens the tab and shows pressed; the same press again closes it", () => {
    const store = makeStore();
    const seen: { tab: ChatCanvasTab | null } = { tab: null };
    const unmount = mount(store, seen);
    const id = conversationContextTabId(CONVERSATION);
    expect(seen.tab?.isAvailable).toBe(true);
    expect(seen.tab?.isVisible).toBe(false);

    act(() => seen.tab?.toggle(OPEN));
    const opened = canvasOf(store).items[id as keyof CanvasState["items"]];
    expect(opened).toBeDefined();
    expect(canvasText(opened?.data, "conversationId")).toBe(CONVERSATION);
    expect(canvasOf(store).isOpen).toBe(true);
    expect(seen.tab?.isVisible).toBe(true);

    act(() => seen.tab?.toggle(OPEN));
    expect(canvasOf(store).items[id as keyof CanvasState["items"]]).toBeUndefined();
    expect(seen.tab?.isVisible).toBe(false);
    unmount();
  });

  it("a value pill opens the tab on that value; the same pill closes it; another switches", () => {
    const store = makeStore();
    const seen: { tab: ChatCanvasTab | null } = { tab: null };
    const unmount = mount(store, seen);
    const id = conversationContextTabId(CONVERSATION);

    act(() => seen.tab?.toggle({ ...OPEN, selected: "lane" }));
    expect(seen.tab?.isVisible).toBe(true);
    expect(seen.tab?.selected).toBe("lane");

    act(() => seen.tab?.toggle({ ...OPEN, selected: "workspace" }));
    expect(seen.tab?.isVisible).toBe(true);
    expect(seen.tab?.selected).toBe("workspace");
    // One tab per conversation, never one per value.
    expect(Object.keys(canvasOf(store).items).filter((k) => k.startsWith(CONVERSATION_CONTEXT_KIND))).toEqual([id]);

    act(() => seen.tab?.toggle({ ...OPEN, selected: "workspace" }));
    expect(canvasOf(store).items[id as keyof CanvasState["items"]]).toBeUndefined();
    unmount();
  });
});
