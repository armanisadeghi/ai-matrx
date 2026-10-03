/**
 * TYPED TEXT KEEPS THE ROWS UNTIL ITS ANSWER LANDS (2026-10-03).
 *
 * Arman, on /agents/all?q=an: "the agent search box is non-functional and loading on each
 * character". The typing exception to THE ROWS ANSWER THIS QUESTION lasted one second
 * (`typingRecently()`), while a server list answers in 0.5–3 s — so at a normal typing pace
 * every character dropped the table to its skeleton until the read came back.
 *
 * The replay: the list shows its rows, the person types a search, and the server takes far
 * longer than a second to answer. The previous rows must stay on screen (spinner, not skeleton)
 * the whole time, and the answer must replace them the moment it lands. A search that arrives
 * by navigation still holds the skeleton — see rows-answer-the-question.test.tsx.
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
import type { EntityListController } from "../config";

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

interface Row {
  id: string;
}

const ALL_AGENTS = ["research-assistant", "seo-analyst", "meeting-notes", "data-analyst"].map(
  (id) => ({ id }),
);
const pending = new Map<string, () => void>();

const service = {
  fetchPage: (query: EntityListQuery) => {
    if (!query.search) return Promise.resolve({ rows: ALL_AGENTS, total: 4 });
    return new Promise<{ rows: Row[]; total: number }>((resolve) => {
      pending.set(query.search, () => {
        const rows = ALL_AGENTS.filter((row) => row.id.includes(query.search));
        resolve({ rows, total: rows.length });
      });
    });
  },
  fetchCounts: async () => ({ byKind: {}, narrow: {} }),
  fetchFacets: async () => EMPTY_FACETS,
};

let list: EntityListController<Row> | null = null;
let store: ReturnType<typeof makeStore>;

function Probe() {
  list = useEntityList<Row>({
    service,
    getRowId: (row) => row.id,
    entityLabelPlural: "agents",
    urlState: true,
    view: { sort: "updated", direction: "desc", pageSize: 25, favoritesFirst: false },
  });
  return null;
}

describe("typing into a list whose server answers slowly", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    pending.clear();
    window.history.replaceState(null, "", "/agents/all");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("keeps the previous rows under the box until the typed search's answer lands", async () => {
    store = makeStore();
    await act(async () => {
      root.render(
        <Provider store={store}>
          <Probe />
        </Provider>,
      );
    });
    expect(list?.rows).toHaveLength(4);

    // Two characters, a natural pace apart; each waits out the debounce and asks the server.
    for (const text of ["a", "an"]) {
      await act(async () => {
        list?.setSearch(text);
      });
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
    }
    expect(pending.has("an")).toBe(true);

    // The server is slow: three seconds pass with no answer. Something re-renders meanwhile
    // (the counts landing, the shell, a parent) — the page is rendered again, same question.
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await act(async () => {
      root.render(
        <Provider store={store}>
          <Probe />
        </Provider>,
      );
    });

    // THE REGRESSION: after one second this was [] with isLoading — the skeleton per character.
    expect(list?.rows).toHaveLength(4);
    expect(list?.isLoading).toBe(false);
    expect(list?.isFetching).toBe(true);
    expect(list?.query.search).toBe("an");

    // The answer lands and replaces them at once.
    await act(async () => {
      pending.get("an")?.();
    });
    expect(list?.rows.map((row) => row.id)).toEqual(["research-assistant", "seo-analyst", "data-analyst"]);
    expect(list?.isFetching).toBe(false);
  });
});
