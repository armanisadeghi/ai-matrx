// The Tasks list is narrowed by an organization ONLY when the person picks one on the page
// (taskUiSlice.filterOrgId, default All). The header's selected organization never narrows it.
import { selectValidProjectIds } from "../selectors";
import taskUiReducer, { setFilterOrgId, selectFilterOrgId } from "../taskUiSlice";

jest.mock("@/features/agent-context/redux/projectsSlice", () => ({
  selectAllProjects: (s: { projects: unknown[] }) => s.projects,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectScopeSelectionsContext: () => ({}),
  selectOrganizationId: (s: { appContext: { organization_id: string | null } }) =>
    s.appContext.organization_id,
}));

const projects = [
  { id: "p1", organization_id: "org-a", scope_tags: [] },
  { id: "p2", organization_id: "org-b", scope_tags: [] },
];

function state(headerOrg: string | null, filterOrgId: string | null) {
  return {
    projects,
    appContext: { organization_id: headerOrg },
    tasksUi: { ...taskUiReducer(undefined, { type: "init" }), filterOrgId },
  } as never;
}

describe("tasks organization filter", () => {
  it("defaults to All organizations", () => {
    expect(selectFilterOrgId(state(null, null))).toBeNull();
    expect(taskUiReducer(undefined, { type: "init" }).filterOrgId).toBeNull();
  });

  it("the header's selected organization does not narrow projects", () => {
    expect(selectValidProjectIds(state("org-a", null))).toBeNull();
  });

  it("the on-page filter narrows to the chosen organization", () => {
    const next = taskUiReducer(undefined, setFilterOrgId("org-b"));
    expect(next.filterOrgId).toBe("org-b");
    const valid = selectValidProjectIds(state(null, "org-b"));
    expect([...(valid ?? [])]).toEqual(["p2"]);
  });
});
