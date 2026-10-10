/**
 * @jest-environment jsdom
 */
/**
 * Lane STORE-READ-PERF-5 — A PAGE THAT SHOWS MANY SCOPES READS THEIR VALUES IN ONE CALL.
 *
 * The validate lane measured the store path's scope type page making ~57 separate
 * `custom.context_values` calls, one per scope (each paying the door's fixed cost; 500/503s from the
 * clone under two browsers). Both screens that show a type's scopes — the type page (`ScopesList`)
 * and the type's preview card on the organization's scopes page (`OrgScopeTypeSection`) — now ask
 * `scopesService.listContextValuesForScopes` ONCE for every scope on screen (the store door takes 200
 * a call), and each scope's view reads the values store.
 *
 * Driven through a real store over the real root reducer and the real screen components; only the
 * service (the network) and the chrome hooks the screens need are stood in. RED on the HEAD copies
 * (one `listContextValues` per scope), GREEN after.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { scopesService } from "@/features/scopes/service/scopesService";
import type { ContextField, ScopeTypeWithScopes } from "@ai-matrx/records/scopes";
import type { OrgNode } from "@/features/scopes/types";
import { OrgScopeTypeSection } from "@/features/scopes/components/management/OrgScopeTypeSection";
import { ScopesList } from "@/features/scope-system/components/ScopesList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
  requireUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  usePathname: () => "/organizations/castellano-reyes/scopes/matters",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/features/kg-suggestions/hooks/useScopeSuggestions", () => ({
  // No knowledge-graph suggestions on this page; the hook's own empty shape.
  useScopeSuggestions: () => ({
    items: [],
    byScope: new Map(),
    byScopeItem: new Map(),
    accept: jest.fn(),
    reject: jest.fn(),
    defer: jest.fn(),
    status: "ready",
    refresh: jest.fn(),
    forScope: () => [],
    forScopeItem: () => [],
    countForScopes: () => 0,
  }),
}));
// The type page's attachments grid needs the host's associations binding; it reads no values.
jest.mock("@ai-matrx/associations/react", () => ({
  ...jest.requireActual("@ai-matrx/associations/react"),
  AssociationCardGrid: () => null,
}));
jest.mock("@/features/overlays/openers/contextItemsWindow", () => ({
  useOpenContextItemsWindow: () => jest.fn(),
}));
jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: {
    getScopeTree: jest.fn(),
    listContextItems: jest.fn(),
    listContextItemsForTypes: jest.fn(),
    listContextValues: jest.fn(),
    listContextValuesForScopes: jest.fn(),
    getScopeHome: jest.fn(),
  },
}));

const svc = jest.mocked(scopesService);

const ORG = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const TYPE = "1aaba65d-68de-457e-8a0c-0f2731161d13";
const ITEM = "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0";
const STAMP = "2026-09-30T10:00:00.000Z";
// A real type page: a personal-injury firm's Matters, 57 of them (the count the validate lane saw).
const SCOPE_IDS = Array.from({ length: 57 }, (_, i) =>
  `2645730c-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);

function mattersType(): ScopeTypeWithScopes {
  return {
    id: TYPE,
    organization_id: ORG,
    label_singular: "Matter",
    label_plural: "Matters",
    icon: "Briefcase",
    color: "blue",
    max_assignments_per_entity: null,
    sort_order: 1,
    parent_type_id: null,
    default_variable_keys: [],
    slug: "matters",
    description: "Open and closed cases",
    created_at: STAMP,
    updated_at: STAMP,
    scopes: SCOPE_IDS.map((id, i) => ({
      id,
      scope_type_id: TYPE,
      organization_id: ORG,
      name: `Reyes v. Pinnacle ${i + 1}`,
      description: null,
      parent_scope_id: null,
      settings: {},
      slug: `reyes-v-pinnacle-${i + 1}`,
      sort_order: i + 1,
      created_by: null,
      created_at: STAMP,
      updated_at: STAMP,
    })),
  } as unknown as ScopeTypeWithScopes;
}

const dateOfInjury = {
  id: ITEM,
  scope_type_id: TYPE,
  key: "date_of_injury",
  display_name: "Date of Injury",
  description: "",
  value_type: "date",
  sort_order: 1,
  is_active: true,
} as unknown as ContextField;

async function bootedStore() {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false, actionCreatorCheck: false }),
  });
  svc.getScopeTree.mockResolvedValue({
    ok: true,
    data: {
      organizations: [
        { id: ORG, name: "Castellano & Reyes, LLP", abbreviation: "CR", slug: "castellano-reyes", role: "owner", projects: [], scope_types: [mattersType()] } as OrgNode,
      ],
      fetched_at: STAMP,
    },
  });
  await store.dispatch(ensureScopeTree());
  return store;
}

function stubReads() {
  svc.listContextItems.mockResolvedValue({ ok: true, data: { items: [dateOfInjury] } });
  svc.listContextItemsForTypes.mockResolvedValue({ ok: true, data: { items: [dateOfInjury] } });
  // Only the first matter has a value; every other one is ready with none.
  svc.listContextValuesForScopes.mockImplementation(async (ids: string[]) => ({
    ok: true,
    data: {
      values: ids.includes(SCOPE_IDS[0])
        ? [{ scope_id: SCOPE_IDS[0], context_item_id: ITEM, id: "v1", version: 1, is_current: true, value_date: "2023-09-02" } as never]
        : [],
    },
  }));
  svc.listContextValues.mockImplementation(async (scopeId: string) => ({
    ok: true,
    data: {
      values: scopeId === SCOPE_IDS[0]
        ? [{ context_item_id: ITEM, id: "v1", version: 1, is_current: true, value_date: "2023-09-02" } as never]
        : [],
    },
  }));
}

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function valuesCalls() {
  return {
    perScope: svc.listContextValues.mock.calls.length,
    batched: svc.listContextValuesForScopes.mock.calls.map((c) => [...(c[0] as string[])].sort()),
  };
}

describe("a page of many scopes reads their values in one call", () => {
  it("the type page (ScopesList): one read for all 57 matters, none per matter, every matter's view loaded", async () => {
    const store = await bootedStore();
    stubReads();

    await act(async () => {
      root.render(
        <Provider store={store}>
          <ScopesList
            orgId={ORG}
            orgSlugOrId="castellano-reyes"
            typeId="matters"
            orgName="Castellano & Reyes, LLP"
            orgSlug="castellano-reyes"
            canManage
          />
        </Provider>,
      );
    });
    await settle();

    const calls = valuesCalls();
    expect(calls.perScope).toBe(0);
    expect(calls.batched).toEqual([[...SCOPE_IDS].sort()]);
    const byScope = (store.getState() as RootState).contextValues.byScope;
    expect(SCOPE_IDS.every((id) => byScope[id]?.status === "ready")).toBe(true);
    expect(byScope[SCOPE_IDS[0]]?.values[ITEM]).toMatchObject({ value_date: "2023-09-02" });
    expect(Object.keys(byScope[SCOPE_IDS[1]]?.values ?? {})).toEqual([]);
  });

  it("the type's card on the organization's scopes page (OrgScopeTypeSection): one read for all 57", async () => {
    const store = await bootedStore();
    stubReads();

    await act(async () => {
      root.render(
        <Provider store={store}>
          <OrgScopeTypeSection scopeType={mattersType()} orgId={ORG} orgSlugOrId="castellano-reyes" />
        </Provider>,
      );
    });
    await settle();

    const calls = valuesCalls();
    expect(calls.perScope).toBe(0);
    expect(calls.batched).toEqual([[...SCOPE_IDS].sort()]);
    const byScope = (store.getState() as RootState).contextValues.byScope;
    expect(SCOPE_IDS.every((id) => byScope[id]?.status === "ready")).toBe(true);
  });

  it("a scope already loaded is not read again, and a failed batch fails every scope it asked for", async () => {
    const { ensureContextValuesForScopes, ensureContextValues } = await import(
      "@/features/scopes/redux/thunks/ensureContextValues"
    );
    const store = await bootedStore();
    stubReads();
    await store.dispatch(ensureContextValues(SCOPE_IDS[0]));
    expect(svc.listContextValues).toHaveBeenCalledTimes(1);

    await store.dispatch(ensureContextValuesForScopes(SCOPE_IDS.slice(0, 3)));
    expect(svc.listContextValuesForScopes.mock.calls.map((c) => [...(c[0] as string[])].sort())).toEqual([
      [SCOPE_IDS[1], SCOPE_IDS[2]].sort(),
    ]);

    svc.listContextValuesForScopes.mockResolvedValueOnce({
      ok: false,
      error: { message: "custom.context_values: canceling statement due to statement timeout", code: "57014" },
    } as never);
    await store.dispatch(ensureContextValuesForScopes(SCOPE_IDS.slice(3, 5)));
    const byScope = (store.getState() as RootState).contextValues.byScope;
    expect(byScope[SCOPE_IDS[3]]).toMatchObject({ status: "error" });
    expect(byScope[SCOPE_IDS[4]]?.error).toContain("statement timeout");
  });
});
