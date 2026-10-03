/**
 * The system-context console's "Preview agent context" opens IN THE CANVAS,
 * beside the console — not a modal over it (Arman, 2026-10-02: things beside
 * the work live in the one right-hand region).
 *
 * Real pieces: the root reducer, the ONE canvas binding (`CanvasHostProvider`
 * + `<CanvasColumn>`), the same `useToolToggle(SYSTEM_CONTEXT_PREVIEW_TOGGLE)`
 * the console's button uses, and the real `SystemContextPreview` body over a
 * stubbed resolver response. The console is page-sized, so its button wiring is
 * read from source.
 *
 * Proven failing before passing: against the pre-canvas console (PreviewDialog)
 * the source case is RED; with the kind left out of FEATURE_CANVAS_KINDS the
 * body case is RED.
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
import { SYSTEM_CONTEXT_PREVIEW_KIND, SYSTEM_CONTEXT_PREVIEW_TOGGLE } from "../canvas/systemContextPreviewKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/system-context",
  useRouter: () => ({ push: () => undefined }),
}));

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
};

it("the Preview button toggles one tab that shows what agents receive", async () => {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ resolved: [{ key: "org_name", type: "text", description: null, value: "Acme" }] }),
  }));
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { preview: { isVisible: boolean; toggle: () => void } | null } = { preview: null };
  function Button() {
    seen.preview = useToolToggle(SYSTEM_CONTEXT_PREVIEW_TOGGLE);
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
              <Button />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const ids = () => Object.keys(store.getState().canvasHost.items);

  act(() => seen.preview?.toggle());
  await flush();
  expect(ids()).toContain(`${SYSTEM_CONTEXT_PREVIEW_KIND}::default`);
  expect(seen.preview?.isVisible).toBe(true);
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/system-context?preview=1");
  expect(document.body.textContent).toContain("org_name");
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  act(() => seen.preview?.toggle());
  expect(ids()).not.toContain(`${SYSTEM_CONTEXT_PREVIEW_KIND}::default`);
  act(() => root.unmount());
  container.remove();
});

it("the console's Preview button toggles the canvas tab — no dialog", () => {
  const source = readFileSync(join(__dirname, "..", "SystemContextConsole.tsx"), "utf8");
  expect(source).not.toContain("PreviewDialog");
  expect(source).toContain("useToolToggle(SYSTEM_CONTEXT_PREVIEW_TOGGLE)");
});
