/**
 * THE PAGED TREE (lane SCOPES-TREE-PAGED): the first paint reads the skeleton, a type's scopes come
 * page by page, and the whole tree still means what it always meant.
 *
 * What must hold, each case a behaviour some reader of the tree depends on:
 *   - the skeleton draws organizations and types but never says the tree is "ready" (ScopeNotFound,
 *     ReadGate and every picker wait on `treeStatus` for EVERY scope);
 *   - a type's count is unknown (null) until the store counted it — never a false 0;
 *   - a page lands in its type, the next page appends, the last page makes the type complete;
 *   - the whole tree replaces the skeleton and answers every type complete with its exact count;
 *   - a skeleton arriving after the whole tree changes nothing;
 *   - a cache written from the skeleton is never adopted as the tree on the next boot.
 */
import reducer, { scopesActions, scopesTreePolicy, type ScopesState } from "@/features/scopes/redux/scopesSlice";
import { makeSelectTypeScopesState } from "@/features/scopes/redux/selectors/tree";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";
import type { OrgNode, ScopeNode, ScopeTypeNode } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

const ORG = "6f0c2a3e-0000-4000-8000-000000000001";
const MATTERS = "6f0c2a3e-0000-4000-8000-0000000000a1";
const CLIENTS = "6f0c2a3e-0000-4000-8000-0000000000a2";

function type(id: string, label: string, scopes: ScopeNode[] = []): ScopeTypeNode {
  return {
    id, organization_id: ORG, label_singular: label, label_plural: `${label}s`, icon: "folder", color: "",
    max_assignments_per_entity: null, sort_order: 0, parent_type_id: null, default_variable_keys: [],
    slug: label.toLowerCase(), description: "", created_at: "", updated_at: "", scopes,
  };
}
function scope(id: string, typeId: string, name: string): ScopeNode {
  return { id, scope_type_id: typeId, organization_id: ORG, name } as ScopeNode;
}
function org(types: ScopeTypeNode[]): OrgNode {
  return { id: ORG, name: "Castellano & Reyes", slug: "castellano-reyes", scope_types: types, projects: [] } as unknown as OrgNode;
}
const tree = (types: ScopeTypeNode[]) => ({ organizations: [org(types)], fetched_at: new Date(5_000).toISOString() });
const reyes = scope("6f0c2a3e-0000-4000-8000-00000000b001", MATTERS, "Reyes v. Pinnacle");
const doe = scope("6f0c2a3e-0000-4000-8000-00000000b002", MATTERS, "Doe v. CSV");
const golden = scope("6f0c2a3e-0000-4000-8000-00000000b003", CLIENTS, "Golden State Indemnity Co.");

const typeState = makeSelectTypeScopesState();
const asRoot = (s: ScopesState) => ({ scopesTree: s }) as unknown as RootState;

function skeleton() {
  let s = reducer(undefined, scopesActions.skeletonFetchPending());
  s = reducer(s, scopesActions.skeletonFetchFulfilled(tree([type(MATTERS, "Matter"), type(CLIENTS, "Client")])));
  return s;
}

it("the skeleton draws the organization and its types, and the tree is not 'ready'", () => {
  const s = skeleton();
  expect(s.skeletonStatus).toBe("ready");
  expect(s.treeStatus).toBe("idle");
  expect(s.organizations[ORG].scope_types.map((t) => t.label_plural)).toEqual(["Matters", "Clients"]);
  expect(typeState(asRoot(s), MATTERS)).toEqual({ status: "idle", total: null, hasMore: false, error: null });
});

it("a count is unknown until the store counted it, then exact", () => {
  let s = skeleton();
  expect(typeState(asRoot(s), MATTERS).total).toBeNull();
  s = reducer(s, scopesActions.typeCountsFulfilled({ [MATTERS]: 2, [CLIENTS]: 1 }));
  expect(typeState(asRoot(s), MATTERS).total).toBe(2);
});

it("pages land in their type: the first partial with more to ask, the last complete", () => {
  let s = skeleton();
  s = reducer(s, scopesActions.typeScopesPending({ scopeTypeId: MATTERS }));
  expect(typeState(asRoot(s), MATTERS).status).toBe("loading");
  s = reducer(s, scopesActions.typeScopesPageFulfilled({ organizationId: ORG, scopeTypeId: MATTERS, offset: 0, scopes: [reyes], total: 2, nextOffset: 1 }));
  expect(typeState(asRoot(s), MATTERS)).toEqual({ status: "partial", total: 2, hasMore: true, error: null });
  s = reducer(s, scopesActions.typeScopesPageFulfilled({ organizationId: ORG, scopeTypeId: MATTERS, offset: 1, scopes: [doe, reyes], total: 2, nextOffset: null }));
  expect(s.organizations[ORG].scope_types[0].scopes.map((x) => x.name)).toEqual(["Reyes v. Pinnacle", "Doe v. CSV"]);
  expect(typeState(asRoot(s), MATTERS)).toEqual({ status: "complete", total: 2, hasMore: false, error: null });
  expect(s.treeStatus).toBe("idle");
});

it("a failed page says so on its type", () => {
  let s = skeleton();
  s = reducer(s, scopesActions.typeScopesRejected({ scopeTypeId: CLIENTS, error: "statement timeout" }));
  expect(typeState(asRoot(s), CLIENTS)).toMatchObject({ status: "error", error: "statement timeout" });
});

it("the whole tree replaces the skeleton: every type complete with its exact count", () => {
  let s = skeleton();
  s = reducer(s, scopesActions.typeScopesPageFulfilled({ organizationId: ORG, scopeTypeId: MATTERS, offset: 0, scopes: [reyes], total: 2, nextOffset: 1 }));
  s = reducer(s, scopesActions.treeFetchFulfilled(tree([type(MATTERS, "Matter", [reyes, doe]), type(CLIENTS, "Client", [golden])])));
  expect(s.treeStatus).toBe("ready");
  expect(typeState(asRoot(s), MATTERS)).toEqual({ status: "complete", total: 2, hasMore: false, error: null });
  expect(typeState(asRoot(s), CLIENTS).total).toBe(1);
});

it("a skeleton that arrives after the whole tree changes nothing", () => {
  let s = reducer(undefined, scopesActions.treeFetchFulfilled(tree([type(MATTERS, "Matter", [reyes, doe])])));
  s = reducer(s, scopesActions.skeletonFetchFulfilled(tree([type(MATTERS, "Matter")])));
  expect(s.organizations[ORG].scope_types[0].scopes).toHaveLength(2);
  expect(s.treeStatus).toBe("ready");
});

it("a type page that already loaded survives a skeleton refresh", () => {
  let s = skeleton();
  s = reducer(s, scopesActions.typeScopesPageFulfilled({ organizationId: ORG, scopeTypeId: MATTERS, offset: 0, scopes: [reyes, doe], total: 2, nextOffset: null }));
  s = reducer(s, scopesActions.skeletonFetchFulfilled(tree([type(MATTERS, "Matter"), type(CLIENTS, "Client")])));
  expect(s.organizations[ORG].scope_types[0].scopes).toHaveLength(2);
});

it("a cache written from the skeleton is never adopted as the tree on the next boot", () => {
  const saved = scopesTreePolicy.config.serialize!(skeleton()) as Partial<ScopesState>;
  expect(saved.treeComplete).toBe(false);
  const next = reducer(undefined, buildRehydrateAction("scopesTree", saved, {} as never));
  expect(next.treeStatus).toBe("idle");
  expect(next.organizationIds).toEqual([]);
});

it("a cache written from the whole tree boots warm, as before", () => {
  const whole = reducer(undefined, scopesActions.treeFetchFulfilled(tree([type(MATTERS, "Matter", [reyes])])));
  const saved = scopesTreePolicy.config.serialize!(whole) as Partial<ScopesState>;
  expect(saved.treeComplete).toBe(true);
  const next = reducer(undefined, buildRehydrateAction("scopesTree", saved, {} as never));
  expect(next.treeStatus).toBe("ready");
  expect(next.organizations[ORG].scope_types[0].scopes).toHaveLength(1);
});
