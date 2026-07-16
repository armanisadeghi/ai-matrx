import {
  applyDenseSelectionToRedux,
  clearWorkingContext,
  denseSelectionFromRedux,
} from "../applyDenseSelection";
import { EMPTY_SELECTION, type DenseSelection } from "../model";
import type { OrgNode } from "@/features/scopes/types";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";

function mockDispatch() {
  const actions: { type: string; payload: unknown }[] = [];
  const dispatch = (action: { type: string; payload?: unknown }) => {
    actions.push({ type: action.type, payload: action.payload });
    return action;
  };
  return { dispatch: dispatch as never, actions };
}

const orgs: OrgNode[] = [
  {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    is_personal: false,
    scope_types: [
      {
        id: "type-client",
        organization_id: "org-1",
        label_singular: "Client",
        label_plural: "Clients",
        icon: "building",
        color: "blue",
        max_assignments_per_entity: null,
        sort_order: 0,
        parent_type_id: null,
        default_variable_keys: [],
        scopes: [
          {
            id: "scope-rejuvina",
            scope_type_id: "type-client",
            organization_id: "org-1",
            name: "Rejuvina",
            description: "",
            parent_scope_id: null,
            settings: {},
          },
        ],
      },
    ],
  },
];

const projects: AssignableProject[] = [
  { id: "proj-1", name: "Launch", orgId: "org-1", isPersonal: false },
];
const tasks: AssignableTask[] = [
  {
    id: "task-1",
    title: "Ship it",
    projectId: "proj-1",
    orgId: "org-1",
    status: "incomplete",
  },
];

describe("denseSelectionFromRedux", () => {
  it("derives type ids from selected scopes for cascade-up display", () => {
    const sel = denseSelectionFromRedux({
      organizationId: "org-1",
      scopeSelections: { "scope-rejuvina": "scope-rejuvina" },
      activeScopeTypeIds: [],
      projectId: null,
      taskId: null,
      organizations: orgs,
    });
    expect(sel.orgIds).toEqual(["org-1"]);
    expect(sel.scopeIds).toEqual(["scope-rejuvina"]);
    expect(sel.scopeTypeIds).toContain("type-client");
  });
});

describe("applyDenseSelectionToRedux", () => {
  it("writes working context via setFullContext without touching conversation", () => {
    const { dispatch, actions } = mockDispatch();
    const sel: DenseSelection = {
      ...EMPTY_SELECTION,
      orgIds: ["org-1"],
      scopeIds: ["scope-rejuvina"],
      scopeTypeIds: ["type-client"],
      projectIds: ["proj-1"],
      taskIds: ["task-1"],
    };

    applyDenseSelectionToRedux(dispatch, sel, orgs, projects, tasks);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("appContext/setFullContext");
    const payload = actions[0].payload as Record<string, unknown>;
    expect(payload).toEqual({
      organization_id: "org-1",
      organization_name: "Acme",
      scope_selections: { "scope-rejuvina": "scope-rejuvina" },
      active_scope_type_ids: [],
      project_id: "proj-1",
      project_name: "Launch",
      task_id: "task-1",
      task_name: "Ship it",
    });
    expect(payload).not.toHaveProperty("conversation_id");
  });

  it("stores type-only selections in active_scope_type_ids", () => {
    const { dispatch, actions } = mockDispatch();
    const sel: DenseSelection = {
      ...EMPTY_SELECTION,
      orgIds: ["org-1"],
      scopeTypeIds: ["type-client"],
    };
    applyDenseSelectionToRedux(dispatch, sel, orgs, projects, tasks);
    const payload = actions[0].payload as { active_scope_type_ids: string[] };
    expect(payload.active_scope_type_ids).toEqual(["type-client"]);
  });
});

describe("clearWorkingContext", () => {
  it("nulls working fields without conversation_id", () => {
    const { dispatch, actions } = mockDispatch();
    clearWorkingContext(dispatch);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("appContext/setFullContext");
    const payload = actions[0].payload as Record<string, unknown>;
    expect(payload.organization_id).toBeNull();
    expect(payload.scope_selections).toEqual({});
    expect(payload).not.toHaveProperty("conversation_id");
  });
});
