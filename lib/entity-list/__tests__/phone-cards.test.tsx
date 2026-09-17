/**
 * EVERY ENTITY LIST HAS A PHONE LAYOUT, WITHOUT ITS SURFACE WRITING ONE.
 *
 * 🚨 THE DEFECT (cold-walk-6, measured live at 390×844 as `admin@admin.com`,
 * 2026-09-17). `/masterwork/all` rendered a SEVEN-column, 3,065px-wide table
 * inside the phone's 364px content box; `/masterwork/encore` 1,720px. Nothing
 * was clipped — the table scrolls sideways inside its own box — but a phone
 * showed about one and a half columns of seven, and the record name, the one
 * value a person is looking for, was a 2,483px anchor 20px tall.
 *
 * IT IS A CLASS, NOT AN INSTANCE. `MatrxDataTable` has carried a `mobileCards`
 * seam since 2026-08-25 and `EntityListConfig` forwarded it, and NOT ONE of the
 * ~23 `EntityListPage` surfaces ever supplied one — a per-surface phone layout
 * is work no list owner gets to. So the DEFAULT moved into the shell: the cards
 * are derived from the columns a surface already declared, and a surface only
 * overrides the roles the derivation gets wrong (`EntityColumnSpec.phone`).
 *
 * RED AGAINST THE PRE-FIX SHELL: with `mobileCards={config.mobileCards}` (no
 * `?? defaultMobileCards`) restored in `EntityListTable.tsx`, every test in
 * "a list surface that declares no phone layout" fails — no
 * `[data-entity-phone-card]` node is rendered at all — and the derivation
 * tests do not compile, because `resolvePhoneCardLayout` does not exist.
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
import { DATE_FILTER_OPTIONS, type EntityColumnSpec } from "../columns";
import { resolvePhoneCardLayout } from "../phoneCards";
import type { EntityListConfig } from "../config";

interface Row {
  id: string;
  name: string;
  status: string;
  source: string;
  rules: number;
  version: number;
  updated_at: string;
}

const NO_COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };

const ROWS: Row[] = [
  {
    id: "r1",
    name: "Pallet Routing Desk",
    status: "Ready",
    source: "Interview",
    rules: 11,
    version: 27,
    updated_at: "2026-09-16T10:00:00.000Z",
  },
  {
    id: "r2",
    name: "E-waste Manual Sort Decider",
    status: "Draft",
    source: "Red pen",
    rules: 4,
    version: 3,
    updated_at: "2026-09-15T10:00:00.000Z",
  },
];

/** The seven-column shape `/masterwork/all` really declares. */
function columns(
  overrides: Partial<Record<string, EntityColumnSpec<Row>["phone"]>> = {},
): EntityColumnSpec<Row>[] {
  const spec = (
    id: string,
    label: string,
    cell: (row: Row) => React.ReactNode,
    extra: Partial<EntityColumnSpec<Row>> = {},
  ): EntityColumnSpec<Row> =>
    ({
      id,
      label,
      phone: overrides[id],
      ...extra,
      column: { id, header: label, cell },
    }) as unknown as EntityColumnSpec<Row>;

  return [
    spec("favorite", "Favorite", () => null),
    spec("name", "Name", (r) => r.name, { locked: true }),
    spec("source", "Source", (r) => r.source),
    spec("rules", "Rules", (r) => String(r.rules)),
    spec("version", "Version", (r) => String(r.version)),
    spec("status", "Status", (r) => r.status),
    {
      id: "updated_at",
      label: "Updated",
      phone: overrides.updated_at,
      column: {
        id: "updated_at",
        header: "Updated",
        cell: (r: Row) => r.updated_at.slice(0, 10),
        filterOptions: DATE_FILTER_OPTIONS,
      },
    } as unknown as EntityColumnSpec<Row>,
  ];
}

function config(
  cols: EntityColumnSpec<Row>[] = columns(),
): EntityListConfig<Row> {
  return {
    surfaceKey: `phone-card-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "rulebook", plural: "rulebooks" },
    scopes: ["mine"],
    sourceFeature: "masterwork",
    supportsArchived: false,
    service: {
      fetchPage: async () => ({ rows: ROWS, total: ROWS.length }),
      fetchCounts: async () => NO_COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: cols,
    prefsVersion: 1,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.name,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: () => undefined,
      },
    }),
    emptyState: { title: "No rulebooks yet", description: "Make one." },
  } as unknown as EntityListConfig<Row>;
}

describe("the phone card layout derived from a surface's own columns", () => {
  it("makes the door column the title and the date column the quiet meta line", () => {
    const layout = resolvePhoneCardLayout(columns(), { doorColumn: "name" });
    expect(layout.title?.id).toBe("name");
    expect(layout.favorite?.id).toBe("favorite");
    expect(layout.meta.map((c) => c.id)).toEqual(["updated_at"]);
  });

  it("promotes exactly two fields to the card face and puts the rest one tap away", () => {
    const layout = resolvePhoneCardLayout(columns(), { doorColumn: "name" });
    expect(layout.primary.map((c) => c.id)).toEqual(["source", "rules"]);
    expect(layout.rest.map((c) => c.id)).toEqual(["version", "status"]);
  });

  it("lets a surface declare what matters instead — the promoted fields change", () => {
    const layout = resolvePhoneCardLayout(
      columns({ status: "primary", source: "rest", rules: "off" }),
      { doorColumn: "name" },
    );
    expect(layout.primary.map((c) => c.id)).toEqual(["status", "version"]);
    expect(layout.rest.map((c) => c.id)).toEqual(["source"]);
    // `off` means off: a column declared off is on no line of the card.
    const everywhere = [
      layout.title,
      ...layout.primary,
      ...layout.meta,
      ...layout.rest,
    ].map((c) => c?.id);
    expect(everywhere).not.toContain("rules");
  });

  it("never brings back a column the user hid in the column picker", () => {
    const layout = resolvePhoneCardLayout(columns(), {
      doorColumn: "name",
      hiddenColumns: ["source", "version"],
    });
    const everywhere = [
      layout.title,
      ...layout.primary,
      ...layout.meta,
      ...layout.rest,
    ].map((c) => c?.id);
    expect(everywhere).not.toContain("source");
    expect(everywhere).not.toContain("version");
  });

  it("falls back to the first real column when the surface declares no door", () => {
    const layout = resolvePhoneCardLayout(columns(), { doorColumn: null });
    expect(layout.title?.id).toBe("name");
  });
});

describe("a list surface that declares no phone layout", () => {
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
    await act(async () => {
      await Promise.resolve();
    });
  }

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function cards(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>("[data-entity-phone-card]"),
    );
  }

  it("still gets one stacked card per row, carrying the record's name", async () => {
    await render(config());
    expect(cards()).toHaveLength(ROWS.length);
    expect(cards()[0].textContent).toContain("Pallet Routing Desk");
    expect(cards()[1].textContent).toContain("E-waste Manual Sort Decider");
  });

  it("keeps the row's identity anchor, so right-click and long-press still resolve it", async () => {
    await render(config());
    expect(cards().map((c) => c.getAttribute("data-row-id"))).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("shows the promoted fields and hides the rest behind one tap", async () => {
    await render(config());
    const card = cards()[0];
    expect(card.textContent).toContain("Interview"); // source — promoted
    expect(card.textContent).not.toContain("Ready"); // status — behind More

    const more = Array.from(card.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("more fields"),
    );
    expect(more).toBeDefined();
    await act(async () => {
      more!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(cards()[0].textContent).toContain("Ready");
  });

  it("leaves a surface that wrote its own phone card alone", async () => {
    const cfg = {
      ...config(),
      mobileCards: (row: Row) => (
        <article data-own-card>{`Bespoke ${row.name}`}</article>
      ),
    } as unknown as EntityListConfig<Row>;
    await render(cfg);
    expect(cards()).toHaveLength(0);
    expect(document.querySelectorAll("[data-own-card]")).toHaveLength(
      ROWS.length,
    );
  });
});
