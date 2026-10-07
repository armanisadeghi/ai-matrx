/**
 * Two history tabs never share a title: each names its subject
 * ("Document history · Q3 plan"), and while the editor that owns the History
 * button is mounted a rename shows in the open tab.
 *
 * Real pieces: the app's root reducer, its ONE canvas binding and the same
 * `useToolToggle` + input builders the editors use. Proven failing first: with
 * static titles both tabs read "Document history" and the rename case stays on
 * the old name.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { useToolToggle } from "@/features/canvas/host/toolCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DOCUMENT_HISTORY_KIND, documentHistoryToggleInput } from "@/lib/univer/historyKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/documents/d-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/documents/components/DocumentHistoryViewer", () => ({
  DocumentHistoryViewer: () => <p data-history-body="document" />,
}));

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;
type Toggle = { isVisible: boolean; toggle: () => void };
const titleOf = (store: Store, id: string) =>
  store.getState().canvasHost.items[`${DOCUMENT_HISTORY_KIND}::${id}`]?.title ?? null;

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

describe("history tabs name their subject", () => {
  it("two documents' history tabs carry their own names, and a rename follows into the open tab", async () => {
    const store = makeStore();
    const seen: { a: Toggle | null; b: Toggle | null } = { a: null, b: null };
    function Buttons({ nameA }: { nameA: string }) {
      seen.a = useToolToggle(documentHistoryToggleInput("d-1", true, nameA));
      seen.b = useToolToggle(documentHistoryToggleInput("d-2", true, "Budget"));
      return null;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (nameA: string) =>
      act(() => {
        root.render(
          <QueryClientProvider client={new QueryClient()}>
            <Provider store={store}>
              <TooltipProvider>
                <CanvasHostProvider>
                  <CanvasColumn />
                  <Buttons nameA={nameA} />
                </CanvasHostProvider>
              </TooltipProvider>
            </Provider>
          </QueryClientProvider>,
        );
      });

    render("Q3 plan");
    act(() => seen.a?.toggle());
    act(() => seen.b?.toggle());
    await flush();
    expect(titleOf(store, "d-1")).toBe("Document history · Q3 plan");
    expect(titleOf(store, "d-2")).toBe("Document history · Budget");

    render("Q4 plan");
    await flush();
    expect(titleOf(store, "d-1")).toBe("Document history · Q4 plan");

    act(() => root.unmount());
    container.remove();
  });
});
