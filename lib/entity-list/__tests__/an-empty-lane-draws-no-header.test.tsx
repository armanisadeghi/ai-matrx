/**
 * AN EMPTY LANE DRAWS NO COLUMN HEADER, AND THE FOOTER HAS ONE WORDING
 * (list-shell fix D, 2026-09-28).
 *
 * Blind judges on /education/quizzes: the empty My team lane drew the full
 * column header above its empty state, and its footer said "0 rows" where the
 * cards view says "0 of 0".
 *
 * RED on the old code: no header-hiding class on the table, footer "0 rows".
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
}

function config(): EntityListConfig<Row> {
  return {
    surfaceKey: `empty-lane-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "quiz", plural: "quizzes" },
    scopes: ["mine", "orgs"],
    sourceFeature: "education-assessment",
    service: {
      fetchPage: async () => ({ rows: [], total: 0 }),
      fetchCounts: async () => ({ byKind: { mine: 0, orgs: 0 }, narrow: {} }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "label",
        label: "Title",
        locked: true,
        column: { id: "label", accessorKey: "label", header: "Title", cell: (row: Row) => row.label },
      } as unknown as EntityListConfig<Row>["columns"][number],
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

describe("an empty lane", () => {
  let container: HTMLDivElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  it("hides the column header and says 0 of 0", async () => {
    window.history.replaceState(null, "", "/education/quizzes?scope=mine");
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
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    const scroll = container.querySelector("[data-matrx-table-scroll]");
    expect(scroll?.className ?? "").toContain("[&_thead]:hidden");
    const text = container.textContent ?? "";
    expect(text).not.toContain("0 rows");
    expect(text).toContain("0 of 0");
  });
});
