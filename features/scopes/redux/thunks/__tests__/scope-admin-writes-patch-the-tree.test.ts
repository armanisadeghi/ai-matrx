/**
 * THE scope admin console's writes, through their canonical doors, land in THE
 * canonical tree in place (lane SCOPE-ADMIN-CANONICAL, 2026-09-25).
 *
 * What this forces, with a real store (the slim root reducer + the tree's
 * invalidation middleware) and only `scopesService` replaced:
 *   - every scope-type and scope write (create / rename / archive) goes through
 *     its `scopesService` door and the authoritative row appears in, changes in,
 *     or leaves `state.scopesTree` — with the console's fields (slug,
 *     description) readable through the admin selectors;
 *   - the tree is never refetched for such a write (`getScopeTree` is called
 *     once, by the boot load, and never again);
 *   - an archive needs only the row's id — its organization and type are read
 *     from the tree;
 *   - the context-item console thunks (`features/scope-system/redux/
 *     contextItemsSlice`) own no database access: create / edit / archive each
 *     call their `scopesService` door and update BOTH the console cache and the
 *     tree's catalog.
 */
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import { scopeTreeInvalidationMiddleware } from "@/features/scopes/redux/scopeTreeInvalidationMiddleware";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import {
  createScope,
  createScopeType,
  deleteScope,
  deleteScopeType,
  updateScope,
  updateScopeType,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import {
  selectScopeBySlugOrId,
  selectScopeTypeBySlugOrId,
  selectScopeTypesByOrg,
  selectScopesByType,
} from "@/features/scopes/redux/selectors/admin";
import {
  createContextItem,
  deleteContextItem,
  listScopeTypeItems,
  selectItemsByType,
  updateContextItem,
} from "@/features/scope-system/redux/contextItemsSlice";
import type {
  ContextItemRow,
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";
import { scopesService } from "@/features/scopes/service/scopesService";
import { supabase } from "@/utils/supabase/client";

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
  requireUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: {
    getScopeTree: jest.fn(),
    createScopeType: jest.fn(),
    updateScopeType: jest.fn(),
    deleteScopeType: jest.fn(),
    createScope: jest.fn(),
    updateScope: jest.fn(),
    deleteScope: jest.fn(),
    listContextItems: jest.fn(),
    createContextItem: jest.fn(),
    updateContextItem: jest.fn(),
    deleteContextItem: jest.fn(),
  },
}));

const svc = jest.mocked(scopesService);
// A plain mock: `jest.mocked(supabase.rpc)` instantiates the whole generated
// RPC overload set (TS2589).
const rpc = supabase.rpc as unknown as jest.Mock;

const ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const STAMP = "2026-09-25T10:00:00.000Z";

function typeNode(over: Partial<ScopeTypeNode> = {}): ScopeTypeNode {
  return {
    id: "0f5a6b7c-1d2e-4f30-8a41-b52c63d74e85",
    organization_id: ORG,
    label_singular: "Client",
    label_plural: "Clients",
    icon: "Building2",
    color: "blue",
    max_assignments_per_entity: null,
    sort_order: 1,
    parent_type_id: null,
    default_variable_keys: [],
    slug: "clients",
    description: "Companies the practice serves",
    created_at: STAMP,
    updated_at: STAMP,
    scopes: [],
    ...over,
  };
}

function scopeNode(over: Partial<ScopeNode> = {}): ScopeNode {
  return {
    id: "2b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d90",
    scope_type_id: "0f5a6b7c-1d2e-4f30-8a41-b52c63d74e85",
    organization_id: ORG,
    name: "Harbor Dental Group",
    description: "Three-location dental practice in San Diego",
    parent_scope_id: null,
    settings: {},
    slug: "harbor-dental-group",
    sort_order: 1,
    created_by: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  };
}

function org(scopeTypes: ScopeTypeNode[]): OrgNode {
  return {
    id: ORG,
    name: "Harbor Consulting",
    abbreviation: "HC",
    slug: "harbor-consulting",
    is_personal: false,
    role: "owner",
    projects: [],
    scope_types: scopeTypes,
  } as unknown as OrgNode;
}

function contextItem(over: Partial<ContextItemRow> = {}): ContextItemRow {
  return {
    id: "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0",
    scope_type_id: "0f5a6b7c-1d2e-4f30-8a41-b52c63d74e85",
    key: "brand_voice",
    display_name: "Brand voice",
    description: "",
    sort_order: 1,
    is_active: true,
    ...over,
  } as unknown as ContextItemRow;
}

async function bootedStore(scopeTypes: ScopeTypeNode[]) {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) =>
      getDefault({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }).concat(scopeTreeInvalidationMiddleware),
  });
  svc.getScopeTree.mockResolvedValue({
    ok: true,
    data: { organizations: [org(scopeTypes)], fetched_at: STAMP },
  });
  await store.dispatch(ensureScopeTree());
  return store;
}

const state = (store: { getState: () => unknown }) =>
  store.getState() as RootState;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  // Anything the invalidation middleware scheduled would fire here.
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  expect(svc.getScopeTree).toHaveBeenCalledTimes(1);
});

describe("scope-type writes patch the tree in place", () => {
  it("create: the new type is in its organization's list, resolvable by slug, description intact", async () => {
    const store = await bootedStore([]);
    const created = typeNode();
    svc.createScopeType.mockResolvedValue({ ok: true, data: created });

    const res = await store.dispatch(
      createScopeType({
        org_id: ORG,
        label_singular: "Client",
        label_plural: "Clients",
        description: "Companies the practice serves",
      }),
    );

    expect(res).toEqual({ ok: true, data: created });
    expect(selectScopeTypesByOrg(state(store), ORG)).toEqual([created]);
    const bySlug = selectScopeTypeBySlugOrId(state(store), ORG, "clients");
    expect(bySlug?.description).toBe("Companies the practice serves");
  });

  it("rename: the type's label and slug change and its scopes stay", async () => {
    const scope = scopeNode();
    const store = await bootedStore([typeNode({ scopes: [scope] })]);
    svc.updateScopeType.mockResolvedValue({
      ok: true,
      data: typeNode({ label_plural: "Patients", slug: "patients", scopes: [] }),
    });

    await store.dispatch(
      updateScopeType({ type_id: typeNode().id, label_plural: "Patients" }),
    );

    const [t] = selectScopeTypesByOrg(state(store), ORG);
    expect(t.label_plural).toBe("Patients");
    expect(t.slug).toBe("patients");
    expect(t.scopes).toEqual([scope]);
  });

  it("archive: given only the type id, the type leaves its organization's list", async () => {
    const store = await bootedStore([typeNode()]);
    svc.deleteScopeType.mockResolvedValue({ ok: true, data: { id: typeNode().id } });

    await store.dispatch(deleteScopeType({ type_id: typeNode().id }));

    expect(svc.deleteScopeType).toHaveBeenCalledWith(typeNode().id);
    expect(selectScopeTypesByOrg(state(store), ORG)).toEqual([]);
  });

  it("a refused write leaves the tree exactly as it was", async () => {
    const store = await bootedStore([typeNode()]);
    const before = state(store).scopesTree.organizations;
    svc.deleteScopeType.mockResolvedValue({
      ok: false,
      error: { code: "forbidden_org", message: "organization admin required" },
    });

    const res = await store.dispatch(deleteScopeType({ type_id: typeNode().id }));

    expect(res.ok).toBe(false);
    expect(state(store).scopesTree.organizations).toBe(before);
  });
});

describe("scope writes patch the tree in place", () => {
  it("create: the new scope is under its type with its description and slug", async () => {
    const store = await bootedStore([typeNode()]);
    const created = scopeNode();
    svc.createScope.mockResolvedValue({ ok: true, data: created });

    await store.dispatch(
      createScope({
        org_id: ORG,
        type_id: typeNode().id,
        name: "Harbor Dental Group",
        description: "Three-location dental practice in San Diego",
      }),
    );

    expect(selectScopesByType(state(store), typeNode().id)).toEqual([created]);
    expect(
      selectScopeBySlugOrId(state(store), typeNode().id, "harbor-dental-group")
        ?.description,
    ).toBe("Three-location dental practice in San Diego");
  });

  it("rename: the scope's name changes in place", async () => {
    const store = await bootedStore([typeNode({ scopes: [scopeNode()] })]);
    svc.updateScope.mockResolvedValue({
      ok: true,
      data: scopeNode({ name: "Harbor Dental Partners" }),
    });

    await store.dispatch(
      updateScope({ scope_id: scopeNode().id, name: "Harbor Dental Partners" }),
    );

    expect(
      selectScopesByType(state(store), typeNode().id).map((s) => s.name),
    ).toEqual(["Harbor Dental Partners"]);
  });

  it("archive: given only the scope id, the scope leaves its type", async () => {
    const store = await bootedStore([typeNode({ scopes: [scopeNode()] })]);
    svc.deleteScope.mockResolvedValue({ ok: true, data: { id: scopeNode().id } });

    await store.dispatch(deleteScope({ scope_id: scopeNode().id }));

    expect(svc.deleteScope).toHaveBeenCalledWith(scopeNode().id);
    expect(selectScopesByType(state(store), typeNode().id)).toEqual([]);
  });
});

describe("context-item console writes go through scopesService and update both caches", () => {
  async function storeWithLoadedCatalogs(items: ContextItemRow[]) {
    const store = await bootedStore([typeNode()]);
    // The console cache's own read.
    rpc.mockResolvedValueOnce({ data: items, error: null });
    await store.dispatch(listScopeTypeItems(typeNode().id));
    // The tree's catalog read.
    svc.listContextItems.mockResolvedValueOnce({ ok: true, data: { items } } as never);
    await store.dispatch(ensureScopeTypeItems(typeNode().id));
    return store;
  }
  const treeItems = (store: { getState: () => unknown }) =>
    state(store).scopesTree.contextItemsByTypeId[typeNode().id]?.items ?? [];

  it("create", async () => {
    const store = await storeWithLoadedCatalogs([]);
    const created = contextItem();
    svc.createContextItem.mockResolvedValue({ ok: true, data: created });

    await store
      .dispatch(
        createContextItem({
          scope_type_id: typeNode().id,
          key: "brand_voice",
          display_name: "Brand voice",
        }),
      )
      .unwrap();

    expect(svc.createContextItem).toHaveBeenCalledTimes(1);
    expect(selectItemsByType(state(store), typeNode().id).map((i) => i.id)).toEqual([created.id]);
    expect(treeItems(store).map((i) => i.id)).toEqual([created.id]);
  });

  it("rename", async () => {
    const store = await storeWithLoadedCatalogs([contextItem()]);
    svc.updateContextItem.mockResolvedValue({
      ok: true,
      data: contextItem({ display_name: "Tone of voice" }),
    });

    await store
      .dispatch(updateContextItem({ id: contextItem().id, display_name: "Tone of voice" }))
      .unwrap();

    expect(svc.updateContextItem).toHaveBeenCalledWith({
      item_id: contextItem().id,
      display_name: "Tone of voice",
    });
    expect(selectItemsByType(state(store), typeNode().id)[0].display_name).toBe("Tone of voice");
    expect(treeItems(store)[0].display_name).toBe("Tone of voice");
  });

  it("archive", async () => {
    const store = await storeWithLoadedCatalogs([contextItem()]);
    svc.deleteContextItem.mockResolvedValue({ ok: true, data: { id: contextItem().id } });

    await store.dispatch(deleteContextItem(contextItem().id)).unwrap();

    expect(svc.deleteContextItem).toHaveBeenCalledWith(contextItem().id);
    expect(selectItemsByType(state(store), typeNode().id)).toEqual([]);
    expect(treeItems(store)).toEqual([]);
  });

  it("a refused edit rejects with the service's message and changes neither cache", async () => {
    const store = await storeWithLoadedCatalogs([contextItem()]);
    svc.updateContextItem.mockResolvedValue({
      ok: false,
      error: { code: "forbidden_org", message: "organization admin required" },
    });

    await expect(
      store.dispatch(updateContextItem({ id: contextItem().id, display_name: "X" })).unwrap(),
    ).rejects.toMatchObject({ message: "organization admin required" });
    expect(treeItems(store)[0].display_name).toBe("Brand voice");
  });
});
