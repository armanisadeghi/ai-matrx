/**
 * A SERVICE WHOSE INPUTS ARRIVE LATE IS RE-ASKED.
 *
 * 🚨 THE ROOT CAUSE OF THE MISSING ORGANIZATION SECTION (one-resolution
 * FIX-R6/F1, production v0.4.1722). `useEntityList` keys every fetch by the
 * QUERY. `/mandates` builds its service from `useUserOrganizations()`, which
 * answers one tick AFTER the first render — so the scope-counts call went out
 * once, knowing about ZERO organizations, and never went out again, because
 * the query had not changed. `counts.narrow.orgs` stayed empty for the whole
 * session and the declared Organization section rendered nothing.
 *
 * The service object cannot be the dependency (hosts build it inline, so it is
 * a new object every render and would refetch forever). `serviceKey` is the
 * declared identity of what the service was built FROM.
 *
 * RED against HEAD before the fix: `useEntityList` had no `serviceKey`, so the
 * second render's service was never asked and `counts.narrow.orgs` stayed
 * empty — the third assertion below reads the same empty options the walker
 * saw on production.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { useEntityList } from "../useEntityList";
import {
  EMPTY_FACETS,
  type EntityListQuery,
  type EntityScopeCounts,
} from "../types";

// The shell's error toast is real machinery this test does not exercise; the
// kit's factory validates the sonner object's shape, so the seam is here.
jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

interface Row {
  id: string;
}

/** A service built from a list of organizations that arrives asynchronously. */
function serviceFor(organizations: readonly string[]) {
  return {
    fetchPage: async () => ({ rows: [] as Row[], total: 0 }),
    fetchCounts: async (_query: EntityListQuery): Promise<EntityScopeCounts> =>
      organizations.length === 0
        ? {
            byKind: { orgs: 0 },
            narrow: {},
            narrowUnavailable: {
              orgs: "Still reading which organizations you belong to.",
            },
          }
        : {
            byKind: { orgs: organizations.length },
            narrow: {
              orgs: organizations.map((id) => ({ id, label: id, count: 1 })),
            },
          },
    fetchFacets: async () => EMPTY_FACETS,
  };
}

let seen: EntityScopeCounts | null = null;

function Probe({ organizations }: { organizations: readonly string[] }) {
  const list = useEntityList<Row>({
    service: serviceFor(organizations),
    // WHAT THE SERVICE WAS BUILT FROM — the whole fix.
    serviceKey: JSON.stringify(organizations),
    getRowId: (row) => row.id,
    entityLabelPlural: "things",
    view: {
      sort: "label",
      direction: "asc",
      pageSize: 25,
      favoritesFirst: false,
    },
  });
  seen = list.counts;
  return null;
}

describe("counts follow the service's own inputs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    seen = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("re-asks when the caller's organizations land after the first render", async () => {
    await act(async () => {
      root.render(<Probe organizations={[]} />);
    });
    // The first render is the honest empty world — and it SAYS so.
    expect(seen?.narrow.orgs ?? []).toHaveLength(0);
    expect(seen?.narrowUnavailable?.orgs).toContain("Still reading");

    // The memberships land. Nothing about the QUERY changed.
    await act(async () => {
      root.render(<Probe organizations={["org-a", "org-b"]} />);
    });

    expect(seen?.narrow.orgs?.map((o) => o.id)).toEqual(["org-a", "org-b"]);
    expect(seen?.narrowUnavailable?.orgs).toBeUndefined();
  });
});
