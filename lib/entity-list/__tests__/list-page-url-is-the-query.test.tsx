/**
 * THE URL IS THE QUERY ON EVERY LIST PAGE.
 *
 * 🚨 THE DEFECT (2026-09-26, mandate-sharing verification). `/agents/all` and
 * `/workflows/all` opened on My Orgs and dropped the search even when the
 * address said `?scope=mine&q=…`, and Back did not restore the lane. Root
 * cause: `urlState` was OPT-IN on `EntityListConfig`, and neither config opted
 * in — so the query lived in React state, the URL was never read, and the late
 * registry default (`registryToken` → `orgs`) overwrote the untouched scope.
 *
 * THE FIX, in the shared shell: `EntityListPage` puts the query in the URL
 * unless a config says `urlState: false`.
 *
 * RED before the fix: this config sets no `urlState`, and the first fetch was
 * asked for `mine` with an empty search.
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

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });

describe("a list page reads its lane and search from the URL", () => {
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

  it("opens on the lane and search the address names", async () => {
    window.history.replaceState(null, "", "/workflows/all?scope=orgs&q=seo");
    const seen: EntityListQuery[] = [];
    await mount(seen);
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1];
    expect(last.scope.kind).toBe("orgs");
    expect(last.search).toBe("seo");
  });

  it("Back restores exactly the lane and search it left", async () => {
    window.history.replaceState(null, "", "/workflows/all?scope=shared&q=seo");
    const seen: EntityListQuery[] = [];
    await mount(seen);
    const tab = [...container.querySelectorAll('[role="tab"]')].find((t) =>
      (t.textContent ?? "").startsWith("Public"),
    ) as HTMLElement | undefined;
    expect(tab).toBeDefined();
    await act(async () => {
      tab!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      tab!.click();
    });
    await flush();
    expect(new URLSearchParams(window.location.search).get("scope")).toBe(
      "public",
    );
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 50));
    });
    await flush();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("scope")).toBe("shared");
    const last = seen[seen.length - 1];
    expect(last.scope.kind).toBe("shared");
    expect(last.search).toBe("seo");
  });
});
