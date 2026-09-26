/**
 * THE ROWS ANSWER THIS QUESTION (UX punch list 2026-09-26).
 *
 * Going Back to a searched list (`?q=enrich`) painted the whole unfiltered list
 * under the "enrich" search box: the first render after a navigation read the
 * URL before it had settled, fetched the unfiltered page, and those rows stayed
 * on screen until the filtered read came back (20+ s on a busy server).
 *
 * The replay: the list mounts on a URL with no search, the unfiltered page
 * answers at once, then the URL settles to `?q=enrich` while the filtered read
 * is still in flight. The list must hold its skeleton — never the unfiltered
 * rows — and show the filtered rows the moment they land.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { makeStore } from "@/lib/redux/store";
import { useEntityList } from "../useEntityList";
import { EMPTY_FACETS, type EntityListQuery } from "../types";

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

interface Row {
  id: string;
}

let releaseFiltered: (() => void) | null = null;

const service = {
  fetchPage: (query: EntityListQuery) => {
    if (!query.search) {
      return Promise.resolve({
        rows: ["a", "b", "c", "d", "e"].map((id) => ({ id })),
        total: 545,
      });
    }
    return new Promise<{ rows: Row[]; total: number }>((resolve) => {
      releaseFiltered = () => resolve({ rows: [{ id: "enrich-card" }], total: 1 });
    });
  },
  fetchCounts: async () => ({ byKind: {}, narrow: {} }),
  fetchFacets: async () => EMPTY_FACETS,
};

let seen: { rows: Row[]; total: number; isLoading: boolean } | null = null;

function Probe() {
  const list = useEntityList<Row>({
    service,
    getRowId: (row) => row.id,
    entityLabelPlural: "mandates",
    urlState: true,
    view: { sort: "label", direction: "asc", pageSize: 50, favoritesFirst: false },
  });
  seen = { rows: list.rows, total: list.total, isLoading: list.isLoading };
  return null;
}

describe("returning to a searched list", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState(null, "", "/list");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("never shows the unfiltered rows under the search, and shows the filtered rows when they land", async () => {
    await act(async () => {
      root.render(
        <Provider store={makeStore()}>
          <Probe />
        </Provider>,
      );
    });
    // The unfiltered page answered the unsettled first render.
    expect(seen?.rows).toHaveLength(5);

    // The URL settles to the search the person came back to.
    await act(async () => {
      window.history.replaceState(null, "", "/list?q=enrich");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // THE REGRESSION: this used to be the 5 unfiltered rows and "545".
    expect(seen?.rows).toEqual([]);
    expect(seen?.total).toBe(0);
    expect(seen?.isLoading).toBe(true);

    await act(async () => {
      releaseFiltered?.();
    });
    expect(seen?.rows).toEqual([{ id: "enrich-card" }]);
    expect(seen?.total).toBe(1);
    expect(seen?.isLoading).toBe(false);
  });
});
