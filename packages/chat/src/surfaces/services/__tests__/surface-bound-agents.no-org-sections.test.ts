// Law: common-docs/policies/active-org-is-never-a-list-filter.md rule 3 — organizations are never
// sections. Agents bound at organization tier in DIFFERENT organizations fold into ONE "My Orgs"
// section, each carrying its organization as a label.
const inQuery = jest.fn();

jest.mock("../../../host/db", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ in: (...args: unknown[]) => inQuery(...args) }),
      }),
    }),
  },
}));
jest.mock("@host/lib/api/adminDoor", () => ({ adminDoorOpen: () => false }));

import { fetchSurfaceMenuAgentsGrouped } from "../surface-bound-agents.service";

const row = (id: string, orgId: string, orgName: string, agentName: string) => ({
  id,
  agent_id: `agent-${id}`,
  surface_name: "matrx-user/x",
  organization_id: orgId,
  user_id: null,
  agent_name: agentName,
  agent_type: "user",
  agent_is_active: true,
  agent: { created_by: "someone-else" },
  organizations: { id: orgId, name: orgName },
  role: `binding:o:${orgId}`,
});

it("folds organization bindings from several organizations into one My Orgs section with the org as a label", async () => {
  inQuery.mockResolvedValue({
    data: [row("1", "org-a", "Acme", "Alpha"), row("2", "org-b", "Beta Co", "Bravo")],
    error: null,
  });
  const sections = await fetchSurfaceMenuAgentsGrouped("matrx-user/x", "user-1", {
    includeDefaults: false,
    force: true,
  });
  expect(sections.map((s) => s.key)).toEqual(["my-orgs"]);
  expect(sections[0]!.label).toBe("My Orgs");
  expect(sections[0]!.agents.map((a) => [a.name, a.organizationName])).toEqual([
    ["Alpha", "Acme"],
    ["Bravo", "Beta Co"],
  ]);
});
