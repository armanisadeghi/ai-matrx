/**
 * @jest-environment jsdom
 */
/**
 * Lane SCOPE-ADMIN-2 — the three behaviours the retired slices used to own,
 * driven through a real store over the real root reducer:
 *
 *   1. CATALOG — context-item definitions are read from the tree's catalogs
 *      (`scopesTree.contextItemsByTypeId`), loaded once; the System Context
 *      catalog comes from the same loader through `scopesService`.
 *   2. SCOPE-CONTEXT VIEW — a scope's rows are DERIVED from its type's catalog
 *      plus the values store; a definition edit shows in the view with no
 *      re-read, and a person's cell write goes through `scopesService.
 *      setContextValue` (source `manual`) — never a second write path.
 *   3. ADMIN LANE — the one tree loader loads a non-member organization for the
 *      /administration console only, keeps it out of every list of the
 *      person's organizations and out of the warm cache, and releases it.
 */
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import { ensureScopeTree, ensureAdminOrganizationTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  listScopeTypeItems,
  listSystemContextItems,
  selectItemsByType,
  selectItemsLoadedForType,
  SYSTEM_ITEMS_KEY,
  updateContextItem,
} from "@/features/scopes/redux/contextItemCatalog";
import {
  getScopeContext,
  selectValuesByScope,
  selectFilledCount,
  setScopeContextValue,
} from "@/features/scopes/redux/scopeContextView";
import { scopesActions, scopesTreePolicy } from "@/features/scopes/redux/scopesSlice";
import {
  selectAllScopeTypes,
  selectScopeTypesByOrg,
} from "@/features/scopes/redux/selectors/admin";
import type { ContextItemRow, OrgNode, ScopeTypeNode } from "@/features/scopes/types";
import { scopesService } from "@/features/scopes/service/scopesService";

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
  requireUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
}));

jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: {
    getScopeTree: jest.fn(),
    getOrganizationTreeForAdmin: jest.fn(),
    listContextItems: jest.fn(),
    listSystemContextItems: jest.fn(),
    listContextValues: jest.fn(),
    getScopeHome: jest.fn(),
    setContextValue: jest.fn(),
    updateContextItem: jest.fn(),
  },
}));

const svc = jest.mocked(scopesService);

const ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const OTHER_ORG = "7721ceda-72f0-4e4c-b712-00cf9dc8f117";
const TYPE = "0f5a6b7c-1d2e-4f30-8a41-b52c63d74e85";
const SCOPE = "2b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d90";
const STAMP = "2026-09-25T10:00:00.000Z";

function clientType(orgId = ORG, id = TYPE): ScopeTypeNode {
  return {
    id,
    organization_id: orgId,
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
    scopes: [
      {
        id: SCOPE,
        scope_type_id: id,
        organization_id: orgId,
        name: "Harbor Dental Group",
        description: "Three-location dental practice in San Diego",
        parent_scope_id: null,
        settings: {},
        slug: "harbor-dental-group",
        sort_order: 1,
        created_by: null,
        created_at: STAMP,
        updated_at: STAMP,
      },
    ],
  } as unknown as ScopeTypeNode;
}

function org(id: string, name: string, types: ScopeTypeNode[], extra: Partial<OrgNode> = {}): OrgNode {
  return {
    id,
    name,
    abbreviation: name.slice(0, 2).toUpperCase(),
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    is_personal: false,
    role: "owner",
    projects: [],
    scope_types: types,
    ...extra,
  } as OrgNode;
}

function item(over: Partial<ContextItemRow> = {}): ContextItemRow {
  return {
    id: "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0",
    scope_type_id: TYPE,
    key: "brand_voice",
    display_name: "Brand voice",
    description: "How the practice sounds in writing",
    value_type: "string",
    sort_order: 1,
    is_active: true,
    ...over,
  } as unknown as ContextItemRow;
}

async function bootedStore() {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (g) =>
      g({ serializableCheck: false, immutableCheck: false, actionCreatorCheck: false }),
  });
  svc.getScopeTree.mockResolvedValue({
    ok: true,
    data: { organizations: [org(ORG, "Harbor Consulting", [clientType()])], fetched_at: STAMP },
  });
  await store.dispatch(ensureScopeTree());
  return store;
}

const st = (s: { getState: () => unknown }) => s.getState() as RootState;

beforeEach(() => jest.clearAllMocks());

describe("1. the catalog is the tree's", () => {
  it("loads a type's items once, into scopesTree.contextItemsByTypeId", async () => {
    const store = await bootedStore();
    svc.listContextItems.mockResolvedValue({ ok: true, data: { items: [item()] } });

    await store.dispatch(listScopeTypeItems(TYPE));
    await store.dispatch(listScopeTypeItems(TYPE));

    expect(svc.listContextItems).toHaveBeenCalledTimes(1);
    expect(st(store).scopesTree.contextItemsByTypeId[TYPE]?.items).toHaveLength(1);
    expect(selectItemsByType(st(store), TYPE).map((i) => i.display_name)).toEqual(["Brand voice"]);
    expect(selectItemsLoadedForType(st(store), TYPE)).toBe(true);
    expect((st(store) as unknown as Record<string, unknown>).contextItems).toBeUndefined();
  });

  it("loads System Context through the same loader and service door", async () => {
    const store = await bootedStore();
    svc.listSystemContextItems.mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "11111111-2222-4333-8444-555555555555", key: "current_date", display_name: "Today's date", description: null, item_class: "ambient", value_type: "date", sensitivity: "public", sort_order: 1 },
        ],
      },
    });

    await store.dispatch(listSystemContextItems());

    const sys = selectItemsByType(st(store), SYSTEM_ITEMS_KEY);
    expect(sys).toHaveLength(1);
    expect(sys[0]).toMatchObject({ scope_type_id: SYSTEM_ITEMS_KEY, system_item_class: "ambient", description: "" });
  });
});

describe("2. the scope-context view is derived, and its writes use the one door", () => {
  async function storeWithView() {
    const store = await bootedStore();
    svc.listContextItems.mockResolvedValue({
      ok: true,
      data: { items: [item(), item({ id: "8d7c6b5a-4938-4271-a605-f4e3d2c1b0a9", key: "phone", display_name: "Main phone", sort_order: 2 })] },
    });
    svc.listContextValues.mockResolvedValue({
      ok: true,
      data: {
        values: [
          { context_item_id: "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0", id: "v1", version: 3, is_current: true, value_text: "Warm, plain-spoken, never salesy", value_number: null, value_boolean: null, value_date: null, value_json: null, value_document_url: null, value_document_size_bytes: null, value_reference_id: null, value_reference_type: null, source_type: "manual", authored_by: null, created_at: STAMP },
        ],
      },
    });
    const res = await store.dispatch(getScopeContext({ scope_id: SCOPE, include_empty: true })).unwrap();
    return { store, res };
  }

  it("joins the type's catalog to the scope's values, in catalog order", async () => {
    const { store, res } = await storeWithView();
    expect(res.rows.map((r) => [r.display_name, r.has_value, r.value_text])).toEqual([
      ["Brand voice", true, "Warm, plain-spoken, never salesy"],
      ["Main phone", false, null],
    ]);
    expect(selectFilledCount(st(store), SCOPE)).toEqual({ filled: 1, total: 2 });
    expect((st(store) as unknown as Record<string, unknown>).scopeValues).toBeUndefined();
    expect(svc.getScopeHome).not.toHaveBeenCalled();
  });

  it("a definition edit shows in the view with no re-read", async () => {
    const { store } = await storeWithView();
    svc.updateContextItem.mockResolvedValue({ ok: true, data: item({ display_name: "Tone of voice" }) });

    await store.dispatch(updateContextItem({ id: "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0", display_name: "Tone of voice" })).unwrap();

    expect(selectValuesByScope(st(store), SCOPE)?.map((r) => r.display_name)).toContain("Tone of voice");
    expect(svc.listContextItems).toHaveBeenCalledTimes(1);
    expect(svc.listContextValues).toHaveBeenCalledTimes(1);
  });

  it("a person's cell write goes through scopesService.setContextValue as `manual` and lands in the view", async () => {
    const { store } = await storeWithView();
    svc.setContextValue.mockResolvedValue({
      ok: true,
      data: { id: "v2", context_item_id: "8d7c6b5a-4938-4271-a605-f4e3d2c1b0a9", scope_id: SCOPE, version: 1, value_text: "(619) 555-0142", source_type: "manual" },
    });

    await store
      .dispatch(setScopeContextValue({ scope_id: SCOPE, context_item_id: "8d7c6b5a-4938-4271-a605-f4e3d2c1b0a9", value_text: "(619) 555-0142" }))
      .unwrap();

    expect(svc.setContextValue).toHaveBeenCalledWith(
      expect.objectContaining({ scope_id: SCOPE, source_type: "manual", value_text: "(619) 555-0142" }),
    );
    const phone = selectValuesByScope(st(store), SCOPE)?.find((r) => r.key === "phone");
    expect(phone).toMatchObject({ has_value: true, value_text: "(619) 555-0142" });
  });

  it("a refused cell write rejects with the database's sentence", async () => {
    const { store } = await storeWithView();
    svc.setContextValue.mockResolvedValue({
      ok: false,
      error: { code: "forbidden_org", message: "You can view this client but not edit it." },
    });
    await expect(
      store.dispatch(setScopeContextValue({ scope_id: SCOPE, context_item_id: "8d7c6b5a-4938-4271-a605-f4e3d2c1b0a9", value_text: "x" })).unwrap(),
    ).rejects.toMatchObject({ message: "You can view this client but not edit it." });
  });
});

describe("3. the admin lane", () => {
  const otherType = clientType(OTHER_ORG, "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d");
  const otherOrg = org(OTHER_ORG, "Northwind Recycling", [otherType], { role: "admin", admin_lane: true });

  it("loads a non-member organization for the console, outside the person's organization list", async () => {
    const store = await bootedStore();
    svc.getOrganizationTreeForAdmin.mockResolvedValue({ ok: true, data: { organization: otherOrg } });

    const res = await store.dispatch(ensureAdminOrganizationTree(OTHER_ORG));

    expect(res).toEqual({ status: "loaded" });
    const s = st(store).scopesTree;
    expect(s.organizationIds).toEqual([ORG]);
    expect(s.adminLaneOrganizationIds).toEqual([OTHER_ORG]);
    expect(selectScopeTypesByOrg(st(store), OTHER_ORG).map((t) => t.id)).toEqual([otherType.id]);
    expect(selectAllScopeTypes(st(store)).map((t) => t.organization_id)).toContain(OTHER_ORG);
  });

  it("is never written to the warm cache, survives a membership refresh, and leaves on release", async () => {
    const store = await bootedStore();
    svc.getOrganizationTreeForAdmin.mockResolvedValue({ ok: true, data: { organization: otherOrg } });
    await store.dispatch(ensureAdminOrganizationTree(OTHER_ORG));

    const persisted = scopesTreePolicy.config.serialize!(st(store).scopesTree) as { organizations?: Record<string, unknown> };
    expect(Object.keys(persisted.organizations ?? {})).toEqual([ORG]);

    await store.dispatch(ensureScopeTree({ refresh: true }));
    expect(st(store).scopesTree.organizations[OTHER_ORG]).toBeDefined();

    store.dispatch(scopesActions.adminLaneOrganizationReleased(OTHER_ORG));
    expect(st(store).scopesTree.organizations[OTHER_ORG]).toBeUndefined();
    expect(selectAllScopeTypes(st(store)).map((t) => t.organization_id)).not.toContain(OTHER_ORG);
  });

  it("a member organization is answered from the membership tree, never the admin arm", async () => {
    const store = await bootedStore();
    const res = await store.dispatch(ensureAdminOrganizationTree(ORG));
    expect(res).toEqual({ status: "member" });
    expect(svc.getOrganizationTreeForAdmin).not.toHaveBeenCalled();
  });

  it("an organization the admin arm cannot find says so", async () => {
    const store = await bootedStore();
    svc.getOrganizationTreeForAdmin.mockResolvedValue({ ok: true, data: { organization: null } });
    expect(await store.dispatch(ensureAdminOrganizationTree(OTHER_ORG))).toEqual({ status: "not_found" });
  });
});
