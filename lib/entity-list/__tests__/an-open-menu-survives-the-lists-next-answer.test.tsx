/**
 * AN OPEN MENU SURVIVES THE LIST'S NEXT ANSWER (TABLE-ACTIONS fix round, 2026-10-03).
 *
 * A list re-states its service (`serviceKey`) when the data behind the SAME question changes — the
 * Data home bumps it when the server search answers, after a rename, after a star. The rows on screen
 * still answer that question; they were blanked to a skeleton until the new read came back, which
 * unmounted every row and closed the row ⋯ menu a person had open, so their next click fell through
 * to whatever row was under it.
 * Breaks named:
 * - a service re-statement blanks the rows while it re-reads → the open menu closes → red.
 * - a DIFFERENT question (another search) still never shows the old rows → second case.
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

let release: (() => void) | null = null;
let version = 0;

function config(serviceKey: string, search = ""): EntityListConfig<Row> {
  return {
    surfaceKey: "menu-survives-guard",
    serviceKey,
    entityLabel: { singular: "table", plural: "tables" },
    scopes: ["all"],
    sourceFeature: "udt",
    urlState: false,
    service: {
      fetchPage: async () => {
        const asked = version;
        if (asked > 0) await new Promise<void>((r) => (release = r));
        return {
          rows: [
            { id: "t-1", label: "Referral Intake Queue" },
            { id: "t-2", label: asked > 0 ? "Insurance Plan Accounts (renamed)" : "Insurance Plan Accounts" },
          ],
          total: 2,
        };
      },
      fetchCounts: async () => ({ byKind: { all: 2 }, narrow: {} }),
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
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.label,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [{ id: "open", items: [{ id: "open", label: "Open", onSelect: () => undefined }] }] }),
        onOpenRow: () => undefined,
      },
    }),
    supportsArchived: false,
    ...(search ? {} : {}),
  } as unknown as EntityListConfig<Row>;
}

let container: HTMLDivElement;
let root: Root;
const draw = (serviceKey: string) =>
  act(async () => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <EntityListPage config={config(serviceKey)} />
        </TooltipProvider>
      </Provider>,
    );
  });
let store: ReturnType<typeof makeStore>;

beforeEach(async () => {
  version = 0;
  release = null;
  store = makeStore();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await draw("v0");
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("an open row menu stays open, on its row, while the list re-reads the same question", async () => {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions for Referral Intake Queue"]')!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    trigger.click();
  });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();

  version = 1;
  await draw("v1"); // the service re-states itself; its read is still in flight
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(document.contains(trigger)).toBe(true);

  await act(async () => {
    release?.();
  });
  expect(container.textContent).toContain("Insurance Plan Accounts (renamed)");
});
