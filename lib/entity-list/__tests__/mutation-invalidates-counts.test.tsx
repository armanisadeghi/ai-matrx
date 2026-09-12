/**
 * A LIST MAY NOT KEEP COUNTING ROWS IT HAS ALREADY REMOVED.
 *
 * 🚨 Measured on production `/agents/all` (one-resolution FIX-Q13): soft-
 * deleting an agent removed its card and decremented the total, and the System
 * scope tab went on saying 418 for the rest of the session. `removeRow` wrote
 * only local row state, while the scope counts, the facet options and the
 * all-archived probe are keyed by the QUERY — which a mutation does not change
 * — so none of them ever re-asked.
 *
 * The fix is one invalidation path in the shell rather than a per-feature
 * "remember to also refresh": every mutation that goes through this hook bumps
 * a token that keys every derived read. RED against HEAD before the fix — the
 * second assertion in each test read the pre-delete number.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { makeStore } from "@/lib/redux/store";
import { useEntityList } from "../useEntityList";
import {
  EMPTY_FACETS,
  type EntityFacets,
  type EntityScopeCounts,
} from "../types";

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

interface Row {
  id: string;
  is_archived?: boolean;
}

/**
 * A server that holds ONE truth. The page reader and the counts reader both
 * read it, so a stale count can only come from a read that never happened —
 * never from two fixtures disagreeing.
 */
function makeServer(ids: string[]) {
  const live = new Set(ids);
  let countsReads = 0;
  let facetReads = 0;
  return {
    live,
    get countsReads() {
      return countsReads;
    },
    get facetReads() {
      return facetReads;
    },
    /** What a real soft delete does on the server. */
    softDelete: (id: string) => live.delete(id),
    service: {
      fetchPage: async () => ({
        rows: [...live].map((id) => ({ id })) as Row[],
        total: live.size,
      }),
      fetchCounts: async (): Promise<EntityScopeCounts> => {
        countsReads += 1;
        return { byKind: { system: live.size }, narrow: {} };
      },
      fetchFacets: async (): Promise<EntityFacets> => {
        facetReads += 1;
        return EMPTY_FACETS;
      },
    },
  };
}

type List = ReturnType<typeof useEntityList<Row>>;
let list: List | null = null;

function Probe({ service }: { service: ReturnType<typeof makeServer>["service"] }) {
  list = useEntityList<Row>({
    service,
    serviceKey: "fixed",
    getRowId: (row) => row.id,
    entityLabelPlural: "things",
    view: {
      sort: "label",
      direction: "asc",
      pageSize: 25,
      favoritesFirst: false,
    },
  });
  return null;
}

describe("a row mutation invalidates every derived read", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    list = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    store = makeStore();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function mount(server: ReturnType<typeof makeServer>) {
    await act(async () => {
      root.render(
        <Provider store={store}>
          <Probe service={server.service} />
        </Provider>,
      );
    });
  }

  it("re-asks the scope counts after a delete, and the number drops", async () => {
    const server = makeServer(["a", "b", "c"]);
    await mount(server);

    expect(list?.counts.byKind.system).toBe(3);
    const countsReadsBefore = server.countsReads;

    // The delete a surface performs: the server soft-deletes, the shell drops
    // the row optimistically.
    server.softDelete("b");
    await act(async () => {
      list?.removeRow("b");
    });

    expect(server.countsReads).toBeGreaterThan(countsReadsBefore);
    // 🚨 The production symptom, in one line: this read 3 before the fix.
    expect(list?.counts.byKind.system).toBe(2);
  });

  it("re-asks the facet options after a delete", async () => {
    const server = makeServer(["a", "b"]);
    await mount(server);
    const facetReadsBefore = server.facetReads;

    server.softDelete("a");
    await act(async () => {
      list?.removeRow("a");
    });

    expect(server.facetReads).toBeGreaterThan(facetReadsBefore);
  });

  it("re-asks the counts after a patch, because a patch moves a row between buckets", async () => {
    const server = makeServer(["a", "b"]);
    await mount(server);
    const countsReadsBefore = server.countsReads;

    await act(async () => {
      list?.patchRow("a", { is_archived: true });
    });

    expect(server.countsReads).toBeGreaterThan(countsReadsBefore);
  });
});
