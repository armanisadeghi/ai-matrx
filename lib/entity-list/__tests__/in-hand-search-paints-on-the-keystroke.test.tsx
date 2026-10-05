/** @jest-environment jsdom */
/**
 * AN IN-HAND LIST REPAINTS ON THE KEYSTROKE (DATA-HOME-3E, 2026-10-01; VERIFY-DATA-HOME-3 V2).
 *
 * /data waited 250 ms after every keystroke before its in-hand ranker ran, then a promise hop
 * and a second render: the list repainted 230-700 ms after the letter. A service that holds its
 * rows answers `peek` synchronously, and a surface that sets `searchDebounceMs: 0` gets that
 * answer in the keystroke's OWN render. Each test types through the real input with a SYNCHRONOUS
 * act — no timers advanced, no promise awaited — and reads the rows straight after.
 *
 * RED AGAINST THE PRE-CHANGE SHELL (HEAD before this lane): the first test fails — the rows after
 * the keystroke are still all three (the 250 ms debounce and the async fetch had not run).
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
Element.prototype.scrollIntoView = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntityListPage } from "../components/EntityListPage";
import { EMPTY_FACETS, type EntityListQuery, type EntityScopeCounts } from "../types";
import type { EntityColumnSpec } from "../columns";
import type { EntityListConfig, EntityListService } from "../config";

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = ["Harbor Dental recall", "Furnace service log", "Visit log"].map((name, i) => ({ id: `r${i + 1}`, name }));
const COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };
const answer = (q: EntityListQuery) => {
  const hits = ROWS.filter((r) => r.name.toLowerCase().includes(q.search.trim().toLowerCase()));
  return { rows: hits, total: hits.length };
};

const asyncCalls: string[] = [];
function inHandService(): EntityListService<Row> {
  return {
    fetchPage: async (q) => {
      asyncCalls.push(q.search);
      return answer(q);
    },
    fetchCounts: async () => COUNTS,
    fetchFacets: async () => EMPTY_FACETS,
    peek: { page: (q) => answer(q), counts: () => COUNTS, facets: () => EMPTY_FACETS },
  };
}

function config(overrides: Partial<EntityListConfig<Row>> = {}): EntityListConfig<Row> {
  return {
    surfaceKey: `in-hand-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "table", plural: "tables" },
    scopes: ["mine"],
    sourceFeature: "udt",
    supportsArchived: false,
    urlState: false,
    searchDebounceMs: 0,
    service: inHandService(),
    columns: [
      { id: "name", label: "Name", locked: true, column: { id: "name", header: "Name", cell: (r: Row) => r.name } },
    ] as unknown as EntityColumnSpec<Row>[],
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.name,
    useRowActions: () => ({ actions: { menuFor: () => () => ({ sections: [] }), onOpenRow: () => undefined } }),
    emptyState: { title: "No tables yet", description: "New table makes one." },
    ...overrides,
  } as unknown as EntityListConfig<Row>;
}

let container: HTMLDivElement;
let root: Root;
async function render(cfg: EntityListConfig<Row>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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
    await Promise.resolve();
    await Promise.resolve();
  });
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  asyncCalls.length = 0;
});

const shownIds = () =>
  [...new Set([...document.querySelectorAll("[data-row-id]")].map((e) => e.getAttribute("data-row-id")))].sort();

/** One keystroke through the real box, flushed SYNCHRONOUSLY (no timer, no promise). */
function typeNow(text: string) {
  const input = document.querySelector<HTMLInputElement>("[data-entity-list-search]")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("a list that answers from rows in hand", () => {
  it("shows the keystroke's hits in the keystroke's own render", async () => {
    await render(config());
    expect(shownIds()).toEqual(["r1", "r2", "r3"]);
    typeNow("har");
    expect(shownIds()).toEqual(["r1"]);
    typeNow("log");
    expect(shownIds()).toEqual(["r2", "r3"]);
  });

  it("never also asks the async page for a question the peek answered", async () => {
    await render(config());
    asyncCalls.length = 0;
    typeNow("visit");
    await act(async () => {
      await Promise.resolve();
    });
    expect(shownIds()).toEqual(["r3"]);
    expect(asyncCalls).toEqual([]);
  });
});

describe("a list that goes to the server (no peek, default wait)", () => {
  it("keeps today's debounce: the keystroke alone does not re-ask", async () => {
    const { peek: _peek, ...remote } = inHandService();
    await render(config({ service: remote, searchDebounceMs: undefined }));
    asyncCalls.length = 0;
    typeNow("har");
    expect(asyncCalls).toEqual([]);
  });
});
