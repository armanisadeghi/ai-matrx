/**
 * A REFUSAL IS PRINTED ONCE, CARRIES NO DEAD CONTROL, AND IS NEVER CALLED A
 * FILTER PROBLEM.
 *
 * 🚨 THE DEFECT (one-resolution R-O1, measured on production
 * `https://www.aimatrx.com/mandates?scope=system`, 2026-09-08, signed in as the
 * real non-admin `dana.ruiz@example.test` through the product's own
 * `/auth/confirm` magic-link door). `mnd_list_scoped` refuses the system home
 * with one honest sentence. The screen printed that sentence THREE TIMES —
 * once in the shell's failure banner and twice in the toaster, because
 * `useEntityList` toasted every failure and the service re-asks when the
 * caller's organizations land — beside a **Retry** that can never succeed and
 * an empty state reading *"No mandates match … Clear the filters to see the
 * full registry"* with nothing filtered.
 *
 * Two prohibitions of the nothing-fails-silently law on one screen: a dead
 * control, and a sentence that is not true. Both came from ONE missing
 * distinction — the shell held the failure as a bare string and could not tell
 * a refusal from a breakage. `../failure.ts` restores it; these tests pin the
 * three consequences at the level of the SHARED SHELL, not of `/mandates`.
 *
 * The refusal is built from the REAL door class (`MandateListDoorError` over
 * the real 42501 PostgREST payload), so the duck-typed classifier is proven
 * against the thing it actually meets, never against a hand-made stand-in that
 * could hold a state the door cannot.
 *
 * RED AGAINST HEAD BEFORE THE FIX — measured, 5 of these 7 failed:
 *   · one channel, however often it re-asks  → toast.error called TWICE, which
 *     with the banner is production's third copy, reproduced here
 *   · the refusal stays classified           → a bare string came back
 *   · no Retry where retrying cannot work    → the Retry button was rendered
 *   · the empty state never blames filters   → "No mandates match … Clear the
 *     filters to see the full registry", on both the refusal AND the breakage
 *
 * 🔶 ONE HONEST LIMIT. The DOM test below counts the sentence in the rendered
 * page, and this harness mocks `@/lib/toast`, so the toaster's extra copies do
 * not appear in it — that test passed at HEAD and is a regression pin, not the
 * duplication guard. The duplication is guarded where it is caused, by the
 * channel test at the bottom, which really does go from 2 calls to 0.
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

// The context menu asks whether this is a phone. jsdom has no matchMedia; the
// answer ("no") is layout machinery, not the behaviour under test.
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

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntityListPage } from "../components/EntityListPage";
import { useEntityList } from "../useEntityList";
import { EMPTY_FACETS, type EntityScopeCounts } from "../types";
import type { EntityListConfig } from "../config";
import { MandateListDoorError } from "@/features/mandates/list-door";

/** The exact payload PostgREST hands back when the one list door refuses. */
const REFUSAL_SENTENCE =
  "Only a platform administrator can list the system organization's mandates.";
const REFUSAL_REASON =
  "System mandates decide for every user on the platform, so their list is admin-only.";

function doorRefusal(): MandateListDoorError {
  return new MandateListDoorError({
    message: REFUSAL_SENTENCE,
    code: "42501",
    detail: REFUSAL_REASON,
    hint: "Ask for the 'all' home instead.",
  });
}

interface Row {
  id: string;
  label: string;
}

const NO_COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };

function configThatThrows(thrown: unknown): EntityListConfig<Row> {
  return {
    surfaceKey: `refusal-guard-${Math.random().toString(36).slice(2)}`,
    entityLabel: { singular: "mandate", plural: "mandates" },
    scopes: ["orgs"],
    sourceFeature: "agents-other",
    service: {
      fetchPage: async () => {
        throw thrown;
      },
      fetchCounts: async () => NO_COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: [
      {
        id: "label",
        label: "Job",
        locked: true,
        column: {
          id: "label",
          header: "Job",
          cell: (row: Row) => row.label,
        },
      } as unknown as EntityListConfig<Row>["columns"][number],
    ],
    prefsVersion: 1,
    getRowId: (row) => row.id,
    getRowName: (row) => row.label,
    useRowActions: () => ({
      actions: {
        menuFor: () => () => ({ sections: [] }),
        onOpenRow: () => undefined,
      },
    }),
    supportsArchived: false,
    // The sentence production printed under the refusal — kept verbatim so the
    // test proves the LIE is gone, not merely that some copy changed.
    emptyState: {
      title: "No mandates match",
      description:
        "Every named job the platform delegates to an agent appears here. Clear the filters to see the full registry.",
    },
  } as unknown as EntityListConfig<Row>;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** Everything a person can read, page and toaster alike. */
function screenText(): string {
  return document.body.textContent ?? "";
}

describe("a refused list", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function renderWith(thrown: unknown) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const store = makeStore();
    await act(async () => {
      root.render(
        <Provider store={store}>
          <TooltipProvider>
            <EntityListPage config={configThatThrows(thrown)} />
          </TooltipProvider>
        </Provider>,
      );
    });
  }

  beforeEach(() => {
    toastError.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("prints the door's sentence exactly once", async () => {
    await renderWith(doorRefusal());
    expect(screenText()).toContain(REFUSAL_SENTENCE);
    expect(countOccurrences(screenText(), REFUSAL_SENTENCE)).toBe(1);
    expect(countOccurrences(screenText(), REFUSAL_REASON)).toBe(1);
  });

  it("offers no Retry, because retrying cannot succeed", async () => {
    await renderWith(doorRefusal());
    const retries = [...container.querySelectorAll("button")].filter((b) =>
      (b.textContent ?? "").trim().toLowerCase().includes("retry"),
    );
    expect(retries).toHaveLength(0);
  });

  it("never tells the reader to clear filters that are not set", async () => {
    await renderWith(doorRefusal());
    const text = screenText();
    expect(text).not.toContain("Clear the filters to see the full registry");
    expect(text).not.toContain("No mandates match");
    expect(text).toContain("No mandates could be listed");
    expect(text).toContain("You were refused this list");
  });
});

describe("a list read that broke", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    toastError.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const store = makeStore();
    await act(async () => {
      root.render(
        <Provider store={store}>
          <TooltipProvider>
            <EntityListPage
              config={configThatThrows(new Error("The gateway timed out."))}
            />
          </TooltipProvider>
        </Provider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps Retry, which is a real way out here", async () => {
    const retries = [...container.querySelectorAll("button")].filter((b) =>
      (b.textContent ?? "").trim().toLowerCase().includes("retry"),
    );
    expect(retries).toHaveLength(1);
  });

  it("still prints its sentence once, and still does not blame filters", () => {
    expect(countOccurrences(screenText(), "The gateway timed out.")).toBe(1);
    expect(screenText()).not.toContain("Clear the filters to see the full registry");
  });
});

describe("one failure, one channel", () => {
  interface Probe {
    error: unknown;
  }
  let seen: Probe = { error: undefined };

  function Harness({ nonce }: { nonce: number }) {
    const list = useEntityList<Row>({
      service: {
        fetchPage: async () => {
          throw doorRefusal();
        },
        fetchCounts: async () => NO_COUNTS,
        fetchFacets: async () => EMPTY_FACETS,
      },
      // Stands in for `/mandates`: the caller's organizations land after the
      // first render, so the service is re-asked — and every re-ask used to
      // fire another toast for the SAME standing refusal.
      serviceKey: String(nonce),
      getRowId: (row) => row.id,
      entityLabelPlural: "mandates",
      view: {
        sort: "label",
        direction: "asc",
        pageSize: 25,
        favoritesFirst: false,
      },
    });
    seen = { error: list.error };
    return null;
  }

  async function driveTwoAsks() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness nonce={1} />);
    });
    // The caller's organizations land: same query, new service inputs, so the
    // shell re-asks — and the standing refusal comes back a second time.
    await act(async () => {
      root.render(<Harness nonce={2} />);
    });
    act(() => root.unmount());
    container.remove();
  }

  it("announces the failure through ONE channel, however often it re-asks", async () => {
    toastError.mockClear();
    await driveTwoAsks();
    // The failure slot is the ONE place this is announced. Every toast here is
    // a second copy of a sentence already permanently on screen — two of them
    // are what made three copies of one refusal on production.
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the refusal classified, not stringified", async () => {
    toastError.mockClear();
    await driveTwoAsks();
    expect(seen.error).toEqual({
      message: `${REFUSAL_SENTENCE} ${REFUSAL_REASON}`,
      retryable: false,
    });
  });
});
