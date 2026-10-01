// Law: common-docs/policies/active-org-is-never-a-list-filter.md — the "Organization" view scope
// names where a NEW render block is filed; it never narrows what the window lists.
const eq = jest.fn();
const builder: Record<string, unknown> = {};
for (const m of ["select", "is", "order"]) builder[m] = jest.fn(() => builder);
builder.eq = (...a: unknown[]) => {
  eq(...a);
  return builder;
};
builder.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => builder }) },
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "c4a1e2d7-5b3f-4e88-9a6c-0d2f7b81e395" } } }),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn() }));

import { configureStore } from "@reduxjs/toolkit";
import { fetchRenderDefinitions } from "../redux/skl/thunks";

it("a render-definition read under the Organization scope does not filter by the active organization", async () => {
  const store = configureStore({
    reducer: (s: object = {}) => s,
  });
  const dispatch = jest.fn();
  await (fetchRenderDefinitions({ scope: "organization", scopeId: "org-active" }) as unknown as (
    d: unknown,
    g: unknown,
    e: unknown,
  ) => Promise<unknown>)(dispatch, store.getState, undefined);
  expect(builder.select).toHaveBeenCalled(); // the read really ran
  expect(eq).not.toHaveBeenCalledWith("organization_id", expect.anything());
});
