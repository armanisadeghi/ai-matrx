/**
 * A MISS IN THIS LANE IS NOT A MISS EVERYWHERE.
 *
 * ## The defect (2026-09-29, localhost /education/flashcards as admin@admin.com)
 *
 * Two decks the person had just made on /education/flashcards/new could not be
 * found on the list — "even searched by name". The deck list opens on My Orgs
 * (the registry's view for `fc_set`), and My Orgs is, by definition, OTHER
 * people's records (`fc_set_list_match` 'orgs' arm: created_by IS DISTINCT FROM
 * me). The server was right — `fc_set_list_scoped('mine', …, 'official-ap')`
 * returned both decks and `fc_set_list_counts` put 9 in Mine — but the screen
 * said "No decks match … check a different scope", naming no lane, while the
 * lane counts it already held said exactly where the matches were.
 *
 * ## The SUT and what is real
 *
 * The REAL `EntityListPage` over the REAL `useEntityList`; only the service is
 * a fake, and it behaves like the flashcards RPCs: rows for the lane asked,
 * lane counts under the same search.
 *
 * ## Proven red before green (2026-09-29)
 *
 * Against HEAD's `EntityListPage.tsx` (scratch copy), the page prints the
 * generic "No decks match" with no lane named and no door to Mine.
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
import { EMPTY_FACETS, type EntityListQuery } from "../types";
import type { EntityListConfig } from "../config";

interface Deck {
  id: string;
  name: string;
  mine: boolean;
}

/** Two decks the person made today, and one of an org-mate's. */
const DECKS: Deck[] = [
  { id: "3f5debec", name: "official-ap-biology", mine: true },
  { id: "d553a142", name: "official-ap-biology", mine: true },
  { id: "org-1", name: "Thinking Geographically", mine: false },
];

function inLane(kind: string, search: string): Deck[] {
  const q = search.trim().toLowerCase();
  return DECKS.filter(
    (d) =>
      (kind === "mine" ? d.mine : kind === "orgs" ? !d.mine : false) &&
      (!q || d.name.toLowerCase().includes(q)),
  );
}

let pageCalls: EntityListQuery[] = [];

function deckConfig(): EntityListConfig<Deck> {
  return {
    surfaceKey: `lane-miss-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "deck", plural: "decks" },
    scopes: ["mine", "orgs", "shared", "public"],
    sourceFeature: "education-flashcards",
    supportsArchived: false,
    service: {
      fetchPage: async (query: EntityListQuery) => {
        pageCalls.push(query);
        const rows = inLane(query.scope.kind, query.search);
        return { rows, total: rows.length };
      },
      // The count IS the list: each lane under the same search.
      fetchCounts: async (query: EntityListQuery) => ({
        byKind: {
          mine: inLane("mine", query.search).length,
          team: inLane("mine", query.search).length,
          orgs: inLane("orgs", query.search).length,
          shared: 0,
          public: 0,
        },
        narrow: {},
      }),
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "name",
        label: "Name",
        locked: true,
        column: { id: "name", header: "Name", cell: (row: Deck) => row.name },
      } as unknown as EntityListConfig<Deck>["columns"][number],
    ],
    prefsVersion: 1,
    getRowId: (row: Deck) => row.id,
    getRowName: (row: Deck) => row.name,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: () => undefined,
      },
    }),
    emptyState: {
      title: "No flashcard decks yet",
      description: "A deck is a set of cards you study.",
    },
  } as unknown as EntityListConfig<Deck>;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });

function text(): string {
  return document.body.textContent ?? "";
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(label),
  ) as HTMLButtonElement | undefined;
}

describe("an empty lane names the lanes that hold what the person is looking for", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function mount(url: string) {
    pageCalls = [];
    window.history.replaceState(null, "", url);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <Provider store={makeStore()}>
          <TooltipProvider>
            <EntityListPage config={deckConfig()} />
          </TooltipProvider>
        </Provider>,
      );
    });
    await flush();
  }

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  it("a search that misses in My Orgs says the person's own decks matched in Mine", async () => {
    await mount("/education/flashcards?scope=orgs&q=official-ap-biology");
    expect(text()).toContain("No decks match in My Orgs");
    expect(text()).toContain("2 in Mine");
  });

  it("offers a one-click door to Mine that keeps the search and shows both decks", async () => {
    await mount("/education/flashcards?scope=orgs&q=official-ap-biology");
    const door = button("Show the 2 decks in Mine");
    expect(door).toBeDefined();
    await act(async () => {
      door!.click();
    });
    await flush();
    const last = pageCalls.at(-1)!;
    expect(last.scope.kind).toBe("mine");
    expect(last.search).toBe("official-ap-biology");
    expect(text().match(/official-ap-biology/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("says nothing about other lanes when no lane holds a match", async () => {
    await mount("/education/flashcards?scope=orgs&q=no-such-deck");
    expect(text()).toContain("No decks match");
    expect(text()).not.toContain("in Mine");
    expect(button("Show the")).toBeUndefined();
  });
});
