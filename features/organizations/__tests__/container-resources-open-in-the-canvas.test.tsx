/**
 * A task's "resources of one kind" list opens IN THE CANVAS — one tab per
 * container that follows the kind picked — never a docked side sheet.
 * Real pieces: the root reducer, the ONE canvas binding and the org resource
 * catalogue; the database read is a stand-in that answers one row.
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
import { ORG_RESOURCE_CATALOGUE, type OrgResourceEntry } from "../resource-catalogue";
import { ContainerResourceSheet } from "../components/ContainerResourceSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/tasks/t-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name: string }) => <span data-resource-row="">{name}</span>,
}));
jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const verb of ["from", "select", "eq", "limit", "is", "schema"]) chain[verb] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [{ id: "r-1", title: "Kickoff notes", name: "Kickoff notes", label: "Kickoff notes" }], error: null });
  return { supabase: chain };
});

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
};

it("picking a kind opens its list in the container's canvas tab; closing the tab tells the page", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const entry = ORG_RESOURCE_CATALOGUE.find((e) => e.table) as OrgResourceEntry;
  const page: { pick: (e: OrgResourceEntry | null) => void } = { pick: () => undefined };
  function TaskPage() {
    const [picked, setPicked] = useState<OrgResourceEntry | null>(null);
    page.pick = setPicked;
    return (
      <ContainerResourceSheet
        open={picked !== null}
        onOpenChange={(o) => !o && setPicked(null)}
        entry={picked}
        column="task_id"
        value="t-1"
      />
    );
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
              <TaskPage />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const itemId = pagePanelItemId("container-resources:task_id:t-1");

  act(() => page.pick(entry));
  await flush();
  expect(Object.keys(store.getState().canvasHost.items)).toEqual([itemId]);
  expect(store.getState().canvasHost.items[itemId]?.title).toBe(entry.labelPlural);
  expect(document.querySelector("[data-resource-row]")?.textContent).toBe("Kickoff notes");

  const close = Array.from(document.querySelectorAll("button")).find((b) =>
    /close/i.test(b.getAttribute("aria-label") ?? ""),
  );
  act(() => close?.click());
  await flush();
  expect(Object.keys(store.getState().canvasHost.items)).toEqual([]);
  expect(document.querySelector("[data-resource-row]")).toBeNull();
  act(() => root.unmount());
  container.remove();
});
