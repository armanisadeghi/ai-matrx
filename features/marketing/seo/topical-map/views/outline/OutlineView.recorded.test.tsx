/**
 * views/outline/OutlineView.recorded.test.tsx — VERIFIER-A's own pass over the
 * real `OutlineView`, fed RECORDED `seo.map_tree` / `seo.map_topic_associations`
 * / `seo.patch_map_topics` bytes instead of the builder's hand-shaped fixtures.
 *
 * Same harness shape as `OutlineView.test.tsx` (real store, real query client,
 * `data.ts` mocked at the wrapper seam, the same jsdom polyfills) — deliberately
 * NOT reusing its assertions, because this file's job is to catch a defect the
 * builder's own invented data could not surface (a live map's real slugs,
 * spath order, page count, association shape).
 *
 * Fixtures: `__fixtures__/mapTreeAllGreen.recorded.ts` (All Green Recycling,
 * map e9df6779-…, and Factory Playground, map ff2010ec-…, recorded via the
 * Supabase MCP on 2026-09-18) and `__fixtures__/pageAssociationsAllGreen.recorded.ts`
 * (one topic's real `map_topic_associations` rows). The rejected-patch case
 * (g) is built from a REAL refusal recorded the same session: `patch_map_topics`
 * on the live map with `new_slug: "Not A Slug"` answers
 * `{errors:[{slug, message:"invalid new_slug"}], revived:[], updated:[], unchanged:[]}`
 * — a per-edit failure, not a thrown exception, exactly the shape
 * `useOutlineEdits.rename` already branches on.
 *
 * WHAT THIS FILE DOES NOT PROVE (see the report): the recorded associations
 * set is 41 `covers`-role rows with no `intent` edge and no hidden pages —
 * this admin session's real answer for that topic — so case (e)'s "one row
 * per page" collapse, the tone-from-listed-intent path and the hidden-count
 * row are exercised here only for the trivial (`in_place`, nothing hidden)
 * case; the multi-edge and hidden-row shapes stay covered by the builder's
 * `useOutlineRows.test.tsx` against `pageAssociationsShape.ts`, which is left
 * in place, not replaced.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import topicalMapReducer from "../../redux/slice";
import type { TopicalMapKnobs } from "../../knobs";
import { OutlineView } from "../OutlineView";
import {
  ALL_GREEN_MAP_ID,
  ALL_GREEN_WITH_COUNTS,
  ALL_GREEN_WITHOUT_COUNTS,
  FACTORY_PLAYGROUND_MAP_ID,
  FACTORY_PLAYGROUND_TREE,
} from "./__fixtures__/mapTreeAllGreen.recorded";
import {
  ALL_GREEN_ASSOC_TOPIC_SLUG,
  ALL_GREEN_PAGE_ASSOCIATIONS,
} from "./__fixtures__/pageAssociationsAllGreen.recorded";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Same jsdom polyfills as the builder's harness: matchMedia (useIsMobile, the
// tree's coarse-pointer check) and ResizeObserver (Radix) do not exist in jsdom.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** `patch_map_topics`'s own answer to a real refusal, recorded live 2026-09-18
 * against All Green with `new_slug: "Not A Slug"`. A per-edit failure inside a
 * successful call, not a thrown error — the shape `useOutlineEdits.rename`
 * already branches on via `result.errors`. */
const RECORDED_PATCH_REFUSAL = {
  errors: [{ slug: ALL_GREEN_ASSOC_TOPIC_SLUG, message: "invalid new_slug" }],
  revived: [],
  updated: [],
  unchanged: [],
};

const patchMapTopics = jest.fn();
const mapTree = jest.fn();
const mapDiagnostics = jest.fn();
const mapTopicAssociations = jest.fn();

jest.mock("../../data", () => ({
  __esModule: true,
  mapTree: (...args: unknown[]) => mapTree(...args),
  mapDiagnostics: (...args: unknown[]) => mapDiagnostics(...args),
  patchMapTopics: (...args: unknown[]) => patchMapTopics(...args),
  mapTopicAssociations: (...args: unknown[]) => mapTopicAssociations(...args),
  searchMapTopics: jest.fn(async () => []),
  moveMapTopic: jest.fn(),
  retireMapTopics: jest.fn(),
  rejectMapTopics: jest.fn(),
}));

const knobState: { knobs: TopicalMapKnobs | null; loading: boolean; error: Error | null } = {
  knobs: null,
  loading: false,
  error: null,
};
jest.mock("../../knobs", () => ({
  __esModule: true,
  useTopicalMapKnobs: () => knobState,
}));

jest.mock("@/features/assists/components/AssistStrip", () => ({
  __esModule: true,
  AssistStrip: () => null,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  __esModule: true,
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  __esModule: true,
  EntityRef: ({ name }: { name?: string | null }) => <span data-entity-ref>{name}</span>,
}));
const openTopicPanel = jest.fn();
jest.mock("@/features/overlays/openers/topicalMapTopicPanel", () => ({
  __esModule: true,
  useOpenTopicPanel: () => openTopicPanel,
}));
jest.mock("@/lib/layout/useClippedContentGuard", () => ({
  __esModule: true,
  useClippedContentGuard: () => undefined,
}));
jest.mock("@/lib/toast", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog", () => ({
  __esModule: true,
  ClipboardFallbackDialog: () => null,
}));

function knobs(overrides: Partial<TopicalMapKnobs> = {}): TopicalMapKnobs {
  return {
    outline_detail: "labels",
    outline_hover_popover: true,
    outline_intent_dots: true,
    outline_description_max_chars: 120,
    intent_colors: {
      in_place: "green",
      leaving: "amber",
      arriving: "blue",
      delete: "red",
      missing: "gray_dashed",
      planned: "purple_dashed",
    },
    ...overrides,
  } as TopicalMapKnobs;
}

function mount(mapId: string, readOnly = false): { container: HTMLDivElement; root: Root } {
  const store = configureStore({ reducer: { topicalMap: topicalMapReducer } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <OutlineView mapId={mapId} siteId={null} host="page" readOnly={readOnly} />
        </QueryClientProvider>
      </Provider>,
    );
  });
  return { container, root };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function tree(container: HTMLElement): HTMLElement {
  const element = container.querySelector('[role="tree"]');
  if (!(element instanceof HTMLElement)) throw new Error("no tree rendered");
  return element;
}

function press(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

/** Expands the real root that `ALL_GREEN_ASSOC_TOPIC_SLUG` sits under. */
function expandConsumerElectronics(container: HTMLElement): void {
  const row = container.querySelector('[data-topic-tree-row="consumer-electronics-recycling"]');
  const chevron = row?.querySelector("button");
  act(() => {
    chevron?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function topLevelRowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="treeitem"][aria-level="1"]')).map(
    (row) => row.getAttribute("data-topic-tree-row") ?? "",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  knobState.knobs = knobs();
  knobState.loading = false;
  knobState.error = null;
  mapTopicAssociations.mockResolvedValue([]);
  mapDiagnostics.mockResolvedValue({
    topics_total: 50,
    topics_empty: 0,
    topics_empty_sample: [],
    topics_crowded: [],
    topics_proposed: [],
    pages_on_many_topics: [],
    pages_on_no_topic: 0,
    pages_on_no_topic_sample: [],
    retired_with_attachments: [],
    sites_using_map: [],
  });
});

describe("OutlineView — recorded All Green Recycling bytes (map_tree with counts)", () => {
  beforeEach(() => {
    mapTree.mockResolvedValue(ALL_GREEN_WITH_COUNTS);
  });

  it("(a) renders the 13 live root topics in spath order, with the names the database returned", async () => {
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    const ids = topLevelRowIds(container);
    expect(ids).toEqual(ALL_GREEN_WITH_COUNTS.topics.map((t) => t.slug));
    expect(ids.length).toBe(13);
    // The plan/vision brief names 14 roots; the live map has 13 (finding, not
    // a code defect — see the verifier report).
    act(() => root.unmount());
  });

  it("(a) expanding a root reveals its real recorded children", async () => {
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    const first = container.querySelector(
      '[data-topic-tree-row="consumer-electronics-recycling"]',
    );
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    press(tree(container), "ArrowRight");
    await flush();
    const child = container.querySelector(
      '[data-topic-tree-row="audio-and-home-entertainment-electronics-recycling"]',
    );
    expect(child).not.toBeNull();
    act(() => root.unmount());
  });

  it("(b) with outline_detail = counts every row prints the recorded pages/planned/keywords", async () => {
    knobState.knobs = knobs({ outline_detail: "counts" });
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    const row = container.querySelector(
      '[data-topic-tree-row="consumer-electronics-recycling"]',
    );
    expect(row?.textContent).toContain("2140");
    expect(row?.textContent).toContain("35"); // keywords
    act(() => root.unmount());
  });

  it("(d) a text filter for a real deep topic keeps its ancestors visible and nothing else", async () => {
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Find a topic"]');
    expect(input).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "degauss");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The toolbar debounces 150ms before it writes to the slice.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    await flush();
    const rowIds = Array.from(container.querySelectorAll("[data-topic-tree-row]")).map((row) =>
      row.getAttribute("data-topic-tree-row"),
    );
    // "Data Degaussing Services" is the only match; its ancestor
    // "Data Destruction Services" must stay visible to reach it, and nothing
    // else survives the filter.
    expect(rowIds).toEqual(["data-destruction-services", "data-degaussing-services"]);
    act(() => root.unmount());
  });

  it("(e) recorded page rows: one row per real page id, labelled with the recorded urls", async () => {
    mapTopicAssociations.mockImplementation(async (_mapId: string, slug: string) => {
      if (slug === ALL_GREEN_ASSOC_TOPIC_SLUG) return ALL_GREEN_PAGE_ASSOCIATIONS;
      return [];
    });
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    // ALL_GREEN_ASSOC_TOPIC_SLUG is a CHILD of consumer-electronics-recycling;
    // expand the root first so its row exists in the DOM at all.
    expandConsumerElectronics(container);
    await flush();
    const chip = container.querySelector(
      `[data-topic-tree-row="${ALL_GREEN_ASSOC_TOPIC_SLUG}"] button[aria-label^="Show the"]`,
    );
    expect(chip).not.toBeNull();
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const pageRows = Array.from(
      container.querySelectorAll(`[data-topic-tree-row^="page:${ALL_GREEN_ASSOC_TOPIC_SLUG}:"]`),
    );
    expect(pageRows.length).toBe(ALL_GREEN_PAGE_ASSOCIATIONS.length);
    const ids = new Set(pageRows.map((row) => row.getAttribute("data-topic-tree-row")));
    expect(ids.size).toBe(ALL_GREEN_PAGE_ASSOCIATIONS.length); // one row per page id
    // A recorded label (the page's own URL) shows up verbatim.
    expect(container.textContent).toContain(
      "https://allgreenrecycling.com/telephone-recycling",
    );
    // outline_intent_dots gates the dot: recorded here as true (default knob).
    // (No hidden-count row exists in this recorded set — see the file header.)
    act(() => root.unmount());
  });

  it("(e) outline_intent_dots = false drops the dot but keeps every recorded page row", async () => {
    mapTopicAssociations.mockImplementation(async (_mapId: string, slug: string) => {
      if (slug === ALL_GREEN_ASSOC_TOPIC_SLUG) return ALL_GREEN_PAGE_ASSOCIATIONS;
      return [];
    });
    knobState.knobs = knobs({ outline_intent_dots: false });
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    expandConsumerElectronics(container);
    await flush();
    const chip = container.querySelector(
      `[data-topic-tree-row="${ALL_GREEN_ASSOC_TOPIC_SLUG}"] button[aria-label^="Show the"]`,
    );
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const pageRows = container.querySelectorAll(
      `[data-topic-tree-row^="page:${ALL_GREEN_ASSOC_TOPIC_SLUG}:"]`,
    );
    expect(pageRows.length).toBe(ALL_GREEN_PAGE_ASSOCIATIONS.length);
    act(() => root.unmount());
  });

  it("(f) readOnly: no editor on F2 and no drag handle; the Open topic door remains", async () => {
    const { container, root } = mount(ALL_GREEN_MAP_ID, true);
    await flush();
    const first = container.querySelector(
      '[data-topic-tree-row="consumer-electronics-recycling"]',
    );
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    press(tree(container), "F2");
    expect(container.querySelector('input[aria-label="Rename"]')).toBeNull();
    // No drag handle: the label span carries no dnd-kit `aria-roledescription`
    // / `role="button"` attributes when `draggable` is false in `TopicTreeRow`.
    expect(first?.querySelector('[aria-roledescription]')).toBeNull();
    expect(
      container.querySelector(
        'button[aria-label="Open Consumer Electronics Recycling"]',
      ),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("(g) a REAL patch_map_topics refusal shows the RPC's own sentence verbatim in the banner", async () => {
    patchMapTopics.mockResolvedValue(RECORDED_PATCH_REFUSAL);
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    expandConsumerElectronics(container);
    await flush();

    const first = container.querySelector(
      `[data-topic-tree-row="${ALL_GREEN_ASSOC_TOPIC_SLUG}"]`,
    );
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    press(tree(container), "F2");
    const input = container.querySelector("input[aria-label='Rename']");
    expect(input).toBeInstanceOf(HTMLInputElement);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Not A Slug");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    press(input as HTMLElement, "Enter");
    await flush();

    const banner = container.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain("invalid new_slug");
    act(() => root.unmount());
  });
});

describe("OutlineView — recorded All Green Recycling bytes (map_tree without counts)", () => {
  // NOTE ON WHY THIS IS NOT A FULL OutlineView MOUNT: `OutlineView.tsx` always
  // requests `OUTLINE_TREE_INCLUDE = ["description","status","counts","facets"]`
  // — the SAME list on every render, never varied by `outline_detail` — so the
  // live component can never itself produce a "tree loaded without counts"
  // state; mounting it with the WITHOUT_COUNTS fixture only proves a REAL
  // defect one level down (see the finding below), not the "b" case as the
  // brief frames it. The honest "b" proof for the OUTLINE stays where the
  // builder already put it: `useOutlineRows.test.tsx`, run directly against
  // the reducer and `buildOutlineRows`, which this file re-runs on the
  // RECORDED payload instead of the builder's transcribed one.
  it("buildOutlineRows on the RECORDED without-counts payload: no counts key, no digit anywhere", () => {
    let state = topicalMapReducer(
      undefined,
      { type: "topicalMap/mapOpened", payload: { mapId: ALL_GREEN_MAP_ID } } as never,
    );
    state = topicalMapReducer(
      state,
      {
        type: "topicalMap/mapTreeLoaded",
        payload: { mapId: ALL_GREEN_MAP_ID, result: ALL_GREEN_WITHOUT_COUNTS, includes: ["description", "status"] },
      } as never,
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { selectVisibleMapTopics, selectMapLoadedIncludes } = require("../../redux/selectors");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildOutlineRows } = require("./useOutlineRows");
    const root = { topicalMap: state } as never;
    const topics = selectVisibleMapTopics(ALL_GREEN_MAP_ID)(root);
    const includes = selectMapLoadedIncludes(ALL_GREEN_MAP_ID)(root);
    const rows = buildOutlineRows({
      topics,
      countsLoaded: includes.includes("counts"),
      detail: "counts",
      descriptionMaxChars: 80,
      pagesExpanded: new Set(),
      pageRowsFor: () => [],
      renderActions: () => null,
      renderPagesChip: () => null,
    });
    expect(rows.length).toBe(13);
    for (const row of rows) expect("counts" in row).toBe(false);
  });

  it("mounted through OutlineView, a recorded payload WITHOUT counts renders the absent state, never a zero", async () => {
    // Found 2026-09-18 (Verifier A): `mapTreeLoaded` used to take `loadedIncludes`
    // from the CALLER'S REQUEST, so OutlineView's hardcoded `counts` include made
    // `countsLoaded` true for a tree that never sent `pages`/`planned`/`keywords`,
    // and `buildOutlineRows` printed "0 pages" for a field the response never
    // carried. The slice now derives the loaded includes from the rows; this case
    // was red before that change and is the guard.
    mapTree.mockResolvedValue(ALL_GREEN_WITHOUT_COUNTS);
    knobState.knobs = knobs({ outline_detail: "counts" });
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    const row = container.querySelector(
      '[data-topic-tree-row="consumer-electronics-recycling"]',
    );
    expect(row).not.toBeNull();
    expect(row?.textContent).not.toMatch(/\b0 pages\b/);
    expect(row?.querySelector('[data-counts-loaded="false"]')).not.toBeNull();
    act(() => root.unmount());
  });
});

describe("OutlineView — recorded Factory Playground bytes (52 proposed topics)", () => {
  beforeEach(() => {
    mapTree.mockResolvedValue(FACTORY_PLAYGROUND_TREE);
  });

  it("(a) renders the 9 live root topics of the proposed map", async () => {
    const { container, root } = mount(FACTORY_PLAYGROUND_MAP_ID);
    await flush();
    expect(topLevelRowIds(container)).toEqual(
      FACTORY_PLAYGROUND_TREE.topics.map((t) => t.slug),
    );
    act(() => root.unmount());
  });

  it("(c) every row carries the Proposed mark, and the toolbar shows Proposed only", async () => {
    const { container, root } = mount(FACTORY_PLAYGROUND_MAP_ID);
    await flush();
    for (const topic of FACTORY_PLAYGROUND_TREE.topics) {
      const row = container.querySelector(`[data-topic-tree-row="${topic.slug}"]`);
      expect(row?.textContent).toContain("Proposed");
    }
    // `totals.proposed` is rolled up from the loaded tree's own topic
    // statuses (`selectMapTotals`), not from `map_diagnostics` — every one of
    // Factory Playground's 52 recorded topics is `status: "proposed"`, so the
    // toggle renders with that count.
    const toggle = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Proposed only"),
    );
    expect(toggle).not.toBeUndefined();
    expect(toggle?.textContent).toContain("52");
    act(() => root.unmount());
  });
});

describe("OutlineView — recorded All Green Recycling bytes: the Proposed toggle needs live diagnostics", () => {
  it("(c) on All Green (no proposed topics reported) the toggle does not render", async () => {
    mapTree.mockResolvedValue(ALL_GREEN_WITH_COUNTS);
    const { container, root } = mount(ALL_GREEN_MAP_ID);
    await flush();
    const toggle = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Proposed only"),
    );
    expect(toggle).toBeUndefined();
    act(() => root.unmount());
  });
});
