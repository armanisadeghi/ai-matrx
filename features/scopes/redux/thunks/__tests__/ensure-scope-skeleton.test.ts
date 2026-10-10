/**
 * THE BOOT ASKS FOR THE SKELETON (lane SCOPES-TREE-PAGED).
 *   - the skeleton (getScopeTree({ shape: "skeleton" })), kept beside the whole tree, so a
 *     reader of the whole tree still sees nothing until every scope is in;
 *   - a type's page lands in its type in the skeleton.
 */
import { configureStore } from "@reduxjs/toolkit";
import reducer from "@/features/scopes/redux/scopesSlice";
import { ensureScopeSkeleton, ensureTypeScopes } from "@/features/scopes/redux/thunks/ensureScopeSkeleton";
import { scopesService } from "@/features/scopes/service/scopesService";

jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "4060701e-706a-4c76-b3ca-0bbc69fa5a14" }));
jest.mock("@/features/scopes/service/scopesService", () => ({ scopesService: { getScopeTree: jest.fn() } }));
const typeScopesPage = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({ scopeDoors: () => ({ typeScopesPage }) }));

const ORG = "org-cedar-ridge";
const PATIENTS = "type-patients";
const skeleton = {
  organizations: [{ id: ORG, name: "Cedar Ridge Physical Therapy", projects: [],
    scope_types: [{ id: PATIENTS, organization_id: ORG, label_plural: "Patients", scopes: [] }] }],
  fetched_at: new Date(1_000).toISOString(),
};
const dana = { id: "scope-dana", scope_type_id: PATIENTS, organization_id: ORG, name: "Dana Whitfield" };
const store = () => configureStore({ reducer: { scopesTree: reducer } });
const getScopeTree = scopesService.getScopeTree as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

it("the skeleton lands beside the whole tree, and a type's page lands in it", async () => {
  getScopeTree.mockResolvedValue({ ok: true, data: skeleton });
  typeScopesPage.mockResolvedValue({ ok: true, data: { scopes: [dana], total: 1, next_offset: null } });
  const s = store();
  await s.dispatch(ensureScopeSkeleton() as never);
  expect(getScopeTree).toHaveBeenCalledWith({ shape: "skeleton" });
  const st = s.getState().scopesTree;
  expect(st.treeStatus).toBe("idle");
  expect(st.organizationIds).toEqual([]);
  expect(st.skeletonOrganizationIds).toEqual([ORG]);
  await s.dispatch(ensureTypeScopes(PATIENTS) as never);
  expect(typeScopesPage).toHaveBeenCalledWith(PATIENTS, 0, 200);
  expect(s.getState().scopesTree.skeletonOrganizations[ORG].scope_types[0].scopes.map((x) => x.name)).toEqual(["Dana Whitfield"]);
  expect(s.getState().scopesTree.typeScopes[PATIENTS].status).toBe("complete");
});
