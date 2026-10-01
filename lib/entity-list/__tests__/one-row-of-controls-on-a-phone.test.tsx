/** @jest-environment jsdom */
/**
 * ONE ROW OF CONTROLS ABOVE THE FIRST CARD ON A PHONE (DATA-HOME-3E, 2026-10-01; VERIFY V5).
 *
 * At 390 px /data-v2 stacked four rows of chrome over its first card (lane select + organization
 * filter · search · Filters/Columns/View · the table's view tabs, copy and group select). Below `sm`
 * the shell now draws ONE row: lane select, organization filter, a search icon that opens the box
 * in place, Filters and View; the table's own row stays off the phone. jsdom has no layout, so the
 * row count is read structurally: every visible control in the list's header sits inside its one
 * control row. jest.setup's matchMedia answers width queries from `innerWidth`.
 *
 * RED AGAINST THE PRE-CHANGE SHELL: the search box, Filters, Columns and View are outside the lane
 * row (their own toolbar rows) and the search box shows before anything is pressed.
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
import { EMPTY_FACETS, type EntityScopeCounts } from "../types";
import type { EntityColumnSpec } from "../columns";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  name: string;
  kind: string;
}
const ROWS: Row[] = ["Harbor Dental recall", "Furnace service log", "Visit log"].map((name, i) => ({ id: `r${i + 1}`, name, kind: "table" }));
const COUNTS: EntityScopeCounts = { byKind: { all: 3, mine: 3 }, narrow: {} };

function config(): EntityListConfig<Row> {
  return {
    surfaceKey: `phone-row-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "table", plural: "tables" },
    scopes: ["all", "mine", "shared"],
    sourceFeature: "udt",
    supportsArchived: false,
    urlState: false,
    service: {
      fetchPage: async () => ({ rows: ROWS, total: ROWS.length }),
      fetchCounts: async () => COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      { id: "name", label: "Name", locked: true, column: { id: "name", header: "Name", cell: (r: Row) => r.name } },
      { id: "kind", label: "Kind", column: { id: "kind", accessorKey: "kind", header: "Kind", filter: "select" } },
    ] as unknown as EntityColumnSpec<Row>[],
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.name,
    views: { cards: () => null },
    useRowActions: () => ({ actions: { menuFor: () => () => ({ sections: [] }), onOpenRow: () => undefined } }),
    emptyState: { title: "No tables yet", description: "New table makes one." },
  } as unknown as EntityListConfig<Row>;
}

let container: HTMLDivElement;
let root: Root;
const desktopWidth = window.innerWidth;
async function render(width: number) {
  window.innerWidth = width;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={makeStore()}>
        <TooltipProvider>
          <EntityListPage config={config()} />
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
  window.innerWidth = desktopWidth;
});

/** Visible controls in the list's header that are NOT inside its one control row. */
function controlsOutsideTheRow(): string[] {
  const header = document.querySelector("[data-entity-list-header]")!;
  const row = header.querySelector("[data-entity-list-control-row]")!;
  return [...header.querySelectorAll<HTMLElement>("button, input, select, [role=combobox], [role=tab]")]
    .filter((el) => !el.closest("[hidden]") && !el.closest(".hidden"))
    .filter((el) => !row.contains(el))
    .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName);
}

describe("the list's controls on a phone (390 px)", () => {
  it("are one row: lanes, search icon, Filters and View, nothing beneath", async () => {
    await render(390);
    expect(document.querySelector("[data-entity-list-phone-controls]")).not.toBeNull();
    expect(controlsOutsideTheRow()).toEqual([]);
    // The box opens from its icon, in the same row.
    expect(document.querySelector("[data-entity-list-search]")).toBeNull();
  });

  it("opens the search in place of the lanes, still one row", async () => {
    await render(390);
    const open = document.querySelector<HTMLButtonElement>("[data-entity-list-phone-controls] button[aria-label^='Search']")!;
    await act(async () => {
      open.click();
    });
    const box = document.querySelector("[data-entity-list-search]");
    expect(box).not.toBeNull();
    expect(document.querySelector("[data-entity-list-control-row]")!.contains(box)).toBe(true);
    expect(controlsOutsideTheRow()).toEqual([]);
  });

  it("keeps the desktop toolbar its own row above the phone width", async () => {
    await render(1440);
    expect(document.querySelector("[data-entity-list-phone-controls]")).toBeNull();
    expect(document.querySelector("[data-entity-list-search]")).not.toBeNull();
  });
});
