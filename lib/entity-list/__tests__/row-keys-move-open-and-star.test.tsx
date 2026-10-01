/** @jest-environment jsdom */
/**
 * ROW KEYS ARE THE SHELL'S, AND THEY ARE OPT-IN (config.rowKeys — lane DATA-HOME-3C).
 *
 * A list that IS the page (the data home) answers Gmail / Linear list keys through the shell's ONE
 * keyboard handler (the one `x`, cmd-A and Escape already use): `/` focuses the search box, ↓
 * leaves the box for the first row, ↑/↓ move, ↑ from the first row returns to the box, Enter opens
 * the focused row, `s` toggles its favorite, Esc in the box clears the text, then the filters, then
 * leaves. Typing in the box never fires a row key. Every key here is a real KeyboardEvent dispatched
 * on the focused element and bubbling to the window, the way a person's key does.
 *
 * RED AGAINST THE PRE-CHANGE SHELL: without `rowKeys` (or with the handler's row-key block removed)
 * every test in "with rowKeys" fails — `/` leaves the focus on the body and no row ever focuses.
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
  toast: { error: jest.fn(), success: jest.fn() },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntityListPage } from "../components/EntityListPage";
import { EMPTY_FACETS, type EntityListQuery, type EntityScopeCounts } from "../types";
import type { EntityColumnSpec } from "../columns";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = ["Harbor intake", "Furnace service log", "Visit log"].map((name, i) => ({ id: `r${i + 1}`, name }));
const NO_COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };

const opened: string[] = [];
const toggled: string[] = [];
const searches: string[] = [];

function config(overrides: Partial<EntityListConfig<Row>> = {}): EntityListConfig<Row> {
  return {
    surfaceKey: `row-keys-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "table", plural: "tables" },
    scopes: ["mine"],
    sourceFeature: "udt",
    supportsArchived: false,
    urlState: false,
    service: {
      fetchPage: async (query: EntityListQuery) => {
        searches.push(query.search);
        return { rows: ROWS, total: ROWS.length };
      },
      fetchCounts: async () => NO_COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      { id: "name", label: "Name", locked: true, column: { id: "name", header: "Name", cell: (r: Row) => r.name } },
    ] as unknown as EntityColumnSpec<Row>[],
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.name,
    favorite: { isFavorite: () => false, canToggle: () => true },
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: (row: Row) => opened.push(row.id),
        onToggleFavorite: (row: Row) => toggled.push(row.id),
      },
    }),
    emptyState: { title: "No tables yet", description: "New table makes one." },
    ...overrides,
  } as unknown as EntityListConfig<Row>;
}

let container: HTMLDivElement;
let root: Root;

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let store: ReturnType<typeof makeStore>;
async function render(cfg: EntityListConfig<Row>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  store = makeStore();
  await act(async () => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <EntityListPage config={cfg} />
        </TooltipProvider>
      </Provider>,
    );
  });
  await settle();
  await settle();
}

/** A person's key: dispatched where the focus is, bubbling up to the window's handler. */
async function press(key: string, init: KeyboardEventInit = {}) {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  let event!: KeyboardEvent;
  await act(async () => {
    event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
  });
  await settle();
  return event;
}

async function type(text: string) {
  const input = box();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

const box = () => document.querySelector<HTMLInputElement>("[data-entity-list-search]")!;
const focusedRowId = () => (document.activeElement as HTMLElement | null)?.closest("[data-row-id]")?.getAttribute("data-row-id") ?? null;

beforeEach(() => {
  opened.length = 0;
  toggled.length = 0;
  searches.length = 0;
  (document.activeElement as HTMLElement | null)?.blur?.();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("without rowKeys the keyboard is what it was", () => {
  it("`/` and ↓ do nothing, `s` stars nothing", async () => {
    await render(config());
    expect(document.querySelectorAll("tbody [data-row-id]").length).toBe(3);
    const slash = await press("/");
    expect(slash.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
    await press("ArrowDown");
    expect(focusedRowId()).toBeNull();
    await press("s");
    expect(toggled).toEqual([]);
  });
});

describe("with rowKeys", () => {
  it("`/` focuses the box; typing `s` in it stars nothing", async () => {
    await render(config({ rowKeys: true }));
    await press("/");
    expect(document.activeElement).toBe(box());
    const s = await press("s");
    expect(s.defaultPrevented).toBe(false);
    expect(toggled).toEqual([]);
    await press("Enter");
    expect(opened).toEqual([]);
  });

  it("↓ from the box moves into the rows, ↑/↓ move, ↑ from the first row returns to the box", async () => {
    await render(config({ rowKeys: true }));
    await press("/");
    await press("ArrowDown");
    expect(focusedRowId()).toBe("r1");
    await press("ArrowDown");
    expect(focusedRowId()).toBe("r2");
    await press("ArrowDown");
    await press("ArrowDown"); // past the last row: stays
    expect(focusedRowId()).toBe("r3");
    await press("ArrowUp");
    await press("ArrowUp");
    expect(focusedRowId()).toBe("r1");
    await press("ArrowUp");
    expect(document.activeElement).toBe(box());
  });

  it("↓ with nothing focused starts at the first row", async () => {
    await render(config({ rowKeys: true }));
    expect(document.activeElement).toBe(document.body);
    await press("ArrowDown");
    expect(focusedRowId()).toBe("r1");
  });

  it("Enter opens the focused row; `s` stars it", async () => {
    await render(config({ rowKeys: true }));
    await press("ArrowDown");
    await press("ArrowDown");
    const enter = await press("Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(opened).toEqual(["r2"]);
    await press("s");
    expect(toggled).toEqual(["r2"]);
  });

  it("the cursor survives a redraw: a star that remounts the rows keeps the focus on the starred row", async () => {
    let starred = new Set<string>();
    let rerender: () => Promise<void> = async () => undefined;
    const cfg = (): EntityListConfig<Row> =>
      config({
        rowKeys: true,
        // A new key per star remounts every row, the way a re-ask of the service does.
        serviceKey: [...starred].join(","),
        favorite: { isFavorite: (r: Row) => starred.has(r.id), canToggle: () => true },
        useRowActions: () => ({
          actions: {
            menuFor: () => () => ({ sections: [] }),
            onOpenRow: (row: Row) => opened.push(row.id),
            onToggleFavorite: (row: Row) => {
              toggled.push(row.id);
              starred = new Set([...starred, row.id]);
              void rerender();
            },
          },
        }),
      } as Partial<EntityListConfig<Row>>);
    await render(cfg());
    rerender = async () => {
      // Drop the focus the way a redraw of the rows does, then draw the new config.
      (document.activeElement as HTMLElement | null)?.blur?.();
      await act(async () => {
        root.render(
          <Provider store={store}>
            <TooltipProvider>
              <EntityListPage config={cfg()} />
            </TooltipProvider>
          </Provider>,
        );
      });
      await settle();
      await settle();
    };
    await press("ArrowDown");
    await press("ArrowDown");
    expect(focusedRowId()).toBe("r2");
    await press("s");
    await settle();
    expect(toggled).toEqual(["r2"]);
    expect(focusedRowId()).toBe("r2");
  });

  it("a modal on top owns the keys", async () => {
    await render(config({ rowKeys: true }));
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("data-state", "open");
    document.body.appendChild(modal);
    await press("/");
    expect(document.activeElement).not.toBe(box());
    modal.remove();
  });

  it("Esc in the box clears the text, then the filters, then leaves the box", async () => {
    await render(config({ rowKeys: true, searchToggles: [{ id: "title_only", label: "Title only" }] }));
    await press("/");
    await type("harbor");
    expect(box().value).toBe("harbor");
    // A filter: the box's own Title only toggle.
    const toggle = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Title only")!;
    await act(async () => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    box().focus();
    await press("Escape");
    expect(box().value).toBe("");
    expect(document.activeElement).toBe(box());
    await type("x");
    await press("Escape");
    expect(box().value).toBe("");
    // Text gone; the filter is next.
    await press("Escape");
    await type("harbor");
    expect(Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Title only")?.getAttribute("aria-pressed")).toBe("false");
    await press("Escape");
    await press("Escape");
    expect(document.activeElement).not.toBe(box());
  });
});
