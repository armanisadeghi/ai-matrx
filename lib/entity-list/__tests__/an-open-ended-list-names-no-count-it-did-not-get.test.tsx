/**
 * AN OPEN-ENDED LIST NAMES NO COUNT IT DID NOT GET (TABLE-ACTIONS fix round, 2026-10-03).
 *
 * A store that pages a list and names no count (the Data home's Archived filter) answers each page
 * with `hasMore` instead of a total. The pager must draw the rows it has, say "1-25" with no
 * "of N", and offer Next exactly when the store has more.
 * Breaks named:
 * - the shell ignores `hasMore` → "1-25 of 25" (a count the store never gave) and no Next → red.
 * - Next offered after the store said the list ended → red.
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
import { EMPTY_FACETS } from "../types";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  label: string;
}

const PAGE = 25;
const SIZE = 60; // the store holds 60; it never says so.

function config(): EntityListConfig<Row> {
  return {
    surfaceKey: `open-ended-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "table", plural: "tables" },
    scopes: ["all", "mine"],
    sourceFeature: "udt",
    service: {
      fetchPage: async (query: { page: number }, sort: { pageSize: number }) => {
        const start = (query.page - 1) * sort.pageSize;
        const rows = Array.from({ length: Math.max(0, Math.min(sort.pageSize, SIZE - start)) }, (_, i) => ({
          id: `t-${start + i}`,
          label: `Retired referral log ${start + i}`,
        }));
        return { rows, total: start + rows.length, hasMore: start + rows.length < SIZE };
      },
      fetchCounts: async () => ({ byKind: {}, narrow: {}, uncounted: true }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "label",
        label: "Table",
        locked: true,
        column: { id: "label", header: "Table", cell: (row: Row) => row.label },
      } as unknown as EntityListConfig<Row>["columns"][number],
    ],
    prefsVersion: 1,
    prefsDefaults: { pageSize: PAGE },
    urlState: false,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.label,
    useRowActions: () => ({
      actions: { menuFor: () => () => ({ sections: [] }), onOpenRow: () => undefined },
    }),
    supportsArchived: false,
  } as unknown as EntityListConfig<Row>;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
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
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const nextButton = () =>
  [...container.querySelectorAll("button")].find((b) => /next/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));

it("draws the first page with no count and a working Next", async () => {
  const text = container.textContent ?? "";
  expect(text).toContain("Retired referral log 0");
  expect(text).toContain("1-25");
  expect(text).not.toMatch(/of\s*25\b/);
  expect(nextButton()?.hasAttribute("disabled")).toBe(false);
});

it("the lane tabs say no number the store did not give", () => {
  const tabs = container.querySelector('[role="tablist"][aria-label="List scope"]')?.textContent ?? "";
  expect(tabs).toContain("Mine");
  expect(tabs).not.toMatch(/\d/);
});

it("offers no Next after the store says the list ended", async () => {
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      nextButton()!.click();
    });
  }
  const text = container.textContent ?? "";
  expect(text).toContain("Retired referral log 59");
  expect(text).toContain("51-60");
  expect(nextButton()?.hasAttribute("disabled")).toBe(true);
});
