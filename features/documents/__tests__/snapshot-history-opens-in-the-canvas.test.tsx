/**
 * A document's or a workbook's snapshot history opens IN THE CANVAS, beside
 * its editor — never a second right-hand panel (Arman, 2026-10-02: one
 * right-hand region).
 *
 * Real pieces: the app's root reducer, its ONE canvas binding
 * (`CanvasHostProvider`, which registers every kind, `<CanvasColumn>` which
 * renders the tab body), and the same `useToolToggle` + input builders the
 * editors' History buttons use. The editors themselves boot Univer, so their
 * wiring is read from source: a History button that goes back to a docked
 * panel goes RED.
 *
 * Proven failing before passing: against the pre-canvas editors the source
 * case is RED (MatrxDynamicPanelHost, no toggle); with the kinds left out of
 * FEATURE_CANVAS_KINDS the body case is RED.
 */

import React, { act, useEffect } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import type { CanvasState } from "@ai-matrx/canvas";
import { CanvasColumn, useCanvas } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { useToolToggle } from "@/features/canvas/host/toolCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DOCUMENT_HISTORY_KIND,
  WORKBOOK_HISTORY_KIND,
  documentHistoryToggleInput,
  workbookHistoryToggleInput,
} from "@/lib/univer/historyKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/workbooks/w-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/documents/components/DocumentHistoryViewer", () => ({
  DocumentHistoryViewer: ({ documentId, editable }: { documentId: string; editable: boolean }) => (
    <p data-history-body="document">{`${documentId}:${editable}`}</p>
  ),
}));
jest.mock("@/features/workbooks/components/WorkbookHistoryViewer", () => ({
  WorkbookHistoryViewer: ({ workbookId, editable }: { workbookId: string; editable: boolean }) => (
    <p data-history-body="workbook">{`${workbookId}:${editable}`}</p>
  ),
}));

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;
const items = (store: Store): CanvasState["items"] => store.getState().canvasHost.items;

type Toggle = { isVisible: boolean; toggle: () => void };

function mount(store: Store, seen: { doc: Toggle | null; book: Toggle | null }) {
  function Buttons() {
    seen.doc = useToolToggle(documentHistoryToggleInput("d-1", false));
    seen.book = useToolToggle(workbookHistoryToggleInput("w-1", true));
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
              <Buttons />
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

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

describe("snapshot history opens in the canvas", () => {
  it("the History button toggles one tab per document, showing the existing viewer", async () => {
    const store = makeStore();
    const seen: { doc: Toggle | null; book: Toggle | null } = { doc: null, book: null };
    const unmount = mount(store, seen);

    act(() => seen.doc?.toggle());
    await flush();
    expect(Object.keys(items(store))).toContain(`${DOCUMENT_HISTORY_KIND}::d-1`);
    expect(seen.doc?.isVisible).toBe(true);
    expect(document.querySelector('[data-history-body="document"]')?.textContent).toBe("d-1:false");

    act(() => seen.doc?.toggle());
    expect(Object.keys(items(store))).not.toContain(`${DOCUMENT_HISTORY_KIND}::d-1`);
    expect(seen.doc?.isVisible).toBe(false);

    act(() => seen.book?.toggle());
    await flush();
    expect(Object.keys(items(store))).toContain(`${WORKBOOK_HISTORY_KIND}::w-1`);
    expect(document.querySelector('[data-history-body="workbook"]')?.textContent).toBe("w-1:true");
    unmount();
  });

  it("the editors' History buttons toggle the canvas tab — no docked panel", () => {
    for (const [file, input] of [
      ["../components/DocumentEditor.tsx", "documentHistoryToggleInput("],
      ["../../workbooks/components/WorkbookEditor.tsx", "workbookHistoryToggleInput("],
    ] as const) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source).not.toContain("MatrxDynamicPanelHost");
      expect(source).toContain(`useToolToggle(${input}`);
      expect(source).toContain("aria-pressed={snapshotHistory.isVisible}");
    }
  });
});
