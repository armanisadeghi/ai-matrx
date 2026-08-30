/**
 * `resolveOrganizationForBlockedAction` — the first-org choice must not destroy
 * the action it was made to unblock.
 *
 * `setOrganization` cascades: it clears scopes, project, task AND
 * `conversation_id`, because switching organizations invalidates everything
 * chosen under the old one. Reusing it for the organization gate would clear
 * the very conversation the person is composing in — stranding the send that
 * raised the question in the first place.
 */

import reducer, {
  resolveOrganizationForBlockedAction,
  setOrganization,
} from "../appContextSlice";

const TEAM_ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const OTHER_ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";

const composing = {
  organization_id: null,
  organization_name: null,
  personal_organization_id: null,
  scope_selections: { s1: "s1" },
  active_scope_type_ids: ["t1"],
  project_id: "p1",
  project_name: "Project",
  task_id: "t1",
  task_name: "Task",
  conversation_id: "conversation-being-composed",
  orgBootstrapResolved: true,
};

describe("resolveOrganizationForBlockedAction", () => {
  test("sets the organization and KEEPS the conversation", () => {
    const next = reducer(
      composing,
      resolveOrganizationForBlockedAction({ id: TEAM_ORG, name: "Titanium" }),
    );

    expect(next.organization_id).toBe(TEAM_ORG);
    expect(next.organization_name).toBe("Titanium");
    // The whole point: the blocked action can still finish.
    expect(next.conversation_id).toBe("conversation-being-composed");
  });

  test("clears selections that were made with no organization in play", () => {
    const next = reducer(
      composing,
      resolveOrganizationForBlockedAction({ id: TEAM_ORG }),
    );

    expect(next.scope_selections).toEqual({});
    expect(next.active_scope_type_ids).toEqual([]);
    expect(next.project_id).toBeNull();
    expect(next.task_id).toBeNull();
  });

  test("refuses to act when an organization is already set", () => {
    // A real SWITCH must take the full cascade. Letting this reducer through
    // would move someone between tenants while silently keeping the previous
    // tenant's conversation pointer.
    const withOrg = { ...composing, organization_id: OTHER_ORG };
    const next = reducer(
      withOrg,
      resolveOrganizationForBlockedAction({ id: TEAM_ORG }),
    );

    expect(next.organization_id).toBe(OTHER_ORG);
  });

  test("setOrganization still cascades — this reducer did not weaken it", () => {
    const next = reducer(composing, setOrganization({ id: TEAM_ORG }));

    expect(next.conversation_id).toBeNull();
    expect(next.project_id).toBeNull();
    expect(next.scope_selections).toEqual({});
  });
});
