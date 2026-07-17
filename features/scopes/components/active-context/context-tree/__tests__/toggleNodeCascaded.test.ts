import {
  EMPTY_SELECTION,
  buildAncestryMap,
  toggleNodeCascaded,
  type DenseSelection,
} from "../model";
import type { OrgNode } from "@/features/scopes/types";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";

const orgs: OrgNode[] = [
  {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    is_personal: false,
    role: "member",
    projects: [],
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
            id: "scope-a",
            scope_type_id: "type-client",
            organization_id: "org-1",
            name: "Client A",
            description: "",
            parent_scope_id: null,
            settings: {},
          },
          {
            id: "scope-b",
            scope_type_id: "type-client",
            organization_id: "org-1",
            name: "Client B",
            description: "",
            parent_scope_id: null,
            settings: {},
          },
        ],
      },
    ],
  },
  {
    id: "org-2",
    name: "Other",
    slug: "other",
    is_personal: false,
    role: "member",
    projects: [],
    scope_types: [
      {
        id: "type-matter",
        organization_id: "org-2",
        label_singular: "Matter",
        label_plural: "Matters",
        icon: "folder",
        color: "amber",
        max_assignments_per_entity: null,
        sort_order: 0,
        parent_type_id: null,
        default_variable_keys: [],
        scopes: [
          {
            id: "scope-other",
            scope_type_id: "type-matter",
            organization_id: "org-2",
            name: "Matter X",
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
  { id: "proj-2", name: "Other Proj", orgId: "org-2", isPersonal: false },
];
const tasks: AssignableTask[] = [
  {
    id: "task-1",
    title: "Ship",
    projectId: "proj-1",
    orgId: "org-1",
    status: "incomplete",
  },
];

const ancestry = buildAncestryMap(orgs, projects, tasks);

describe("toggleNodeCascaded — ADD IS ADDITIVE", () => {
  it("selecting a project never removes existing scopes", () => {
    const start: DenseSelection = {
      ...EMPTY_SELECTION,
      orgIds: ["org-1"],
      scopeTypeIds: ["type-client"],
      scopeIds: ["scope-a", "scope-b"],
    };

    const next = toggleNodeCascaded(
      start,
      "project",
      "proj-1",
      "multi",
      ancestry,
    );

    expect(next.scopeIds).toEqual(["scope-a", "scope-b"]);
    expect(next.scopeTypeIds).toContain("type-client");
    expect(next.projectIds).toEqual(["proj-1"]);
    expect(next.orgIds).toEqual(["org-1"]);
  });

  it("selecting a project from another org still keeps prior scopes", () => {
    const start: DenseSelection = {
      ...EMPTY_SELECTION,
      orgIds: ["org-1"],
      scopeIds: ["scope-a", "scope-b"],
      scopeTypeIds: ["type-client"],
    };

    const next = toggleNodeCascaded(
      start,
      "project",
      "proj-2",
      "multi",
      ancestry,
    );

    // Org pin moves to the project's org — scopes are NEVER stripped.
    expect(next.scopeIds).toEqual(["scope-a", "scope-b"]);
    expect(next.projectIds).toEqual(["proj-2"]);
    expect(next.orgIds).toEqual(["org-2"]);
  });

  it("selecting a second scope accumulates (does not replace)", () => {
    const start: DenseSelection = {
      ...EMPTY_SELECTION,
      scopeIds: ["scope-a"],
      scopeTypeIds: ["type-client"],
      orgIds: ["org-1"],
    };

    const next = toggleNodeCascaded(
      start,
      "scope",
      "scope-b",
      "multi",
      ancestry,
    );

    expect(next.scopeIds).toEqual(["scope-a", "scope-b"]);
  });

  it("selecting a task keeps scopes and project", () => {
    const start: DenseSelection = {
      ...EMPTY_SELECTION,
      orgIds: ["org-1"],
      scopeIds: ["scope-a"],
      projectIds: ["proj-1"],
    };

    const next = toggleNodeCascaded(start, "task", "task-1", "multi", ancestry);

    expect(next.scopeIds).toEqual(["scope-a"]);
    expect(next.projectIds).toEqual(["proj-1"]);
    expect(next.taskIds).toEqual(["task-1"]);
  });

  it("unchecking org removes only the org — scopes stay", () => {
    const start: DenseSelection = {
      ...EMPTY_SELECTION,
      orgIds: ["org-1"],
      scopeIds: ["scope-a"],
      projectIds: ["proj-1"],
    };

    const next = toggleNodeCascaded(start, "org", "org-1", "multi", ancestry);

    expect(next.orgIds).toEqual([]);
    expect(next.scopeIds).toEqual(["scope-a"]);
    expect(next.projectIds).toEqual(["proj-1"]);
  });
});
