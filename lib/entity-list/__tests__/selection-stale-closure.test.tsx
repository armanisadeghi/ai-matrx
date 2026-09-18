/**
 * THE STALE-CLOSURE DEFECT THIS CLOSES (VERIFICATION.md round 4, D14, filed
 * against `origin/main`): a person selecting rows by clicking their checkboxes
 * fast — faster than React can land a render between clicks — watched every
 * click but the last get silently thrown away. Fifty ticked rows read back as
 * one.
 *
 * ROOT CAUSE. `useEntityListSelection`'s `toggleId` (and the sibling setters
 * that derive a next selection from the previous one — `selectLoaded`,
 * `toggleLoaded`, `setIds`) computed the next id array from the `ids` STATE
 * VARIABLE captured at render time: `selectedSet.has(id) ? ids.filter(...) :
 * [...ids, id]`. React 18 batches every synchronous `setState` call inside one
 * tick into a single re-render, so N calls made before that re-render lands
 * all read the SAME stale `ids` snapshot — each one computes "previous ∪ {its
 * own id}" against the array from before ANY of the N clicks, and only the
 * last call's write survives.
 *
 * PLANT THE BUG TO SEE THIS GO RED: in useEntityListSelection.ts, change
 * `toggleId` back to reading the render-time `ids`/`selectedSet` instead of
 * `setIdsState`'s functional-update `prev` — e.g.
 *   const toggleId = (id: string) => {
 *     setIdsState(selectedSet.has(id) ? ids.filter((v) => v !== id) : [...ids, id]);
 *     setMatched(null);
 *   };
 * — and "50 synchronous toggles in one tick yield 50 selected" fails with 1.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useEntityListSelection } from "../useEntityListSelection";
import type { EntityListService } from "../config";
import type { EntityListQuery, EntityListSort } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  id: string;
}

const ROWS: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: `row-${i}` }));

const QUERY: EntityListQuery = {
  scope: { kind: "mine" },
  search: "",
  deep: false,
  archived: "active",
  filters: {},
  page: 1,
};

const SORT: EntityListSort = {
  sort: "created_at",
  direction: "desc",
  favoritesFirst: false,
  pageSize: 50,
};

// A stub service — this test never resolves "select all matching", so its
// methods are never called. It exists only to satisfy the hook's signature.
const SERVICE: EntityListService<Row> = {
  fetchPage: () =>
    Promise.resolve({ rows: [], total: 0 }),
  fetchCounts: () =>
    Promise.resolve({} as never),
  fetchFacets: () =>
    Promise.resolve({} as never),
};

let container: HTMLDivElement;
let root: Root;
let latestToggleId: ((id: string) => void) | null = null;
let latestSelectedCount = 0;

function Harness() {
  const selection = useEntityListSelection<Row>({
    enabled: true,
    rows: ROWS,
    total: ROWS.length,
    query: QUERY,
    sort: SORT,
    service: SERVICE,
    getRowId: (row) => row.id,
    selectAllMatching: false,
  });
  latestToggleId = selection.toggleId;
  latestSelectedCount = selection.count;
  return null;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  latestToggleId = null;
  latestSelectedCount = 0;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

test("50 synchronous toggles in one tick yield 50 selected", () => {
  act(() => {
    root.render(<Harness />);
  });
  expect(latestToggleId).not.toBeNull();

  // The real-world trigger: fifty checkbox clicks fired back to back, all
  // landing before React gets a chance to re-render between them. Wrapping
  // them in ONE `act()` is exactly that — React batches every setState call
  // inside it into a single commit, which is what exposed the stale closure.
  act(() => {
    for (const row of ROWS) {
      latestToggleId!(row.id);
    }
  });

  expect(latestSelectedCount).toBe(50);
});

test("a toggled-off row does not resurrect its neighbors", () => {
  act(() => {
    root.render(<Harness />);
  });

  act(() => {
    for (const row of ROWS) {
      latestToggleId!(row.id);
    }
  });
  expect(latestSelectedCount).toBe(50);

  // Untoggling ten of them in the same rapid-fire pattern must land exactly
  // forty — not bounce back to some stale intermediate count.
  act(() => {
    for (const row of ROWS.slice(0, 10)) {
      latestToggleId!(row.id);
    }
  });

  expect(latestSelectedCount).toBe(40);
});
