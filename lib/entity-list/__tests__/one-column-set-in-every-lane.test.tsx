/**
 * ONE COLUMN SET AND ORDER IN EVERY LANE (list-shell fix D, 2026-09-28).
 *
 * 🚨 THE DEFECT (blind judges, /education/flashcards and /education/quizzes):
 * the columns depended on the lane a person opened first. Owner columns were
 * REMOVED from the array in Mine, and the table remembers the order it first
 * mounted with — so opening in Mine and switching to My Orgs appended "Owner"
 * at the END, while opening in My Orgs drew it in its declared place.
 *
 * RED on the old code: opened in Mine then switched to My Orgs, the header
 * reads Title · Updated · Owner instead of Title · Owner · Updated.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntityListPage } from "../components/EntityListPage";
import { EMPTY_FACETS, type EntityListQuery } from "../types";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  label: string;
  owner: string;
  updated: string;
}

function config(): EntityListConfig<Row> {
  const col = (id: string, label: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      label,
      ...extra,
      column: { id, accessorKey: id, header: label, cell: (row: Row) => String(row[id as keyof Row]) },
    }) as unknown as EntityListConfig<Row>["columns"][number];
  return {
    surfaceKey: `one-column-set-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "deck", plural: "decks" },
    scopes: ["mine", "orgs"],
    sourceFeature: "flashcards",
    service: {
      fetchPage: async (query: EntityListQuery) => ({
        rows: [
          { id: "a", label: "AP Chemistry", owner: query.scope.kind === "mine" ? "You" : "Dana", updated: "1d" },
          { id: "b", label: "Photosynthesis", owner: "You", updated: "2d" },
        ],
        total: 2,
      }),
      fetchCounts: async () => ({ byKind: { mine: 2, orgs: 2 }, narrow: {} }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      col("label", "Title", { locked: true }),
      col("owner", "Owner", { scopedToShared: true }),
      col("updated", "Updated"),
    ],
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.label,
    useRowActions: () => ({
      actions: { menuFor: () => () => ({ sections: [] }), onOpenRow: () => undefined },
    }),
    supportsArchived: false,
  } as unknown as EntityListConfig<Row>;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 500));
  });

describe("one column set and order in every lane", () => {
  let container: HTMLDivElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  const headers = () =>
    [...container.querySelectorAll("thead th")]
      .map((th) => (th.textContent ?? "").trim().toLowerCase())
      .filter((t) => ["title", "owner", "updated"].some((w) => t.startsWith(w)))
      .map((t) => t.replace(/[^a-z]/g, ""));

  it("opened in Mine then switched to My Orgs, draws the declared order", async () => {
    window.history.replaceState(null, "", "/education/flashcards?scope=mine");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const cfg = config();
    await act(async () => {
      root.render(
        <Provider store={makeStore()}>
          <TooltipProvider>
            <EntityListPage config={cfg} />
          </TooltipProvider>
        </Provider>,
      );
    });
    await flush();
    expect(headers()).toEqual(["title", "updated"]);
    const tab = [...container.querySelectorAll('[role="tab"]')].find((t) =>
      (t.textContent ?? "").startsWith("My Orgs"),
    ) as HTMLElement;
    await act(async () => {
      tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      tab.click();
    });
    await flush();
    expect(headers()).toEqual(["title", "owner", "updated"]);
  });
});
