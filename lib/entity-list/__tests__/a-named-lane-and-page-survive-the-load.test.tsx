/**
 * A LANE AND PAGE THE ADDRESS NAMES SURVIVE THE LOAD (list-shell fix D, 2026-09-28).
 *
 * 🚨 THE DEFECT (blind judges, /education/quizzes and /education/flashcards):
 * `?scope=mine&page=2` opened on My Orgs page 1, and Back from a row landed
 * there too. Traced live: while the first page was loading the table saw a
 * total of 0, clamped page 2 to page 1 and reported it; that write treated
 * `mine` as the (not yet resolved) default and dropped it; the late registry
 * default (`orgs`) then took the lane.
 *
 * RED on the old code (scratch copy of EntityListTable.tsx + useEntityList.ts
 * at the parent commit): the address ends as `?` with no scope and no page,
 * and the last fetch asks My Orgs page 1.
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

// The registry's lane arrives LATE and says My Orgs — exactly production's
// `assessment` / `fc_set` rows, where the defect was measured.
jest.mock("@/lib/list-scope", () => {
  const actual = jest.requireActual("@/lib/list-scope");
  return {
    ...actual,
    defaultListScopeFor: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ kind: "orgs", organizationId: null }), 120),
      ),
  };
});

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

function config(seen: EntityListQuery[]): EntityListConfig<Row> {
  return {
    surfaceKey: `url-lane-page-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "quiz", plural: "quizzes" },
    scopes: ["mine", "orgs", "shared", "public"],
    sourceFeature: "education-assessment",
    registryToken: "assessment",
    service: {
      fetchPage: async (query: EntityListQuery, sort: { pageSize: number }) => {
        seen.push(query);
        await new Promise((r) => setTimeout(r, 60));
        const start = (query.page - 1) * sort.pageSize;
        return {
          rows: Array.from({ length: sort.pageSize }, (_, i) => ({
            id: `q${start + i}`,
            label: `Unit ${start + i} review`,
          })),
          total: sort.pageSize * 3,
        };
      },
      fetchCounts: async () => ({
        byKind: { mine: 75, orgs: 9, shared: 0, public: 0 },
        narrow: {},
      }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "label",
        label: "Title",
        locked: true,
        column: { id: "label", header: "Title", cell: (row: Row) => row.label },
      } as unknown as EntityListConfig<Row>["columns"][number],
    ],
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.label,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: () => undefined,
      },
    }),
    supportsArchived: false,
  } as unknown as EntityListConfig<Row>;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });

describe("a lane and page named in the address survive the first load", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  async function mount(seen: EntityListQuery[]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <Provider store={makeStore()}>
          <TooltipProvider>
            <EntityListPage config={config(seen)} />
          </TooltipProvider>
        </Provider>,
      );
    });
    await flush();
  }

  it("keeps ?scope=mine&page=2 while the registry says My Orgs", async () => {
    window.history.replaceState(null, "", "/education/quizzes?scope=mine&page=2");
    const seen: EntityListQuery[] = [];
    await mount(seen);
    const params = new URLSearchParams(window.location.search);
    expect(params.get("scope")).toBe("mine");
    expect(params.get("page")).toBe("2");
    const last = seen[seen.length - 1];
    expect(last.scope.kind).toBe("mine");
    expect(last.page).toBe(2);
  });
});
