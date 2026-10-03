/**
 * An audit table's "Open full model editor" opens the model's editor IN THE
 * CANVAS (one `page-panel` tab that follows the row picked) — never a docked
 * side sheet. Real pieces: the root reducer and the ONE canvas binding; the
 * editor and the providers read are stand-ins.
 *
 * Proven failing before passing: against the docked sheet no canvas tab is
 * ever opened, so the first expectation is RED.
 */

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { pagePanelItemId } from "@/features/canvas/host/pagePanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AiModel } from "../../types";
import ModelDetailSheet, { MODEL_DETAIL_PANEL_KEY } from "../ModelDetailSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/ai-models/audit",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("../../service", () => ({ aiModelService: { fetchProviders: async () => [] } }));
jest.mock("../../components/AiModelDetailPanel", () => ({
  __esModule: true,
  default: ({ model, inCanvas }: { model: { id: string }; inCanvas?: boolean }) => (
    <p data-model-editor="">{`${model.id}:${inCanvas ? "canvas" : "docked"}`}</p>
  ),
}));

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => {});
};

it("opening a model puts its editor in one canvas tab; closing the tab tells the page", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const models = [{ id: "m-1", name: "gpt-x", common_name: "GPT X" }] as unknown as AiModel[];
  const page: { open: (id: string | null) => void } = { open: () => undefined };
  function AuditPage() {
    const [id, setId] = useState<string | null>(null);
    page.open = setId;
    return <ModelDetailSheet modelId={id} allModels={models} onClose={() => setId(null)} onSaved={() => undefined} />;
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
              <AuditPage />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const itemId = pagePanelItemId(MODEL_DETAIL_PANEL_KEY);

  act(() => page.open("m-1"));
  await flush();
  expect(Object.keys(store.getState().canvasHost.items)).toEqual([itemId]);
  expect(store.getState().canvasHost.items[itemId]?.title).toBe("GPT X");
  expect(document.querySelector("[data-model-editor]")?.textContent).toBe("m-1:canvas");

  // The person closes the tab: the page's selection clears with it.
  const closeButton = Array.from(document.querySelectorAll("button")).find((b) =>
    /close/i.test(b.getAttribute("aria-label") ?? ""),
  );
  expect(closeButton).toBeTruthy();
  act(() => closeButton?.click());
  await flush();
  expect(Object.keys(store.getState().canvasHost.items)).toEqual([]);
  expect(document.querySelector("[data-model-editor]")).toBeNull();
  act(() => root.unmount());
  container.remove();
});
