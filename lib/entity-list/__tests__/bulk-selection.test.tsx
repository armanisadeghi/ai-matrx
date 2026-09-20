/**
 * BULK SELECTION IS A CAPABILITY OF THE SHARED LIST PRIMITIVE, AND IT IS OPT-IN.
 *
 * 🚨 THE DEFECT THIS CLOSES. Eighteen `EntityListPage` surfaces could sort,
 * search, facet and page a server-side corpus and not one of them could act on
 * two rows at once. `MatrxDataTable` has carried a `selection` contract for
 * months and no list surface ever passed it, because `EntityListConfig` gave a
 * surface no way to DECLARE what a bulk action is.
 *
 * 🚨 THE DEFECT THIS PREVENTS. A header checkbox over a server-paged list can
 * only truthfully mean "the rows on this page". A person looking at 3 of 7
 * reads it as "everything". So the two meanings are separate and both are said
 * out loud — and a surface that cannot serve the bigger one SAYS so rather than
 * leaving the bigger number unmentioned.
 *
 * RED AGAINST THE PRE-FIX SHELL:
 *   · "a surface that declares no bulk actions" — make the shell pass
 *     `selection` unconditionally (drop the `{...(tableSelection ? … : {})}`
 *     spread in EntityListPage.tsx) and every test in that block fails: a
 *     checkbox column appears on all eighteen surfaces.
 *   · every other block — delete `bulkActions` from `EntityListConfig` (or the
 *     `EntityBulkSelectAllBanner` from EntityListPage.tsx) and they fail: no
 *     checkbox, no bar, no banner, no keyboard.
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

const toasts: { kind: string; message: string }[] = [];
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (message: string) => toasts.push({ kind: "error", message }),
    success: (message: string) => toasts.push({ kind: "success", message }),
  },
  toastErrorAlreadyCaptured: () => undefined,
}));

const confirms: { title: string; description: string }[] = [];
let confirmAnswer = true;
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async (options: { title: string; description: string }) => {
    confirms.push({
      title: String(options.title),
      description: String(options.description),
    });
    return confirmAnswer;
  },
}));

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntityListPage } from "../components/EntityListPage";
import {
  EMPTY_FACETS,
  type EntityListQuery,
  type EntityListSort,
  type EntityScopeCounts,
} from "../types";
import type { EntityColumnSpec } from "../columns";
import type { EntityListConfig } from "../config";
import type { EntityBulkSelection } from "../selection";
import {
  bulkFilterKey,
  bulkSelectionMode,
  bulkFilterFromQuery,
} from "../selection";
import { DEFAULT_ENTITY_LIST_QUERY } from "../types";

interface Row {
  id: string;
  name: string;
  status: string;
}

const NO_COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };

/** Seven rows, three per page: "on screen" and "matching" are different sets. */
const ALL_ROWS: Row[] = Array.from({ length: 7 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `Record ${i + 1}`,
  status: i % 2 === 0 ? "Ready" : "Draft",
}));

const PAGE_SIZE = 3;

function columns(): EntityColumnSpec<Row>[] {
  return [
    {
      id: "name",
      label: "Name",
      locked: true,
      column: { id: "name", header: "Name", cell: (r: Row) => r.name },
    },
    {
      id: "status",
      label: "Status",
      column: { id: "status", header: "Status", cell: (r: Row) => r.status },
    },
  ] as unknown as EntityColumnSpec<Row>[];
}

let fetchPageCalls: { page: number; pageSize: number }[] = [];
let received: EntityBulkSelection<Row>[] = [];
let runCount = 0;

function config(
  overrides: Partial<EntityListConfig<Row>> = {},
): EntityListConfig<Row> {
  return {
    surfaceKey: `bulk-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "record", plural: "records" },
    scopes: ["mine"],
    sourceFeature: "masterwork",
    supportsArchived: false,
    prefsDefaults: { pageSize: PAGE_SIZE },
    service: {
      fetchPage: async (
        query: EntityListQuery,
        sort: EntityListSort,
      ) => {
        fetchPageCalls.push({ page: query.page, pageSize: sort.pageSize });
        const start = (query.page - 1) * sort.pageSize;
        return {
          rows: ALL_ROWS.slice(start, start + sort.pageSize),
          total: ALL_ROWS.length,
        };
      },
      fetchCounts: async () => NO_COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: columns(),
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.name,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: () => undefined,
      },
    }),
    emptyState: { title: "No records yet", description: "Make one." },
    ...overrides,
  } as unknown as EntityListConfig<Row>;
}

/** The surface under test for every opt-in block: one Archive-shaped action. */
function bulkConfig(
  overrides: Partial<EntityListConfig<Row>> = {},
  actionOverrides: Record<string, unknown> = {},
): EntityListConfig<Row> {
  return config({
    bulkActions: [
      {
        id: "archive",
        label: "Archive",
        variant: "destructive",
        confirm: (selection: EntityBulkSelection<Row>) => ({
          title: `Archive ${selection.count} records?`,
          description: `They leave every list until someone restores them.`,
        }),
        // Returning a RESULT is how an action says it actually ran — see
        // `EntityBulkAction.run`. An action that resolves with nothing is
        // telling the shell it did not run (the person cancelled its dialog),
        // and the shell then keeps the selection and says nothing.
        run: (selection: EntityBulkSelection<Row>) => {
          runCount += 1;
          received.push(selection);
          return {};
        },
        ...actionOverrides,
      },
    ],
    bulkSelection: { selectAllMatching: true },
    ...overrides,
  } as Partial<EntityListConfig<Row>>);
}

let container: HTMLDivElement;
let root: Root;

async function render(cfg: EntityListConfig<Row>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = makeStore();
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
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function rowCheckboxes(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "tbody [data-matrx-table-selection-target] [role='checkbox']",
    ),
  );
}

function headerCheckbox(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "thead [data-matrx-table-selection-target] [role='checkbox']",
  );
}

function banner(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-entity-bulk-banner]");
}

function bulkButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-entity-bulk-action='${id}']`);
}

async function click(el: Element, init: MouseEventInit = {}) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  });
  await settle();
}

async function key(k: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }),
    );
  });
  await settle();
}

beforeEach(() => {
  fetchPageCalls = [];
  received = [];
  runCount = 0;
  toasts.length = 0;
  confirms.length = 0;
  confirmAnswer = true;
});

afterEach(async () => {
  // The vocabulary block mounts nothing.
  if (!root) return;
  await act(async () => root.unmount());
  container.remove();
  root = undefined as unknown as Root;
});

describe("the two meanings of select-all, as pure vocabulary", () => {
  it("only calls a selection 'everything matching' while the live query still matches", () => {
    const first = bulkFilterKey(bulkFilterFromQuery(DEFAULT_ENTITY_LIST_QUERY));
    const searched = bulkFilterKey(
      bulkFilterFromQuery({ ...DEFAULT_ENTITY_LIST_QUERY, search: "pallet" }),
    );
    expect(bulkSelectionMode(first, first)).toBe("matching");
    expect(bulkSelectionMode(first, searched)).toBe("ids");
    expect(bulkSelectionMode(null, first)).toBe("ids");
  });

  it("ignores the order the filter bag was built in, which changes every render", () => {
    const a = bulkFilterKey(
      bulkFilterFromQuery({
        ...DEFAULT_ENTITY_LIST_QUERY,
        filters: {
          status: { kind: "text", value: "x" },
          kind: { kind: "text", value: "y" },
        },
      }),
    );
    const b = bulkFilterKey(
      bulkFilterFromQuery({
        ...DEFAULT_ENTITY_LIST_QUERY,
        filters: {
          kind: { kind: "text", value: "y" },
          status: { kind: "text", value: "x" },
        },
      }),
    );
    expect(a).toBe(b);
  });
});

describe("a surface that declares no bulk actions", () => {
  it("renders no checkbox anywhere — not in the header, not on a row", async () => {
    await render(config());
    expect(rowCheckboxes()).toHaveLength(0);
    expect(headerCheckbox()).toBeNull();
    expect(
      document.querySelectorAll("[data-matrx-table-selection-column]"),
    ).toHaveLength(0);
  });

  it("renders no bulk banner and no checkbox on its phone card", async () => {
    await render(config());
    expect(banner()).toBeNull();
    expect(
      document.querySelectorAll("[data-entity-phone-card-select]"),
    ).toHaveLength(0);
  });

  it("ignores the bulk keyboard entirely", async () => {
    await render(config());
    await key("a", { metaKey: true });
    await key("x");
    expect(rowCheckboxes()).toHaveLength(0);
    expect(banner()).toBeNull();
  });
});

describe("a surface that declares bulk actions", () => {
  it("gives every row a checkbox and shows the declared action once one is ticked", async () => {
    await render(bulkConfig());
    expect(rowCheckboxes()).toHaveLength(PAGE_SIZE);
    expect(bulkButton("archive")).toBeNull();

    await click(rowCheckboxes()[0]);
    expect(bulkButton("archive")).not.toBeNull();
    expect(document.body.textContent).toContain("1 record selected");
  });

  it("selects a range on shift-click instead of one row at a time", async () => {
    await render(bulkConfig());
    await click(rowCheckboxes()[0]);
    await click(rowCheckboxes()[2], { shiftKey: true });
    expect(document.body.textContent).toContain("3 records selected");
  });

  it("keeps the selection when the list is re-sorted or paged", async () => {
    await render(bulkConfig());
    await click(rowCheckboxes()[0]);
    const next = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").trim().startsWith("Next"),
    );
    if (next) await click(next);
    expect(document.body.textContent).toContain("1 record selected");
  });

  it("puts a 44px-capable tap area on the phone card's checkbox", async () => {
    await render(bulkConfig());
    const label = document.querySelector<HTMLElement>(
      "[data-entity-phone-card-select]",
    );
    expect(label).not.toBeNull();
    // THE ONE HIT-AREA RING (app/globals.css). The subtree floor deliberately
    // excludes checkboxes, so the ring on the <label> is the only thing that
    // makes this finger-sized.
    expect(label!.className).toContain("matrx-tap-area");
    expect(label!.tagName).toBe("LABEL");
    expect(label!.querySelector("input[type='checkbox']")).not.toBeNull();
  });

  it("renders no checkbox at all for a row the surface refuses in bulk", async () => {
    await render(
      bulkConfig({
        bulkSelection: {
          selectAllMatching: true,
          isRowSelectable: (row: Row) => row.id !== "r2",
        },
      } as Partial<EntityListConfig<Row>>),
    );
    expect(rowCheckboxes()).toHaveLength(PAGE_SIZE - 1);
  });
});

describe("the card list's select-all (the phone, where there is no header row)", () => {
  // 🚨 RED: delete <EntityCardsSelectAll> from EntityListPage.tsx and every
  // test here fails. Below `sm` the table's header row — and the select-all in
  // it — is swapped for stacked cards, so without this control a phone can only
  // select a page one tap at a time and NEVER reaches the "all N matching this
  // filter" offer, which only appears once every row on screen is ticked.
  function cardsSelectAll(): HTMLElement | null {
    return document.querySelector("[data-entity-cards-select-all]");
  }
  function cardsBox(): HTMLInputElement | null {
    return document.querySelector(
      "[data-entity-cards-select-all] input[type='checkbox']",
    );
  }

  it("is absent for a surface that declared no bulk actions", async () => {
    await render(config());
    expect(cardsSelectAll()).toBeNull();
  });

  it("selects every row on screen in one tap, and says so", async () => {
    await render(bulkConfig());
    expect(cardsSelectAll()).not.toBeNull();
    expect(cardsSelectAll()!.textContent).toContain("Select all 3 on this page");
    await act(async () => {
      cardsBox()!.click();
    });
    await settle();
    expect(document.body.textContent).toContain("3 records selected");
    expect(cardsSelectAll()!.textContent).toContain(
      "Deselect all 3 on this page",
    );
  });

  it("reaches the same 'all N matching this filter' offer the table header does", async () => {
    await render(bulkConfig());
    await act(async () => {
      cardsBox()!.click();
    });
    await settle();
    const offer = document.querySelector(
      "[data-entity-bulk-select-all-matching]",
    );
    expect(offer).not.toBeNull();
    await click(offer!);
    expect(document.body.textContent).toContain("7 records selected");
  });

  it("shows a half-ticked page as half-ticked, never as empty", async () => {
    await render(bulkConfig());
    await click(rowCheckboxes()[0]);
    expect(cardsBox()!.indeterminate).toBe(true);
    expect(cardsBox()!.checked).toBe(false);
    expect(cardsSelectAll()!.textContent).toContain("1 of 3 on this page");
  });

  it("unticks only this page, leaving ids ticked elsewhere alone", async () => {
    await render(bulkConfig());
    await act(async () => {
      cardsBox()!.click();
    });
    await settle();
    await act(async () => {
      cardsBox()!.click();
    });
    await settle();
    expect(bulkButton("archive")).toBeNull();
  });

  it("carries the 44px ring and a 44px row, for a finger", async () => {
    await render(bulkConfig());
    const label = cardsSelectAll()!.querySelector("label")!;
    expect(label.className).toContain("matrx-tap-area");
    expect(label.className).toContain("min-h-11");
    // Hidden at every width where the real header checkbox exists.
    expect(cardsSelectAll()!.className).toContain("sm:hidden");
  });
});

describe("the header select-all, and the sentence under it", () => {
  it("says what it did — these three — and offers the seven it did not", async () => {
    await render(bulkConfig());
    await click(headerCheckbox()!);
    expect(document.body.textContent).toContain("3 records selected");
    const text = banner()?.textContent ?? "";
    expect(text).toContain("All 3 records on this page are selected");
    expect(text).toContain("This view matches 7");
    expect(
      document.querySelector("[data-entity-bulk-select-all-matching]"),
    ).not.toBeNull();
  });

  it("names the larger number even where the surface cannot serve it", async () => {
    await render(
      bulkConfig({ bulkSelection: {} } as Partial<EntityListConfig<Row>>),
    );
    await click(headerCheckbox()!);
    const text = banner()?.textContent ?? "";
    expect(text).toContain("Only the 3 records on this page are selected");
    expect(text).toContain("this view matches 7");
    expect(
      document.querySelector("[data-entity-bulk-select-all-matching]"),
    ).toBeNull();
  });

  it("resolves every matching row through the surface's own service", async () => {
    await render(bulkConfig());
    await click(headerCheckbox()!);
    await click(document.querySelector("[data-entity-bulk-select-all-matching]")!);
    expect(document.body.textContent).toContain("7 records selected");
    expect(banner()?.textContent).toContain(
      "Every record matching this filter is selected",
    );
    // Resolved by asking the SAME service with no page, not by a second RPC.
    expect(fetchPageCalls.some((call) => call.pageSize === 500)).toBe(true);
  });

  it("hands the action every id, every row and the filter descriptor", async () => {
    await render(bulkConfig());
    await click(headerCheckbox()!);
    await click(document.querySelector("[data-entity-bulk-select-all-matching]")!);
    await click(bulkButton("archive")!);
    expect(received).toHaveLength(1);
    expect(received[0].mode).toBe("matching");
    expect(received[0].ids).toHaveLength(7);
    expect(received[0].rows).toHaveLength(7);
    expect(received[0].count).toBe(7);
    expect(received[0].filter.scope).toEqual(DEFAULT_ENTITY_LIST_QUERY.scope);
    expect(received[0].filter).not.toHaveProperty("page");
  });
});

describe("an expensive or destructive bulk click", () => {
  it("stops and names the consequence before anything runs", async () => {
    await render(bulkConfig());
    await click(rowCheckboxes()[0]);
    await click(bulkButton("archive")!);
    expect(confirms).toHaveLength(1);
    expect(confirms[0].title).toContain("Archive 1 records?");
    expect(confirms[0].description).toContain("leave every list");
    expect(runCount).toBe(1);
  });

  it("runs nothing when the person says no, and keeps their selection", async () => {
    confirmAnswer = false;
    await render(bulkConfig());
    await click(rowCheckboxes()[0]);
    await click(bulkButton("archive")!);
    expect(runCount).toBe(0);
    expect(document.body.textContent).toContain("1 record selected");
  });

  it("keeps the selection and says why when the action throws", async () => {
    await render(
      bulkConfig(
        {},
        {
          run: () => {
            throw new Error("The archive service refused every row.");
          },
        },
      ),
    );
    await click(rowCheckboxes()[0]);
    await click(bulkButton("archive")!);
    expect(toasts.some((t) => t.kind === "error")).toBe(true);
    expect(toasts[toasts.length - 1].message).toContain("refused every row");
    expect(document.body.textContent).toContain("1 record selected");
  });

  it("clears the selection once the work is done", async () => {
    await render(bulkConfig());
    await click(rowCheckboxes()[0]);
    await click(bulkButton("archive")!);
    expect(document.body.textContent).not.toContain("1 record selected");
    expect(bulkButton("archive")).toBeNull();
  });

  /**
   * 🚨 jobs-bar cold-walk-13, Friction: "Cancel on the Send dialog discards
   * the selection, so three carefully-made clicks are gone."
   *
   * The Library's Transcribe and Send verbs resolve a promise that a DIALOG
   * settles, and so does the exports Library's Send — three surfaces, one
   * shape. Cancel resolved with nothing, the shell read that as `{}`, and it
   * both cleared the selection and raised a SUCCESS toast for work that was
   * never started. On 2,981 episodes that is three ticks thrown away, plus a
   * sentence saying the thing you just refused had run.
   *
   * RED PROOF: restore `(await action.run(target)) ?? {}` in
   * `EntityBulkBar.tsx` and delete the `if (result == null) return;` under it
   * — both assertions below fail, the selection vanishing and a success toast
   * appearing.
   */
  it("keeps the selection and says nothing when the action did not run", async () => {
    await render(
      bulkConfig(
        {},
        {
          // What a dialog's Cancel resolves: nothing happened.
          run: () => undefined,
        },
      ),
    );
    await click(rowCheckboxes()[0]);
    await click(bulkButton("archive")!);
    expect(document.body.textContent).toContain("1 record selected");
    expect(bulkButton("archive")).not.toBeNull();
    expect(toasts).toHaveLength(0);
  });
});

describe("the keyboard", () => {
  it("selects everything on screen with cmd/ctrl-A and clears with Escape", async () => {
    await render(bulkConfig());
    const row = document.querySelector<HTMLElement>("tbody [data-row-id]")!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await key("a", { metaKey: true });
    expect(document.body.textContent).toContain("3 records selected");
    await key("Escape");
    expect(bulkButton("archive")).toBeNull();
  });

  it("toggles the row under the pointer with x", async () => {
    await render(bulkConfig());
    const row = document.querySelector<HTMLElement>("tbody [data-row-id]")!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await key("x");
    expect(document.body.textContent).toContain("1 record selected");
    await key("x");
    expect(bulkButton("archive")).toBeNull();
  });

  it("never steals a key from a text field the person is typing in", async () => {
    await render(bulkConfig());
    const search = document.querySelector<HTMLInputElement>(
      "input[type='search'], input[placeholder^='Search']",
    );
    expect(search).not.toBeNull();
    search!.focus();
    await key("x");
    await key("a", { metaKey: true });
    expect(bulkButton("archive")).toBeNull();
  });
});
