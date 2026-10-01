/**
 * The saved scope tree survives a fetch that is still loading when the saved copy is read.
 *
 * 2026-09-30: the REHYDRATE handler ignored the saved tree while `treeStatus === "loading"`. The
 * device write is held until that read (`holdUntilHydrated`), then saves the slice — which was
 * still empty, so `serialize` wrote `{}` over the saved tree (seen in the browser as
 * `idb.write scopesTree bytes: 2`). If the fetch then failed, the tree was gone on the next load.
 */
import reducer, { scopesActions, scopesTreePolicy, type ScopesState } from "@/features/scopes/redux/scopesSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";

type Org = ScopesState["organizations"][string];

const saved = {
  organizations: { "org-1": { id: "org-1", name: "Saved org" } as unknown as Org },
  organizationIds: ["org-1"],
  treeFetchedAt: 1_000,
};

function rehydrate(state: unknown) {
  return buildRehydrateAction("scopesTree", state, {} as never);
}

function serialized(state: ScopesState) {
  return scopesTreePolicy.config.serialize!(state) as { organizationIds?: string[] };
}

it("a read that lands while the fetch is loading keeps the saved tree for the next save", () => {
  let state = reducer(undefined, scopesActions.treeFetchPending());
  state = reducer(state, rehydrate(saved));
  expect(serialized(state).organizationIds).toEqual(["org-1"]);
});

it("the saved tree outlives a fetch that then fails", () => {
  let state = reducer(undefined, scopesActions.treeFetchPending());
  state = reducer(state, rehydrate(saved));
  state = reducer(state, scopesActions.treeFetchRejected("network down"));
  expect(serialized(state).organizationIds).toEqual(["org-1"]);
});

it("a successful fetch replaces the saved tree", () => {
  let state = reducer(undefined, scopesActions.treeFetchPending());
  state = reducer(state, rehydrate(saved));
  state = reducer(
    state,
    scopesActions.treeFetchFulfilled({
      organizations: [{ id: "org-2", name: "Fresh org" } as unknown as Org],
      fetched_at: new Date(2_000).toISOString(),
    } as never),
  );
  expect(state.treeStatus).toBe("ready");
  expect(serialized(state).organizationIds).toEqual(["org-2"]);
});

it("a fetch that already landed is never overwritten by the older saved tree", () => {
  let state = reducer(undefined, scopesActions.treeFetchPending());
  state = reducer(
    state,
    scopesActions.treeFetchFulfilled({
      organizations: [{ id: "org-2", name: "Fresh org" } as unknown as Org],
      fetched_at: new Date(2_000).toISOString(),
    } as never),
  );
  state = reducer(state, rehydrate(saved));
  expect(state.organizationIds).toEqual(["org-2"]);
});
