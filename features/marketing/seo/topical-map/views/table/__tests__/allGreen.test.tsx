/** @jest-environment jsdom */

// features/marketing/seo/topical-map/views/table/__tests__/allGreen.test.tsx
//
// The table over the RECORDED All Green Recycling map (`__fixtures__/`): the
// real `seo.map_tree` answer for map e9df6779-… on site d0aff5b6-…, and the
// real `seo.list_page_intents` answers for its one `move` and 19 `redirect`
// intents. The reducer, the selectors and the rollup are the shipped ones; the
// platform table is a prop-capturing stand-in. So every number below is the
// live database's, and the one that matters most was not guessable: all 19
// redirects stay in_place (a page sent to another page of the SAME topic does
// not leave the topic), and only the human-placed sewing-machine page moves a
// count.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table/types";

import type { TopicalMapKnobs } from "../../../knobs";
import reducer, {
  mapOpened,
  mapTreeLoaded,
  pageIntentsLoaded,
  toggleExpanded,
} from "../../../redux/slice";
import { RECORDED_ALL_GREEN_MAP_TREE } from "../__fixtures__/allGreenMapTree";
import {
  RECORDED_ALL_GREEN_MOVE_INTENTS,
  RECORDED_ALL_GREEN_REDIRECT_INTENTS,
} from "../__fixtures__/allGreenPageIntents";
import { rollupTopicIntents } from "../intentRollup";
import type { MapTableRow } from "../tableRows";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<MapTableRow> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
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
  useOpenTopicPanel: () => jest.fn(),
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
    mapView: () => "/pages",
    topic: () => "/topic",
  }),
}));

const idle = () => ({ isPending: false, isError: false, isFetching: false, error: null, data: undefined });
const mutation = () => ({ mutateAsync: jest.fn(), isPending: false });

jest.mock("../../../hooks", () => ({
  useMapTree: () => ({ ...idle(), data: {} }),
  usePageIntents: () => idle(),
  useMapTopicRows: () => idle(),
  usePatchMapTopics: mutation,
  useMoveMapTopic: mutation,
  useRetireMapTopics: mutation,
  useRejectMapTopics: mutation,
}));

import { TopicTable } from "../TopicTable";

const MAP_ID = RECORDED_ALL_GREEN_MAP_TREE.map_id;
const SITE_ID = "d0aff5b6-0710-4848-8304-164db3c80ab7";

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

function makeStore() {
  const store = configureStore({ reducer: { topicalMap: reducer } });
  store.dispatch(mapOpened({ mapId: MAP_ID }));
  store.dispatch(
    mapTreeLoaded({
      mapId: MAP_ID,
      result: RECORDED_ALL_GREEN_MAP_TREE,
      includes: ["description", "status", "counts", "facets"],
    }),
  );
  // The move page first, then the redirects merged in (replace: false), the
  // way two narrowed reads land in one workspace.
  store.dispatch(pageIntentsLoaded({ mapId: MAP_ID, result: RECORDED_ALL_GREEN_MOVE_INTENTS, replace: true }));
  store.dispatch(pageIntentsLoaded({ mapId: MAP_ID, result: RECORDED_ALL_GREEN_REDIRECT_INTENTS, replace: false }));
  return store;
}

describe("TopicTable over the recorded All Green map", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(store: ReturnType<typeof makeStore>) {
    act(() => {
      root.render(
        <Provider store={store}>
          <TopicTable mapId={MAP_ID} siteId={SITE_ID} host="page" readOnly={false} knobs={KNOBS} />
        </Provider>,
      );
    });
    if (!tableProps) throw new Error("The table never received props");
    return tableProps;
  }

  it("shows the 13 root topics collapsed, and 50 topics in the hierarchy set", () => {
    const props = render(makeStore());
    expect(props.data).toHaveLength(13);
    expect(props.data[0]).toMatchObject({ slug: "consumer-electronics-recycling", depth: 0, hasChildren: true, expanded: false });
    expect(props.hierarchy?.rows).toHaveLength(50);
  });

  it("expanding Data Destruction reveals its nine children in the map's own order, indented", () => {
    const store = makeStore();
    render(store);
    act(() => {
      store.dispatch(toggleExpanded({ mapId: MAP_ID, slug: "data-destruction-services" }));
    });
    const slugs = tableProps?.data.map((row) => row.slug) ?? [];
    const start = slugs.indexOf("data-destruction-services");
    expect(slugs.slice(start, start + 10)).toEqual([
      "data-destruction-services",
      "data-degaussing-services",
      "data-destruction-equipment",
      "data-sanitization-and-erasure",
      "hard-drive-crushing",
      "hard-drive-recycling-and-disposal",
      "hard-drive-shredding",
      "magnetic-tape-destruction",
      "product-and-recall-destruction",
      "shredding-franchises",
    ]);
    expect(tableProps?.data[start + 1].depth).toBe(1);
    // The grandchild stays hidden until its own parent is expanded.
    expect(slugs).not.toContain("data-wiping-software-and-freeware");
  });

  it("the counts are the site's real numbers, and a real zero is a zero", () => {
    const props = render(makeStore());
    const pages = props.columns.find((column) => column.id === "pages");
    const keywords = props.columns.find((column) => column.id === "keywords");
    const ce = props.data.find((row) => row.slug === "consumer-electronics-recycling");
    const marketing = props.data.find((row) => row.slug === "marketing-services");
    if (!ce || !marketing) throw new Error("rows missing");
    expect(pages?.accessorFn?.(ce)).toBe(2140);
    expect(keywords?.accessorFn?.(ce)).toBe(35);
    expect(keywords?.accessorFn?.(marketing)).toBe(0);
  });

  it("leaving / arriving over the recorded intents: 19 redirects stay in place, the one move counts on both ends", () => {
    const store = makeStore();
    const props = render(store);
    const ws = store.getState().topicalMap.maps[MAP_ID];
    expect(Object.keys(ws.intentsByPageId)).toHaveLength(20);

    const rollups = rollupTopicIntents(ws.intentsByPageId, ws.coverageByPageId);
    // A redirect into another page of the same topic is NOT leaving the topic.
    expect(rollups.get("crt-and-tv-recycling")).toBeUndefined();
    expect(rollups.get("data-destruction-services")).toEqual({ leaving: 1, arriving: 0 });
    expect(rollups.get("sewing-machine-recycling")).toEqual({ leaving: 0, arriving: 1 });

    const leaving = props.columns.find((column) => column.id === "leaving");
    const arriving = props.columns.find((column) => column.id === "arriving");
    const dds = props.data.find((row) => row.slug === "data-destruction-services");
    if (!dds) throw new Error("row missing");
    expect(leaving?.accessorFn?.(dds)).toBe(1);
    expect(arriving?.accessorFn?.(dds)).toBe(0);
    // A topic the intents never touch is a loaded ZERO, not unknown.
    const legal = props.data.find((row) => row.slug === "legal");
    if (!legal) throw new Error("row missing");
    expect(leaving?.accessorFn?.(legal)).toBe(0);
  });

  it("the status filter offers every status the map carries, with counts", () => {
    const props = render(makeStore());
    const status = props.columns.find((column) => column.id === "status");
    expect(status?.filterOptions).toEqual([{ value: "active", label: "active (50)" }]);
  });
});
