/** @jest-environment jsdom */

// features/marketing/seo/topical-map/views/table/__tests__/TopicTable.test.tsx
//
// The table component against a REAL store: the reducer and the selectors are
// the shipped ones, the page intents are the RECORDED round-22 payload, and
// the platform table is replaced by a prop-capturing stand-in so every
// decision the component hands the table (rows, columns, query, callbacks) is
// asserted directly. What this file cannot prove is the package's rendering
// of those props — that is VERIFY-B.md's browser walk.
//
// Watched failing first:
//   · rows fed from `Object.values(topicsBySlug)` in hierarchy mode → the
//     "collapsed children are absent" case fails;
//   · `handleQueryChange` calling `setSiblingSort` for every sort → the
//     "status sort flips to flat" case fails;
//   · `edit` spread unconditionally → the readOnly case fails.

import { TABLE_COLUMN_IDS } from "../tableRows";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type {
  MatrxDataTableProps,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import reducer, {
  mapOpened,
  mapTreeLoaded,
  pageIntentsLoaded,
  setTableColumns,
} from "../../../redux/slice";
import type { TopicalMapKnobs } from "../../../knobs";
import type { MapTreeResult } from "../../../types";
import type { MapTableRow } from "../tableRows";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<MapTableRow> | null = null;
const openTopicPanel = jest.fn();
const patchMutateAsync = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  ...jest.requireActual("@ai-matrx/design-system/data-table"),
  MatrxDataTable: (props: MatrxDataTableProps<MapTableRow>) => {
    tableProps = props;
    return null;
  },
}));
jest.mock("@/components/official/MatrxDataTableHost", () => ({
  MatrxDataTableHost: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/overlays/openers/topicalMapTopicPanel", () => ({
  useOpenTopicPanel: () => openTopicPanel,
}));
jest.mock("@/lib/layout/useClippedContentGuard", () => ({
  useClippedContentGuard: () => undefined,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/components/dialogs/text-input/TextInputDialog", () => ({
  TextInputDialog: () => null,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../../../links", () => ({
  useMapLinks: () => ({
    mapView: (mapId: string, screen: string) => `/maps/${mapId}/${screen}`,
    topic: (mapId: string, slug: string) => `/maps/${mapId}?topic=${slug}`,
  }),
}));

const idle = () => ({
  isPending: false,
  isError: false,
  isFetching: false,
  error: null,
  data: undefined,
});
const mutation = (mutateAsync: jest.Mock = jest.fn()) => ({ mutateAsync, isPending: false });

jest.mock("../../../hooks", () => ({
  useMapTree: () => ({ ...idle(), data: {} }),
  usePageIntents: () => idle(),
  useMapTopicRows: () => idle(),
  usePatchMapTopics: () => mutation(patchMutateAsync),
  useMoveMapTopic: () => mutation(),
  useRetireMapTopics: () => mutation(),
  useRejectMapTopics: () => mutation(),
}));

import { TopicTable } from "../TopicTable";

const MAP_ID = "map-under-test";

const KNOBS = {
  table_default_columns: ["topic", "pages", "planned", "keywords", "status", "leaving", "arriving"],
  intent_colors: {
    in_place: "green",
    leaving: "amber",
    arriving: "blue",
    delete: "red",
    missing: "gray_dashed",
    planned: "purple_dashed",
  },
} as unknown as TopicalMapKnobs;

function tree(): MapTreeResult {
  return {
    map_id: MAP_ID,
    root: null,
    total_topics: 3,
    topics: [
      {
        slug: "live-here",
        name: "Live here",
        status: "active",
        pages: 3,
        planned: 0,
        keywords: 1,
        children: [
          { slug: "child", name: "Child", status: "proposed", pages: 0, planned: 1, keywords: 0 },
        ],
      },
      { slug: "live-there", name: "Live there", status: "active", pages: 5, planned: 2, keywords: 0 },
    ],
  };
}

function makeStore(options: { includes?: string[]; intents?: boolean } = {}) {
  const store = configureStore({ reducer: { topicalMap: reducer } });
  store.dispatch(mapOpened({ mapId: MAP_ID }));
  store.dispatch(
    mapTreeLoaded({ mapId: MAP_ID, result: tree(), includes: options.includes ?? ["counts"] }),
  );
  if (options.intents) {
    store.dispatch(
      pageIntentsLoaded({ mapId: MAP_ID, result: RECORDED_PAGE_INTENTS_ROUND22, replace: true }),
    );
  }
  return store;
}

type Store = ReturnType<typeof makeStore>;

describe("TopicTable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    openTopicPanel.mockReset();
    patchMutateAsync.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(store: Store, readOnly = false) {
    act(() => {
      root.render(
        <Provider store={store}>
          <TopicTable mapId={MAP_ID} siteId={null} host="page" readOnly={readOnly} knobs={KNOBS} />
        </Provider>,
      );
    });
    if (!tableProps) throw new Error("The table never received props");
    return tableProps;
  }

  function change(next: Partial<MatrxDataTableQueryState>) {
    const props = tableProps;
    if (!props || !props.query || !("onStateChange" in props.query)) {
      throw new Error("No controlled query on the table");
    }
    const state = props.query.state;
    act(() => {
      props.query &&
        "onStateChange" in props.query &&
        props.query.onStateChange({ ...state, ...next });
    });
  }

  it("hierarchy mode feeds the selector's rows — a collapsed child is absent, its parent expandable", () => {
    const props = render(makeStore());
    expect(props.data.map((row) => row.slug)).toEqual(["live-here", "live-there"]);
    expect(props.data[0].hasChildren).toBe(true);
    expect(props.query).toMatchObject({ mode: "controlled-local", state: { sort: null } });
    // The hierarchy contract is on, with every loaded topic for depth math.
    expect(props.hierarchy?.rows?.map((row) => row.slug).sort()).toEqual(["child", "live-here", "live-there"]);
    expect(props.hierarchy?.getParentId(props.data[0])).toBeNull();
  });

  it("defaults the column set to the knob and persists the chooser through setTableColumns", () => {
    const store = makeStore();
    const props = render(store);
    // Every column definition reaches the table (the chooser can only offer a
    // column it was given — the browser walk of 2026-09-18 found the hidden ones
    // unreachable when only the visible set was passed); the knob decides which
    // are VISIBLE through columnState.order/hidden, never which exist.
    expect(props.columns.map((column) => column.id).sort()).toEqual([...TABLE_COLUMN_IDS].sort());
    expect(props.columnState?.order.slice(0, KNOBS.table_default_columns.length)).toEqual(KNOBS.table_default_columns);
    expect(props.columnState?.hidden.sort()).toEqual(["description", "facets", "updated"]);
    act(() => {
      props.columnState?.onChange({
        order: ["topic", "description", "pages", "planned", "keywords", "status", "leaving", "arriving", "facets", "updated"],
        hidden: ["pages", "facets", "updated"],
      });
    });
    expect(store.getState().topicalMap.maps[MAP_ID].table.columns).toEqual([
      "topic", "description", "planned", "keywords", "status", "leaving", "arriving",
    ]);
    expect(tableProps?.columnState?.order.slice(0, 7)).toEqual([
      "topic", "description", "planned", "keywords", "status", "leaving", "arriving",
    ]);
    expect(tableProps?.columnState?.hidden.sort()).toEqual(["facets", "pages", "updated"]);
  });

  it("absent counts render NOTHING with a title; loaded counts render the number", () => {
    const unloaded = render(makeStore({ includes: [] }));
    const pages = unloaded.columns.find((column) => column.id === "pages");
    const cell = pages?.cell?.(unloaded.data[0], 0);
    const cellHost = document.createElement("div");
    const cellRoot = createRoot(cellHost);
    act(() => cellRoot.render(<>{cell}</>));
    expect(cellHost.textContent).toBe("");
    expect(cellHost.querySelector("[data-count-absent]")?.getAttribute("title")).toBe(
      "Counts are not loaded for this view",
    );
    act(() => cellRoot.unmount());
    expect(pages?.accessorFn?.(unloaded.data[0])).toBeUndefined();

    act(() => root.unmount());
    root = createRoot(host);
    const loaded = render(makeStore());
    const loadedPages = loaded.columns.find((column) => column.id === "pages");
    expect(loadedPages?.accessorFn?.(loaded.data[0])).toBe(3);
  });

  it("leaving / arriving are empty until intents are listed, then real rollups of the recorded payload", () => {
    const before = render(makeStore());
    const leaving = before.columns.find((column) => column.id === "leaving");
    expect(leaving?.accessorFn?.(before.data[0])).toBeUndefined();

    act(() => root.unmount());
    root = createRoot(host);
    const after = render(makeStore({ intents: true }));
    const byId = (id: string) => after.columns.find((column) => column.id === id);
    const liveHere = after.data.find((row) => row.slug === "live-here");
    const liveThere = after.data.find((row) => row.slug === "live-there");
    if (!liveHere || !liveThere) throw new Error("rows missing");
    expect(byId("leaving")?.accessorFn?.(liveHere)).toBe(1);
    expect(byId("arriving")?.accessorFn?.(liveHere)).toBe(0);
    expect(byId("leaving")?.accessorFn?.(liveThere)).toBe(0);
    expect(byId("arriving")?.accessorFn?.(liveThere)).toBe(2);
  });

  it("R10: sorting pages descending in hierarchy mode becomes the sibling sort and stays a tree", () => {
    const store = makeStore();
    render(store);
    change({ sort: { id: "pages", direction: "desc" } });
    const ws = store.getState().topicalMap.maps[MAP_ID];
    expect(ws.siblingSort).toBe("pages");
    expect(ws.table.hierarchy).toBe(true);
    expect(tableProps?.data.map((row) => row.slug)).toEqual(["live-there", "live-here"]);
    expect(tableProps?.query).toMatchObject({ state: { sort: { id: "pages", direction: "desc" } } });
  });

  it("R10: sorting a data column flips to an honest flat list of EVERY topic, with the toggle on Flat", () => {
    const store = makeStore();
    render(store);
    change({ sort: { id: "status", direction: "asc" } });
    expect(store.getState().topicalMap.maps[MAP_ID].table.hierarchy).toBe(false);
    expect(tableProps?.data.map((row) => row.slug).sort()).toEqual(["child", "live-here", "live-there"]);
    expect(tableProps?.hierarchy).toBeUndefined();
    const facet = tableProps?.toolbar?.facets?.[0];
    expect(facet).toMatchObject({ type: "button-group", id: "rows", value: "flat" });
    expect(tableProps?.toolbar?.leading).toBeTruthy();
    // The flat engine honours the sort: proposed sorts before active? No —
    // ascending by the status word: "active" < "proposed".
    const processed = tableProps?.processLocalRows?.(tableProps.data, tableProps.query && "state" in tableProps.query ? tableProps.query.state : { page: 1, pageSize: 100, search: "", anyOf: "", columnFilters: {}, sort: null });
    expect(processed?.map((row) => row.topic.status)).toEqual(["active", "active", "proposed"]);
  });

  it("R10: a column filter flips to flat too, and the toggle brings the tree back", () => {
    const store = makeStore();
    render(store);
    change({ columnFilters: { status: { kind: "select", value: "proposed", values: ["proposed"] } } });
    expect(store.getState().topicalMap.maps[MAP_ID].table.hierarchy).toBe(false);
    const facet = tableProps?.toolbar?.facets?.[0];
    if (!facet || facet.type !== "button-group") throw new Error("no toggle");
    act(() => facet.onChange("hierarchy"));
    expect(store.getState().topicalMap.maps[MAP_ID].table.hierarchy).toBe(true);
    expect(tableProps?.query).toMatchObject({ state: { columnFilters: {}, sort: null } });
    expect(tableProps?.data.map((row) => row.slug)).toEqual(["live-here", "live-there"]);
  });

  it("the search box writes the workspace's ancestor-keeping text filter in hierarchy mode", () => {
    const store = makeStore();
    render(store);
    change({ search: "child" });
    expect(store.getState().topicalMap.maps[MAP_ID].filters.text).toBe("child");
    expect(store.getState().topicalMap.maps[MAP_ID].table.hierarchy).toBe(true);
    // The parent is kept for its matching child and auto-revealed.
    expect(tableProps?.data.map((row) => row.slug)).toEqual(["live-here", "child"]);
  });

  it("selection is the workspace's checked topics; a row open selects and opens the panel", () => {
    const store = makeStore();
    const props = render(store);
    act(() => props.selection?.onSelectedIdsChange(["live-there", "child"]));
    expect(store.getState().topicalMap.maps[MAP_ID].checkedSlugs).toEqual(["live-there", "child"]);
    expect(tableProps?.selection?.selectedIds).toEqual(["live-there", "child"]);
    act(() => props.onRowOpen?.(props.data[1]));
    expect(store.getState().topicalMap.maps[MAP_ID].selectedSlug).toBe("live-there");
    expect(openTopicPanel).toHaveBeenCalledWith({ mapId: MAP_ID, slug: "live-there", siteId: null });
  });

  it("inline edits go to patch_map_topics as per-slug patches", async () => {
    patchMutateAsync.mockResolvedValue({ updated: ["live-here"], unchanged: [], errors: [] });
    const props = render(makeStore());
    await act(async () => {
      await props.edit?.onSave({ "live-here": { topic: "Live HERE", description: "" } }, props.data);
    });
    expect(patchMutateAsync).toHaveBeenCalledWith([
      { slug: "live-here", name: "Live HERE", description: null },
    ]);
  });

  it("readOnly removes every write control and keeps the doors", () => {
    const props = render(makeStore(), true);
    expect(props.edit).toBeUndefined();
    expect(props.hierarchy).toBeUndefined();
    expect(props.columns.find((column) => column.id === "topic")?.editable).toBe(false);
    expect(props.selection).toBeDefined();
    expect(props.onRowOpen).toBeDefined();
  });

  it("a persisted column choice offers the reset to the knob's default", () => {
    const store = makeStore();
    store.dispatch(setTableColumns({ mapId: MAP_ID, columns: ["topic", "facets"] }));
    const props = render(store);
    expect(props.columnState?.order.slice(0, 2)).toEqual(["topic", "facets"]);
    expect(props.columnState?.hidden).not.toContain("topic");
    expect(props.columnState?.hidden).not.toContain("facets");
    expect(props.columnState?.hidden.length).toBe(TABLE_COLUMN_IDS.length - 2);
    expect(props.toolbar?.actions).toBeTruthy();
  });

  describe("an inline edit that clears a topic's name", () => {
    // The table toasts "Changes saved" on any resolve. Before this, saveEdits
    // dropped the blank name, built no patches and returned — green toast, old
    // name still on screen. It must REJECT, and nothing may reach the server.
    it("rejects with the sentence and sends no patch", async () => {
      const props = render(makeStore());
      const onSave = props.edit?.onSave;
      if (!onSave) throw new Error("The table was given no edit handler");
      await expect(
        Promise.resolve(onSave({ "live-here": { topic: "   " } }, [])),
      ).rejects.toThrow("A topic needs a name.");
      expect(patchMutateAsync).not.toHaveBeenCalled();
    });

    it("still saves a real name", async () => {
      patchMutateAsync.mockResolvedValue({ updated: ["live-here"], errors: [] });
      const props = render(makeStore());
      const onSave = props.edit?.onSave;
      if (!onSave) throw new Error("The table was given no edit handler");
      await onSave({ "live-here": { topic: "Live HERE" } }, []);
      expect(patchMutateAsync).toHaveBeenCalledWith([
        { slug: "live-here", name: "Live HERE" },
      ]);
    });
  });
});
