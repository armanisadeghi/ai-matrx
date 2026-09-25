/**
 * GATES-TAIL (VERIFIER-21 #7): a table given to a person who is not in its organization asked
 * `get_organization_members_with_users` for that organization on every open and was refused 403.
 * The roster is not hers to read, so it is not asked for. Red on the pre-fix hook.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getOrganizationMembers = jest.fn(async (_orgId: string) => [
  { userId: "u-1", user: { id: "u-1", email: "front.desk@harborstreet.test", displayName: "Rosa Delgado" } },
]);
jest.mock("@/features/organizations/service", () => ({
  getOrganizationMembers: (orgId: string) => getOrganizationMembers(orgId),
}));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => ({ ok: true, data: { memberships: [{ containerId: "org-mine" }] } }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useOrgMembers } = require("./useOrgMembers") as typeof import("./useOrgMembers");

function Probe({ orgId, out }: { orgId: string; out: { size: number; loading: boolean } }) {
  const r = useOrgMembers([orgId]);
  out.size = r.memberById.size;
  out.loading = r.isLoading;
  return null;
}

async function run(orgId: string) {
  const out = { size: -1, loading: true };
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Probe, { orgId, out })));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  act(() => root.unmount());
  return out;
}

it("never asks for the roster of an organization the person is not in", async () => {
  const out = await run("org-not-mine");
  expect(getOrganizationMembers).not.toHaveBeenCalled();
  expect(out).toEqual({ size: 0, loading: false });
});

it("still reads the roster of her own organization", async () => {
  const out = await run("org-mine");
  expect(getOrganizationMembers).toHaveBeenCalledWith("org-mine");
  expect(out.size).toBe(1);
});
