/**
 * A sent message's context chip opens that value IN THE CANVAS — one
 * `context-value` tab per conversation showing the frozen snapshot — never a
 * docked side sheet.
 *
 * Drives the app's REAL chat canvas port over the root reducer and its ONE
 * canvas binding with the package's own tab data (`contextValueTab.ts`): a
 * chip press opens the value, another chip's press swaps it in place, pressing
 * the value in front closes the tab. The chip hosts are read from source: one
 * that mounts its own sheet again goes RED.
 *
 * Proven failing before passing: with the kind left out of TOOL_CANVAS_KINDS
 * the body case is RED; against the sheet-era chips the source case is RED.
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
import { CONTEXT_VALUE_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import {
  contextValueSelection,
  contextValueToTabData,
  type ContextValueSnapshot,
} from "@ai-matrx/chat/agents/components/context-policies-display/contextValueTab";
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
jest.mock("@ai-matrx/chat/agents/components/context-policies-display/ContextPolicyDetail", () => ({
  ContextPolicyDetail: ({ contextKey, snapshotValue }: { contextKey: string; snapshotValue?: unknown }) => (
    <p data-context-value="">{`${contextKey}=${JSON.stringify(snapshotValue)}`}</p>
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

const snap = (contextKey: string, value: unknown): ContextValueSnapshot => ({
  conversationId: "c-1",
  agentId: "a-1",
  contextKey,
  snapshotValue: value,
  snapshotLabel: contextKey,
  snapshotType: "text",
});

it("a chip opens its value in the conversation's tab; another chip swaps it; the value in front closes", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { tab: ChatCanvasTab | null } = { tab: null };
  function Chips() {
    seen.tab = appChatCanvasPort.useTab({ kind: CONTEXT_VALUE_KIND, key: "c-1" });
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
  const id = `${CONTEXT_VALUE_KIND}::c-1`;
  const press = (s: ContextValueSnapshot) =>
    act(() =>
      seen.tab?.toggle({ title: s.contextKey, data: contextValueToTabData(s), selected: contextValueSelection(s), replaceData: true }),
    );

  const city = snap("city", "Irvine");
  press(city);
  await flush();
  expect(store.getState().canvasHost.items[id]).toBeDefined();
  expect(seen.tab?.selected).toBe(contextValueSelection(city));
  expect(document.querySelector("[data-context-value]")?.textContent).toBe('city="Irvine"');

  // The same key sent later with another value is another selection.
  const later = snap("city", "Austin");
  expect(contextValueSelection(later)).not.toBe(contextValueSelection(city));
  press(later);
  await flush();
  expect(document.querySelector("[data-context-value]")?.textContent).toBe('city="Austin"');

  press(later);
  expect(store.getState().canvasHost.items[id]).toBeUndefined();
  act(() => root.unmount());
  container.remove();
});

it("every context chip opens the canvas tab — none mounts its own sheet", () => {
  const dir = join(__dirname, "..", "..", "..", "..", "aidream", "apps", "shared", "chat", "src", "agents", "components", "context-policies-display");
  for (const file of ["ContextPolicyChip.tsx", "ContextPolicyItemsPopover.tsx"]) {
    const source = readFileSync(join(dir, file), "utf8");
    expect(source).not.toContain("ContextPolicyDetailSheet");
    expect(source).toContain("useContextValueTab(");
  }
  expect(readFileSync(join(dir, "ContextPolicyDetail.tsx"), "utf8")).not.toContain("MatrxDynamicPanelHost");
});
