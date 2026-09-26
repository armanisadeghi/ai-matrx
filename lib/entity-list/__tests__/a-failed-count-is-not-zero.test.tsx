/**
 * A FAILED COUNT IS NOT ZERO.
 *
 * 🚨 THE DEFECT (2026-09-26, /mandates/list-preview as test@test.com). The
 * member mandate list's counts read died with 57014 (statement timeout) while
 * its rows loaded, and every scope tab read `0` above a populated list:
 * `useEntityList` settles a failed counts read to EMPTY_SCOPE_COUNTS, and a
 * settled empty count rendered as `0` because the tabs were only told
 * "loading", never "failed". The screen was confidently wrong, and it said
 * nothing about why or what to do.
 *
 * THE FIX, in the shared shell: a count that failed shows NO number, and one
 * plain sentence (EntitySourceFailures) says the counts could not be read,
 * with a Try again that re-asks.
 *
 * RED before the fix: the tab text contained "0" and no notice or Try again
 * was rendered.
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
import { EMPTY_FACETS, type EntityScopeCounts } from "../types";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  label: string;
}

const TIMEOUT = new Error(
  "Mandate list (counts): canceling statement due to statement timeout",
);
const COUNTED: EntityScopeCounts = {
  byKind: { mine: 7, system: 12 },
  narrow: {},
};

function config(countsFail: { current: boolean }): EntityListConfig<Row> {
  return {
    surfaceKey: `failed-count-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "mandate", plural: "mandates" },
    scopes: ["mine", "system"],
    sourceFeature: "agents-other",
    service: {
      fetchPage: async () => ({
        rows: [{ id: "r1", label: "Write the weekly report" }],
        total: 1,
      }),
      fetchCounts: async () => {
        if (countsFail.current) throw TIMEOUT;
        return COUNTED;
      },
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "label",
        label: "Job",
        locked: true,
        column: { id: "label", header: "Job", cell: (row: Row) => row.label },
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

function tabText(container: HTMLElement): string {
  const tablist = container.querySelector('[role="tablist"][aria-label="List scope"]');
  return tablist?.textContent ?? "";
}

describe("a failed count is not zero", () => {
  let container: HTMLDivElement;
  let root: Root;
  const countsFail = { current: true };

  beforeEach(async () => {
    countsFail.current = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <Provider store={makeStore()}>
          <TooltipProvider>
            <EntityListPage config={config(countsFail)} />
          </TooltipProvider>
        </Provider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the rows but no number on any tab", async () => {
    expect(container.textContent).toContain("Write the weekly report");
    expect(tabText(container)).toContain("Mine");
    expect(tabText(container)).not.toMatch(/\d/);
  });

  it("says in plain words that the counts could not be read, and offers Try again", async () => {
    const text = container.textContent ?? "";
    expect(text).toContain("The tab counts took too long to answer.");
    expect(text).not.toContain("canceling statement");
    const retry = [...container.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Try again",
    );
    expect(retry).toBeDefined();

    countsFail.current = false;
    await act(async () => {
      retry!.click();
    });
    expect(tabText(container)).toContain("7");
    expect(tabText(container)).toContain("12");
    expect(container.textContent).not.toContain("The tab counts took too long");
  });
});
