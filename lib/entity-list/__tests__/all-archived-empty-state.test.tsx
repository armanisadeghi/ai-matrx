/**
 * A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING ROWS.
 *
 * 🚨 THE DEFECT (row F10 repair, 2026-09-10, measured on localhost `/maps` as
 * `admin@admin.com` with all 46 of that account's maps archived). The page
 * printed, under a **New map** button:
 *
 *     "No maps yet"
 *     "A map is a picture of how something works — steps, people, or parts,
 *      with arrows between them. Make one and drag it into shape."
 *
 * while its own Filters & Sort → Archived control, two clicks away, held all
 * 46. THE ARCHIVED-ITEMS LAW §2 makes the archive filter default to HIDING
 * archived rows, so "the live half is empty" and "there is nothing here" are
 * different facts — and the shell was printing the second knowing only the
 * first, out of the config's STATIC `emptyState`.
 *
 * IT IS A CLASS, NOT AN INSTANCE. `EntityListConfig` gave a surface no way to
 * name an archived count at all, so every archive-aware config on the shell
 * inherited it verbatim: `/maps` (canvas), `/agents/all` (`agent.definition`),
 * `/workflows/all` (`workflow.definition`) and `/work/conversations`. That is
 * why the repair is `lib/entity-list` — the controller learns the archived
 * count (`ArchivedProbe`), and the shell refuses to assert "none" until it
 * answers zero.
 *
 * These tests drive the REAL `EntityListPage` through the REAL `useEntityList`
 * against a service that behaves exactly like `features/canvas/maps/service.ts`
 * does: `archived: "active"` returns the live half, `archived: "archived"`
 * returns the archived half.
 *
 * RED AGAINST THE PRE-FIX SHELL — measured by restoring `EntityListPage.tsx`,
 * `useEntityList.ts`, `types.ts` and `config.tsx` from HEAD (`41fb3da018`):
 * the all-archived tests print "No maps yet", offer no door, and the
 * probe/knob tests do not compile against a controller with no `archivedProbe`
 * or `defaultArchived`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The toolbar's popover measures itself; jsdom has no ResizeObserver. Layout
// machinery, not the behaviour under test.
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
import {
  countActiveFilters,
  DEFAULT_ENTITY_LIST_QUERY,
  EMPTY_FACETS,
  type EntityListQuery,
  type EntityScopeCounts,
} from "../types";
import type { EntityListConfig } from "../config";

interface MapRow {
  id: string;
  title: string;
}

const NO_COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };

/** The copy `/maps` really ships — so the test proves the LIE is gone. */
const STATIC_EMPTY_TITLE = "No maps yet";
const STATIC_EMPTY_DESCRIPTION =
  "A map is a picture of how something works — steps, people, or parts, with arrows between them. Make one and drag it into shape.";

interface Corpus {
  live: MapRow[];
  archived: MapRow[];
  /** Make the archived read throw, the way a broken/refused count does. */
  archivedReadThrows?: boolean;
  supportsArchived?: boolean;
}

/** Every `fetchPage` call the shell made, so a skipped probe is provable. */
let pageCalls: EntityListQuery[] = [];

function mapsLikeConfig(corpus: Corpus): EntityListConfig<MapRow> {
  return {
    surfaceKey: `all-archived-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "map", plural: "maps" },
    scopes: ["mine"],
    sourceFeature: "canvas",
    supportsArchived: corpus.supportsArchived,
    service: {
      fetchPage: async (query: EntityListQuery) => {
        pageCalls.push(query);
        if (query.archived === "archived") {
          if (corpus.archivedReadThrows)
            throw new Error("count your maps failed");
          return { rows: corpus.archived, total: corpus.archived.length };
        }
        if (query.archived === "all")
          return {
            rows: [...corpus.live, ...corpus.archived],
            total: corpus.live.length + corpus.archived.length,
          };
        return { rows: corpus.live, total: corpus.live.length };
      },
      fetchCounts: async () => NO_COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "title",
        label: "Name",
        locked: true,
        column: {
          id: "title",
          header: "Name",
          cell: (row: MapRow) => row.title,
        },
      } as unknown as EntityListConfig<MapRow>["columns"][number],
    ],
    prefsVersion: 1,
    getRowId: (row: MapRow) => row.id,
    getRowName: (row: MapRow) => row.title,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: () => undefined,
      },
    }),
    emptyState: {
      title: STATIC_EMPTY_TITLE,
      description: STATIC_EMPTY_DESCRIPTION,
    },
  } as unknown as EntityListConfig<MapRow>;
}

function makeMaps(count: number, prefix: string): MapRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `${prefix} map ${i}`,
  }));
}

function screenText(): string {
  return document.body.textContent ?? "";
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(label),
  ) as HTMLButtonElement | undefined;
}

describe("an entity list whose live half is empty because everything is archived", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function render(corpus: Corpus) {
    pageCalls = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const store = makeStore();
    await act(async () => {
      root.render(
        <Provider store={store}>
          <TooltipProvider>
            <EntityListPage
              config={mapsLikeConfig(corpus)}
              emptyAction={<button type="button">New map</button>}
            />
          </TooltipProvider>
        </Provider>,
      );
    });
    // Let the archived probe, which is only fired once the live half comes
    // back empty, settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("NEVER prints the static 'none yet' copy when archived rows exist", async () => {
    await render({ live: [], archived: makeMaps(46, "archived") });
    expect(screenText()).not.toContain(STATIC_EMPTY_TITLE);
    expect(screenText()).not.toContain(STATIC_EMPTY_DESCRIPTION);
  });

  it("says how many are archived, in the law's words", async () => {
    await render({ live: [], archived: makeMaps(46, "archived") });
    expect(screenText()).toContain("All 46 maps are archived");
  });

  it("offers a ONE-CLICK door that reveals exactly the rows it counted", async () => {
    await render({ live: [], archived: makeMaps(46, "archived") });
    const door = findButton("Show the 46 archived maps");
    expect(door).toBeDefined();

    await act(async () => {
      door!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The click changed the QUERY, not a client-side sieve: the shell re-asked
    // the service for the archived half, and the rows are on screen.
    expect(pageCalls.at(-1)?.archived).toBe("archived");
    expect(screenText()).toContain("archived map 0");
    expect(screenText()).not.toContain("All 46 maps are archived");
  });

  it("stays grammatical, and honest, for a single archived row", async () => {
    await render({ live: [], archived: makeMaps(1, "archived") });
    expect(screenText()).toContain("The only map here is archived");
    expect(findButton("Show the archived map")).toBeDefined();
  });

  it("KEEPS the static copy when live + archived really is zero", async () => {
    await render({ live: [], archived: [] });
    expect(screenText()).toContain(STATIC_EMPTY_TITLE);
    expect(screenText()).toContain(STATIC_EMPTY_DESCRIPTION);
    // …and the create door the surface supplied is still there.
    expect(findButton("New map")).toBeDefined();
  });

  it("never asks the extra question on a surface with no archive axis", async () => {
    await render({ live: [], archived: [], supportsArchived: false });
    expect(pageCalls.some((q) => q.archived === "archived")).toBe(false);
    expect(screenText()).toContain(STATIC_EMPTY_TITLE);
  });

  it("costs a list that HAS rows nothing at all", async () => {
    await render({ live: makeMaps(3, "live"), archived: makeMaps(9, "arch") });
    expect(pageCalls.some((q) => q.archived === "archived")).toBe(false);
  });

  it("says it CANNOT TELL when the archived read breaks — never 'none yet'", async () => {
    await render({ live: [], archived: [], archivedReadThrows: true });
    expect(screenText()).not.toContain(STATIC_EMPTY_TITLE);
    expect(screenText()).toContain("did not answer");
  });

  it("tells a NARROWED page that archived rows matched, with the same door", async () => {
    await render({ live: [], archived: makeMaps(3, "archived") });
    const search = document.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(search, "river");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Past the 250ms search debounce, then the probe.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screenText()).toContain("No live maps match");
    expect(screenText()).toContain("3 archived maps did");
    expect(screenText()).toContain("open the archived maps");
    expect(findButton("Show the 3 archived maps")).toBeDefined();
  });
});

/**
 * THE ARCHIVE AXIS IS COMPARED AGAINST THE SURFACE'S DEFAULT, NOT "active".
 *
 * THE ARCHIVED-ITEMS LAW §6 made the starting value a user knob. Hardcoding
 * the literal here meant a user whose knob is "Active + archived" met an
 * UNTOUCHED page reporting one active filter — the permanent lie
 * `countActiveFilters` exists to prevent, and enough to send the shell down
 * the "No maps match … clear your filters" branch with nothing filtered.
 */
describe("countActiveFilters", () => {
  const untouched = (archived: EntityListQuery["archived"]): EntityListQuery => ({
    ...DEFAULT_ENTITY_LIST_QUERY,
    archived,
  });

  it("counts nothing on an untouched page, whatever the user's knob is", () => {
    expect(countActiveFilters(untouched("active"), "active")).toBe(0);
    expect(countActiveFilters(untouched("all"), "all")).toBe(0);
    expect(countActiveFilters(untouched("archived"), "archived")).toBe(0);
  });

  it("counts the archive axis once the user moves it off their own default", () => {
    expect(countActiveFilters(untouched("archived"), "active")).toBe(1);
    expect(countActiveFilters(untouched("active"), "all")).toBe(1);
  });

  it("still defaults to the platform default for callers that have no knob", () => {
    expect(countActiveFilters(untouched("active"))).toBe(0);
    expect(countActiveFilters(untouched("all"))).toBe(1);
  });
});
