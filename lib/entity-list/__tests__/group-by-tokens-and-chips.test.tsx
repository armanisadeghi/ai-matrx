/**
 * GROUP BY IS THE ADDRESS, NEVER A DEFAULT; TYPED TOKENS BECOME CHIPS (lane DATA-HOME-3A).
 *
 * The data home (Arman, 2026-10-01) groups by Kind or Organization only when the person picks it:
 * `?group=` and the session, every visit flat. While grouped the whole result is one page, because
 * the table counts what it holds — a 25-row page's group counts would lie. A typed `kind:form `
 * becomes a filter in the one filter bag, shown as a removable chip.
 *
 * RED on the shell before this lane: there was no `grouping`, `searchTokens` or `filterChips`
 * opt-in, so no group header, no full page, no chip.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
import { EMPTY_FACETS, type EntityListQuery, type EntityListSort } from "../types";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  name: string;
  kind: string;
}

let ROWS: Row[] = [];
const FORTY: Row[] = Array.from({ length: 40 }, (_, i) => ({
  id: `r${i}`,
  name: `${i % 4 === 0 ? "Client Intake" : "Crew Schedule"} ${i}`,
  kind: i % 4 === 0 ? "form" : "table",
}));

function config(seen: Array<{ q: EntityListQuery; s: EntityListSort }>): EntityListConfig<Row> {
  return {
    surfaceKey: `group-tokens-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "table", plural: "tables" },
    scopes: ["mine", "orgs"],
    sourceFeature: "udt",
    service: {
      fetchPage: async (q: EntityListQuery, s: EntityListSort) => {
        seen.push({ q, s });
        const kind = q.filters.kind?.kind === "select" ? q.filters.kind.values : null;
        const rows = ROWS.filter((r) => !kind || kind.includes(r.kind));
        return { rows: rows.slice((q.page - 1) * s.pageSize, q.page * s.pageSize), total: rows.length };
      },
      fetchCounts: async () => ({ byKind: { all: 40, mine: 40, orgs: 0 }, narrow: {} }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      { id: "name", label: "Name", locked: true, column: { id: "name", accessorKey: "name", header: "Name" } },
      { id: "kind", label: "Kind", column: { id: "kind", accessorKey: "kind", header: "Kind", filter: "select" } },
    ] as unknown as EntityListConfig<Row>["columns"],
    prefsVersion: 1,
    getRowId: (row) => row.id,
    getRowName: (row) => row.name,
    useRowActions: () => ({ actions: { menuFor: () => () => ({ sections: [] }), onOpenRow: () => undefined } }),
    supportsArchived: false,
    facetSections: [],
    grouping: { groupableColumnIds: ["kind"], rowNoun: "table" },
    searchTokens: (search) =>
      /kind:form\s$/.test(search)
        ? { search: search.replace(/kind:form\s$/, ""), filters: { kind: { kind: "select", values: ["form"] } } }
        : null,
    filterChips: true,
    virtualize: { enabled: true, threshold: 150, overscan: 8 },
    emptyState: { title: "No tables yet", description: "New table makes one." },
  } as EntityListConfig<Row>;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 450));
  });

describe("the shell's group-by, tokens and chips", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    ROWS = FORTY;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });
  async function mount(seen: Array<{ q: EntityListQuery; s: EntityListSort }>) {
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

  it("a fresh visit is flat and paged; ?group=kind asks for every row and draws group headers", async () => {
    window.history.replaceState(null, "", "/data-v2");
    const flat: Array<{ q: EntityListQuery; s: EntityListSort }> = [];
    await mount(flat);
    expect(flat[flat.length - 1]!.s.pageSize).toBeLessThan(1000);
    expect(container.textContent).not.toMatch(/\d+ tables/);
    act(() => root.unmount());
    container.remove();

    window.history.replaceState(null, "", "/data-v2?group=kind");
    const grouped: Array<{ q: EntityListQuery; s: EntityListSort }> = [];
    await mount(grouped);
    expect(grouped[grouped.length - 1]!.s.pageSize).toBeGreaterThanOrEqual(ROWS.length);
    // Exact counts: 10 forms and 30 tables — the whole set's, never a page's.
    expect(container.textContent).toMatch(/10 tables/);
    expect(container.textContent).toMatch(/30 tables/);
  });

  it("a column the surface does not offer reads as no grouping", async () => {
    window.history.replaceState(null, "", "/data-v2?group=name");
    const seen: Array<{ q: EntityListQuery; s: EntityListSort }> = [];
    await mount(seen);
    expect(seen[seen.length - 1]!.s.pageSize).toBeLessThan(1000);
  });

  it("typing `kind:form ` moves the token into the filter bag and shows it as a removable chip", async () => {
    window.history.replaceState(null, "", "/data-v2");
    const seen: Array<{ q: EntityListQuery; s: EntityListSort }> = [];
    await mount(seen);
    const box = container.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(box, "kind:form ");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    const last = seen[seen.length - 1]!.q;
    expect(last.filters.kind).toEqual({ kind: "select", values: ["form"] });
    expect(last.search.trim()).toBe("");
    const chip = container.querySelector("[data-entity-filter-chip]");
    expect(chip?.textContent).toContain("Kind: form");
    await act(async () => {
      (chip!.querySelector("button") as HTMLButtonElement).click();
    });
    await flush();
    expect(seen[seen.length - 1]!.q.filters.kind).toBeUndefined();
    expect(container.querySelector("[data-entity-filter-chip]")).toBeNull();
  });

  it("3,000 rows grouped stay a virtual window: fewer than 120 rows in the DOM", async () => {
    ROWS = Array.from({ length: 3000 }, (_, i) => ({ id: `big${i}`, name: `Estimate ${i}`, kind: i % 3 === 0 ? "form" : "table" }));
    window.history.replaceState(null, "", "/data-v2?group=kind");
    const seen: Array<{ q: EntityListQuery; s: EntityListSort }> = [];
    await mount(seen);
    expect(seen[seen.length - 1]!.s.pageSize).toBeGreaterThanOrEqual(3000);
    expect(container.textContent).toMatch(/1,?000 tables/);
    const domRows = container.querySelectorAll("tbody tr").length;
    expect(domRows).toBeGreaterThan(0);
    expect(domRows).toBeLessThan(120);
  });
});
