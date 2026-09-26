/**
 * THE FIRST RENDER READS THE URL.
 *
 * 🚨 THE DEFECT (2026-09-26, localhost). A URL-backed list opened at
 * `/workflows/all?scope=orgs` painted Mine first and flipped to My Orgs a moment
 * later: the kit's `useUrlSearchParams` has a SERVER snapshot of "", and React
 * renders both the server pass and the hydration pass with it.
 *
 * THE FIX: `lib/entity-list/useListSearchParams.ts` reads Next's request
 * `useSearchParams()` until hydration completes. This test server-renders the
 * page (the pass that used the "" snapshot) and asserts it already shows the
 * address's lane and search.
 *
 * RED before the fix: the server HTML selected Mine and the search box was empty.
 */
import React from "react";
import { renderToString } from "react-dom/server";
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

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("scope=orgs&q=seo"),
  usePathname: () => "/workflows/all",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
}));

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
    surfaceKey: `url-is-query-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "workflow", plural: "workflows" },
    scopes: ["mine", "orgs", "shared", "public"],
    sourceFeature: "agents-other",
    // NOTE: no `urlState` — exactly how the agents and workflows configs read.
    service: {
      fetchPage: async (query: EntityListQuery) => {
        seen.push(query);
        return { rows: [{ id: "r1", label: "Weekly SEO digest" }], total: 1 };
      },
      fetchCounts: async () => ({
        byKind: { mine: 1, orgs: 1, shared: 0, public: 0 },
        narrow: {},
      }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "label",
        label: "Name",
        locked: true,
        column: { id: "label", header: "Name", cell: (row: Row) => row.label },
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

it("the server render already shows the lane and search the address names", () => {
  const html = renderToString(
    <Provider store={makeStore()}>
      <TooltipProvider>
        <EntityListPage config={config([])} />
      </TooltipProvider>
    </Provider>,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  const selected = host.querySelector('[role="tab"][aria-selected="true"]');
  expect(selected?.textContent ?? "").toMatch(/^My Orgs/);
  const search = host.querySelector('input[type="search"], input[placeholder^="Search"]') as HTMLInputElement | null;
  expect(search?.getAttribute("value")).toBe("seo");
});
