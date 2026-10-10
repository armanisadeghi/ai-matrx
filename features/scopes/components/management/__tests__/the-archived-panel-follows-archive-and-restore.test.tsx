/**
 * @jest-environment jsdom
 */
/**
 * Lane FINISH-THE-SWITCH, FTS-1i — THE ARCHIVED PANEL ON /scopes FOLLOWS AN ARCHIVE AND A RESTORE WITHOUT A RELOAD.
 *
 * The final walk (2026-10-05) archived "Treatment Programs" from its settings sheet and the page's Archived panel kept
 * saying nothing until a reload: the panel read the archive once, on mount, and the archive happened in a child (the
 * sheet's `deleteScopeType` thunk drops the type from the tree). And a restored type must leave the panel the moment
 * the restore succeeds, not when a second read comes back.
 *
 * Driven through a real store over the real root reducer and the real ScopesManager; only the services (the network)
 * and the chrome hooks are stood in. RED before (the panel stayed empty after the archive; the restored row stayed
 * while the re-read was pending), GREEN after.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { deleteScopeType } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import type { ArchivedScopeType, ScopeTypeWithScopes } from "@ai-matrx/records/scopes";
import type { OrgNode } from "@/features/scopes/types";
import { ScopesManager } from "@/features/scopes/components/management/ScopesManager";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
  requireUserId: () => "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  usePathname: () => "/organizations/alex-hart/scopes",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/features/kg-suggestions/hooks/useScopeSuggestions", () => ({
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
    listArchivedScopeTypes: jest.fn(),
  },
}));
const mockDoors = { archiveType: jest.fn(), restoreType: jest.fn() };
jest.mock("@/features/scopes/service/scopeDoors", () => ({
  ...jest.requireActual("@/features/scopes/service/scopeDoors"),
  scopeDoors: () => mockDoors,
}));

const svc = jest.mocked(scopesService);
const store$ = jest.mocked(scopeDoors());

const ORG = "8cb71c8b-5b49-4563-a5fe-d77ff600f8ee";
const PROGRAMS = "4cd19025-4108-4183-962b-b69be8577371";
const SITES = "5d2e8f10-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const STAMP = "2026-10-05T19:04:05.000Z";

function type(id: string, singular: string, plural: string, order: number): ScopeTypeWithScopes {
  return {
    id,
    organization_id: ORG,
    label_singular: singular,
    label_plural: plural,
    icon: "Folder",
    color: "blue",
    max_assignments_per_entity: null,
    sort_order: order,
    parent_type_id: null,
    default_variable_keys: [],
    slug: plural.toLowerCase().replace(/ /g, "-"),
    description: "",
    created_at: STAMP,
    updated_at: STAMP,
    scopes: [],
  } as unknown as ScopeTypeWithScopes;
}

const archivedPrograms: ArchivedScopeType = {
  id: PROGRAMS,
  organization_id: ORG,
  label_singular: "Treatment Program",
  label_plural: "Treatment Programs",
  icon: "Folder",
  color: "blue",
  archived_at: "2026-10-05T20:01:01.693Z",
  created_by: null,
  archived_scope_count: 1,
};

async function bootedStore(types: ScopeTypeWithScopes[]) {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false, actionCreatorCheck: false }),
  });
  svc.getScopeTree.mockResolvedValue({
    ok: true,
    data: {
      organizations: [
        { id: ORG, name: "Alex Hart's Workspace", abbreviation: "AH", slug: "alex-hart", role: "owner", projects: [], scope_types: types } as OrgNode,
      ],
      fetched_at: STAMP,
    },
  });
  await store.dispatch(ensureScopeTree());
  return store;
}

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  svc.listContextItems.mockResolvedValue({ ok: true, data: { items: [] } });
  svc.listContextItemsForTypes.mockResolvedValue({ ok: true, data: { items: [] } });
  svc.listContextValuesForScopes.mockResolvedValue({ ok: true, data: { values: [] } });
  svc.listContextValues.mockResolvedValue({ ok: true, data: { values: [] } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function archivedToggle(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => /Archived/.test(b.textContent ?? ""));
}

function buttonsNamed(name: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === name);
}

describe("the /scopes Archived panel follows an archive and a restore", () => {
  it("a type archived on the page shows in the panel without a reload", async () => {
    const store = await bootedStore([type(PROGRAMS, "Treatment Program", "Treatment Programs", 1), type(SITES, "Clinic Site", "Clinic Sites", 2)]);
    svc.listArchivedScopeTypes.mockResolvedValue({ ok: true, data: { types: [] } });
    await act(async () => {
      root.render(
        <Provider store={store}>
          <ScopesManager organization={{ id: ORG, name: "Alex Hart's Workspace", slug: "alex-hart", logoUrl: null }} role="owner" />
        </Provider>,
      );
    });
    await settle();
    expect(archivedToggle()).toBeUndefined();

    // The settings sheet's archive: the door answers, the tree drops the type, the archive now holds it.
    store$.archiveType.mockResolvedValue({ ok: true, data: { id: PROGRAMS } });
    svc.listArchivedScopeTypes.mockResolvedValue({ ok: true, data: { types: [archivedPrograms] } });
    await act(async () => {
      await store.dispatch(deleteScopeType({ type_id: PROGRAMS, organization_id: ORG }));
    });
    await settle();

    const toggle = archivedToggle();
    expect(toggle?.textContent).toContain("1");
    await act(async () => toggle?.click());
    await settle();
    expect(document.body.textContent).toContain("Treatment Programs");
  });

  it("a restored type leaves the panel when the restore succeeds", async () => {
    const store = await bootedStore([type(SITES, "Clinic Site", "Clinic Sites", 2)]);
    svc.listArchivedScopeTypes.mockResolvedValue({ ok: true, data: { types: [archivedPrograms] } });
    await act(async () => {
      root.render(
        <Provider store={store}>
          <ScopesManager organization={{ id: ORG, name: "Alex Hart's Workspace", slug: "alex-hart", logoUrl: null }} role="owner" />
        </Provider>,
      );
    });
    await settle();
    await act(async () => archivedToggle()?.click());
    await settle();
    await act(async () => buttonsNamed("Restore")[0].click());
    await settle();

    // The restore succeeds; the archive's re-read has not come back yet.
    store$.restoreType.mockResolvedValue({ ok: true, data: { id: PROGRAMS } });
    svc.listArchivedScopeTypes.mockReturnValue(new Promise(() => {}));
    const confirm = buttonsNamed("Restore");
    await act(async () => confirm[confirm.length - 1].click());
    await settle();

    expect(store$.restoreType).toHaveBeenCalledWith(PROGRAMS);
    expect(archivedToggle()).toBeUndefined();
  });
});
