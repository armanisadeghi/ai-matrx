/** @jest-environment jsdom */

// features/marketing/seo/topical-map/views/pages/__tests__/url-filters.test.tsx
//
// THE URL FILTER CONTRACT, BOUND TO THE SCREEN. `pageFilterParams.test.ts`
// proves the parsing; this proves the workspace actually applies it — against
// the REAL reducer and the REAL selectors, with only the child screens and the
// reads stubbed.
//
// The host gate is the case that matters most: a window, drawer or canvas has
// no URL of its own, so reading the address bar there would hand it the filters
// of whatever page happens to be underneath it. Watched failing first by
// dropping the `host !== "page"` guard — the window case then inherits
// `?topic=live-there` from the page behind it.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import reducer, { mapOpened } from "../../../redux/slice";
import { selectMapPageFilters } from "../../../redux/selectors";
import type { TopicalMapKnobs } from "../../../knobs";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let search = "";
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const KNOBS = {
  pages_low_traffic_clicks_max: 5,
  intent_colors: {
    in_place: "green",
    leaving: "amber",
    arriving: "blue",
    delete: "red",
    missing: "gray_dashed",
    planned: "purple_dashed",
  },
} as unknown as TopicalMapKnobs;

jest.mock("../../../knobs", () => ({
  useTopicalMapKnobs: () => ({ knobs: KNOBS, loading: false, error: null }),
}));
jest.mock("../../../hooks", () => ({
  useMapDiagnostics: () => ({ data: { sites_using_map: [] } }),
}));
jest.mock("../usePagesQuery", () => ({
  usePagesQuery: () => ({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock("../PagesFilterBar", () => ({ PagesFilterBar: () => null }));
jest.mock("../PagesTable", () => ({ PagesTable: () => null }));
jest.mock("../PagesOnNoTopicTable", () => ({ PagesOnNoTopicTable: () => null }));
jest.mock("../ProgressStrip", () => ({ ProgressStrip: () => null }));
jest.mock("../review/IntentReviewDeck", () => ({ IntentReviewDeck: () => null }));
jest.mock("../runs/MapRunControls", () => ({ MapRunControls: () => null }));

import { PagesWorkspace } from "../../PagesWorkspace";

const MAP_ID = "map-under-test";

function makeStore() {
  const store = configureStore({
    reducer: {
      topicalMap: reducer,
      appContext: () => ({ organization_id: null }),
    },
  });
  store.dispatch(mapOpened({ mapId: MAP_ID }));
  return store;
}

describe("the pages workspace opens on what the link asked for", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    search = "";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(store: ReturnType<typeof makeStore>, mapHost: "page" | "window") {
    act(() => {
      root.render(
        <Provider store={store}>
          <PagesWorkspace mapId={MAP_ID} siteId={null} host={mapHost} readOnly={false} />
        </Provider>,
      );
    });
  }

  const filtersOf = (store: ReturnType<typeof makeStore>) =>
    selectMapPageFilters(MAP_ID)(store.getState() as never);

  it("applies ?topic=, ?disposition=, ?state= and ?onNoTopic= on the page host", () => {
    search = "topic=live-there&disposition=redirect&state=proposed&onNoTopic=1";
    const store = makeStore();
    render(store, "page");
    expect(filtersOf(store)).toMatchObject({
      topicSlug: "live-there",
      disposition: "redirect",
      state: "proposed",
      onNoTopic: true,
    });
  });

  it("leaves a window host alone — that URL belongs to the page underneath it", () => {
    search = "topic=live-there&state=proposed";
    const store = makeStore();
    render(store, "window");
    expect(filtersOf(store)).toMatchObject({
      topicSlug: null,
      state: null,
    });
  });

  it("changes nothing when the link carries no filters", () => {
    search = "site=46690e56-6b25-45b9-ac91-611c92b3cf61";
    const store = makeStore();
    render(store, "page");
    expect(filtersOf(store)).toMatchObject({ topicSlug: null, disposition: null, state: null });
  });

  it("says out loud what it could not honour, and still applies the rest", () => {
    search = "state=accpeted&disposition=move";
    const store = makeStore();
    render(store, "page");
    expect(filtersOf(store)).toMatchObject({ disposition: "move", state: null });
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("state=accpeted");
    expect(alert?.textContent).toContain("was not applied");
  });
});
