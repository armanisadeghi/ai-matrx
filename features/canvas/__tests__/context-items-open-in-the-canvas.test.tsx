/**
 * An attachment chip opens its item IN THE CANVAS — one `context-items` tab per
 * chip host, paging through the host's items in place — never a docked drawer.
 *
 * Drives the app's REAL chat canvas port over the root reducer and its ONE
 * canvas binding: a chip press opens the host's tab on that item, Next moves
 * the tab's `selected` (so the chips' pressed state follows), pressing the
 * item in front closes the tab, and a press from a host whose list moved
 * replaces the list. The three chip hosts are read from source: one that
 * mounts its own drawer again goes RED.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * the body case is RED; against the pre-canvas chip hosts the source case is RED.
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
import { CONTEXT_ITEMS_KIND } from "@ai-matrx/chat/host/canvas-tabs";
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
jest.mock("@ai-matrx/chat/agents/components/context-items/registry", () => {
  const Icon = () => null;
  const def = { typeLabel: "Note", icon: Icon, themeKey: "input_notes", editable: false };
  return {
    resolveContextItemDef: () => def,
    resolveContextItemBody: () =>
      function Body({ item }: { item: { title: string } }) {
        return <p data-item-body="">{item.title}</p>;
      },
    resolveContextItemFooter: () => null,
    resolveContextItemTitle: () => null,
    resolveContextItemTitleActions: () => null,
  };
});

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

const item = (id: string, title: string) => ({
  id,
  blockType: "input_notes",
  typeLabel: "Note",
  title,
  themeKey: "input_notes",
  origin: "block",
  conversationId: "c-1",
  editable: false,
  refs: { noteIds: [id] },
  raw: { type: "input_notes" },
});

it("a chip opens its item in the host's tab; Next pages in place; the item in front closes", async () => {
  const store = makeStore();
  const seen: { tab: ChatCanvasTab | null } = { tab: null };
  function Chips() {
    seen.tab = appChatCanvasPort.useTab({ kind: CONTEXT_ITEMS_KIND, key: "composer:c-1" });
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
              <Chips />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const id = `${CONTEXT_ITEMS_KIND}::composer:c-1`;
  const tabItem = () => store.getState().canvasHost.items[id];
  const two = [item("n-1", "First note"), item("n-2", "Second note")];

  act(() => seen.tab?.toggle({ title: "Second note", data: { items: two }, selected: "n-2", replaceData: true }));
  await flush();
  expect(tabItem()).toBeDefined();
  expect(seen.tab?.selected).toBe("n-2");
  expect(document.querySelector("[data-item-body]")?.textContent).toBe("Second note");
  expect(document.querySelector("[data-context-item-viewer]")?.textContent).toContain("2/2");

  // Next wraps to the first item, on the tab itself.
  const next = document.querySelector<HTMLButtonElement>("[data-context-item-viewer] button[aria-label='Next']");
  act(() => next?.click());
  await flush();
  expect(seen.tab?.selected).toBe("n-1");
  expect(tabItem()?.title).toBe("First note");
  expect(document.querySelector("[data-item-body]")?.textContent).toBe("First note");

  // The host's list moved (a third attachment): the press replaces it.
  const three = [...two, item("n-3", "Third note")];
  act(() => seen.tab?.toggle({ title: "Third note", data: { items: three }, selected: "n-3", replaceData: true }));
  await flush();
  expect(document.querySelector("[data-context-item-viewer]")?.textContent).toContain("3/3");

  // Pressing the chip of the item in front closes the tab.
  act(() => seen.tab?.toggle({ title: "Third note", data: { items: three }, selected: "n-3", replaceData: true }));
  expect(tabItem()).toBeUndefined();
  act(() => root.unmount());
  container.remove();
});

it("every chip host opens the canvas tab — none mounts its own drawer", () => {
  const src = join(__dirname, "..", "..", "..", "..", "aidream", "apps", "shared", "chat", "src", "agents", "components");
  for (const file of [
    "messages-display/MessageAttachmentStrip.tsx",
    "inputs/resources/SmartAgentResourceChips.tsx",
    "inputs/resources/AttachedDocumentChips.tsx",
  ]) {
    const source = readFileSync(join(src, file), "utf8");
    expect(source).not.toContain("ContextItemDrawer");
    expect(source).not.toContain("MatrxDynamicPanelHost");
    expect(source).toContain("useContextItemsTab(");
  }
  const viewer = readFileSync(join(src, "context-items/ContextItemViewer.tsx"), "utf8");
  expect(viewer).not.toContain("MatrxDynamicPanelHost");
});
