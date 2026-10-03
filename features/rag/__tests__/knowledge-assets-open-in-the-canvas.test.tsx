/**
 * A document's Knowledge Assets builder opens IN THE CANVAS, beside the source
 * it builds from — never a second right-hand panel (Arman, 2026-10-02).
 *
 * Real pieces: the app's root reducer, its ONE canvas binding
 * (`CanvasHostProvider` + `<CanvasColumn>`), and the same `useToolToggle` +
 * `knowledgeAssetsInput` the studios' "Knowledge Assets" actions use. The
 * studios themselves are page-sized, so their wiring is read from source: an
 * action that goes back to a docked panel goes RED.
 *
 * Proven failing before passing: against the pre-canvas pages the source case
 * is RED; with the kind left out of FEATURE_CANVAS_KINDS the body case is RED.
 */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { useToolToggle } from "@/features/canvas/host/toolCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KNOWLEDGE_ASSETS_KIND, knowledgeAssetsInput } from "../canvas/knowledgeAssetsKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/rag/library/d-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/rag/components/library/KnowledgeAssetPanel", () => ({
  KnowledgeAssetPanel: ({ doc }: { doc: { id: string; name: string; totalPages: number | null } }) => (
    <p data-assets-body="">{`${doc.id}:${doc.name}:${doc.totalPages}`}</p>
  ),
}));

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("the Knowledge Assets action toggles one tab per document, showing the existing builder", async () => {
  const store = makeStore();
  const seen: { assets: { isVisible: boolean; toggle: () => void } | null } = { assets: null };
  function Action() {
    seen.assets = useToolToggle(knowledgeAssetsInput({ id: "d-1", name: "Lease.pdf", totalPages: 12 }));
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
              <Action />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const ids = () => Object.keys(store.getState().canvasHost.items);

  act(() => seen.assets?.toggle());
  await flush();
  expect(ids()).toContain(`${KNOWLEDGE_ASSETS_KIND}::d-1`);
  expect(seen.assets?.isVisible).toBe(true);
  expect(document.querySelector("[data-assets-body]")?.textContent).toBe("d-1:Lease.pdf:12");

  act(() => seen.assets?.toggle());
  expect(ids()).not.toContain(`${KNOWLEDGE_ASSETS_KIND}::d-1`);
  act(() => root.unmount());
  container.remove();
});

it("the studios' Knowledge Assets actions toggle the canvas tab — no docked panel", () => {
  const root = join(__dirname, "..", "..", "..");
  for (const file of [
    "features/source-studio/components/SourceStudio.tsx",
    "features/rag/components/library/LibraryPreviewPage.tsx",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    expect(source).not.toContain("MatrxDynamicPanelHost");
    expect(source).not.toContain("<KnowledgeAssetPanel");
    expect(source).toContain("useToolToggle(knowledgeAssetsInput(");
  }
});
