/**
 * The engagement hosts that replaced the bespoke HierarchyCascade (lane
 * HIERARCHY-CASCADE). Real: EngagementPicker, EntityEngagementPicker, Miller
 * Columns in `rungs="engagements"`, the engine. Mocked: the universe loader
 * (fixture data), the project/task create hooks, the scope-create thunk and
 * the per-entity scope tag hook — the canonical write paths, asserted as the
 * calls each pick must make.
 *
 * Use case: Castellano & Reyes, LLP files its "Meridian renewal" project and
 * the "Draft the renewal letter" task, tagged by Client.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OrgNode } from "@/features/scopes/types";

const clients = {
  id: "type-clients",
  organization_id: "org-castellano",
  label_singular: "Client",
  label_plural: "Clients",
  icon: "briefcase",
  color: "blue",
  max_assignments_per_entity: null,
  sort_order: 1,
  parent_type_id: null,
  default_variable_keys: [],
  scopes: [
    { id: "scope-meridian", scope_type_id: "type-clients", organization_id: "org-castellano", name: "Meridian Risk Services", description: "", parent_scope_id: null, settings: {} },
    { id: "scope-harbor", scope_type_id: "type-clients", organization_id: "org-castellano", name: "Harbor View Medical Group", description: "", parent_scope_id: null, settings: {} },
  ],
};
const fixture = {
  orgs: [
    { id: "org-castellano", name: "Castellano & Reyes, LLP", slug: "castellano-reyes", is_personal: false, scope_types: [clients] },
    { id: "org-titanium", name: "Titanium Success", slug: "titanium", is_personal: false, scope_types: [] },
  ] as unknown as OrgNode[],
  projects: [
    { id: "proj-renewal", name: "Meridian renewal", orgId: "org-castellano", isPersonal: false },
    { id: "proj-seo", name: "Spring SEO push", orgId: "org-titanium", isPersonal: false },
  ],
  tasks: [
    { id: "task-draft", title: "Draft the renewal letter", projectId: "proj-renewal", orgId: "org-castellano", status: "incomplete" },
  ],
  treeStatus: "ready" as const,
  treeError: null,
  retryTree: () => undefined,
  engagementStatus: "ready" as const,
  engagementError: null,
  retryEngagement: jest.fn(),
};

jest.mock("@/features/scopes/components/active-context/quick-pick/engine", () => ({
  ...jest.requireActual("@/features/scopes/components/active-context/quick-pick/engine"),
  useUniverse: () => fixture,
}));
jest.mock("@/features/scopes/components/context-assignment/data", () => ({
  fetchTypeItems: jest.fn(async () => []),
  fetchAssignableProjects: jest.fn(async () => []),
  fetchAssignableTasks: jest.fn(async () => []),
  fetchProjectTasks: jest.fn(async () => []),
  invalidateAssignableData: jest.fn(),
}));
const createProject = jest.fn();
const createTask = jest.fn();
jest.mock("@/features/agent-context/hooks/useHierarchy", () => ({
  useCreateProject: () => ({ mutateAsync: createProject, isPending: false }),
  useCreateTask: () => ({ mutateAsync: createTask, isPending: false }),
}));
const dispatch = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => undefined,
}));
jest.mock("@/features/scopes/redux/thunks/scopeTreeMutations", () => ({
  createScope: (params: unknown) => ({ type: "test/createScope", params }),
}));
const setScopes = jest.fn(async (_ids: string[]) => ({ ok: true }));
let heldScopeIds: string[] = [];
jest.mock("@/features/scopes/hooks/useEntityScopes", () => ({
  useEntityScopes: () => ({ scopeIds: heldScopeIds, setScopes }),
}));

import { EngagementPicker } from "../EngagementPicker";
import { EntityEngagementPicker } from "../EntityEngagementPicker";
import {
  EMPTY_ENGAGEMENT_SELECTION,
  type EngagementSelection,
} from "../../quick-pick/engine";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  heldScopeIds = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = () => [...host.querySelectorAll("button[aria-pressed]")] as HTMLButtonElement[];
const row = (label: string) => {
  const found = rows().find((b) => b.textContent?.startsWith(label));
  if (!found) throw new Error(`no row "${label}" in ${rows().map((b) => b.textContent).join(" | ")}`);
  return found;
};
const click = async (el: Element) => act(async () => (el as HTMLElement).click());

describe("EngagementPicker (inline) is Miller Columns in engagement rungs", () => {
  const changes: EngagementSelection[] = [];
  function Harness({ rungs }: { rungs?: React.ComponentProps<typeof EngagementPicker>["rungs"] }) {
    const [value, setValue] = useState<EngagementSelection>(EMPTY_ENGAGEMENT_SELECTION);
    return (
      <EngagementPicker
        presentation="inline"
        rungs={rungs}
        value={value}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    );
  }
  beforeEach(() => {
    changes.length = 0;
  });

  it("walks organization → project → task and tags scopes without clearing them", async () => {
    await act(async () => root.render(<Harness />));
    expect(host.querySelector('[data-miller-rungs="engagements"]')).not.toBeNull();
    expect(host.querySelector('[data-miller-row="scope-tags"]')).not.toBeNull();

    await click(row("Castellano & Reyes, LLP"));
    expect(changes.at(-1)).toMatchObject({ organizationId: "org-castellano", organizationName: "Castellano & Reyes, LLP" });
    // The Projects column lists only this organization's projects.
    expect(rows().map((b) => b.textContent)).not.toContain("Spring SEO push");

    await click(row("Meridian renewal"));
    await click(row("Draft the renewal letter"));
    await click(row("Meridian Risk Services"));
    expect(changes.at(-1)).toEqual({
      organizationId: "org-castellano",
      organizationName: "Castellano & Reyes, LLP",
      projectId: "proj-renewal",
      projectName: "Meridian renewal",
      taskId: "task-draft",
      taskName: "Draft the renewal letter",
      scopeIds: ["scope-meridian"],
    });
    // The footer is host-owned: no commit button, no live badge.
    expect(host.textContent).not.toMatch(/Live ·|Assign \(/);
  });

  it("offers only the rungs the host names (no tags row, no tasks column)", async () => {
    await act(async () => root.render(<Harness rungs={["organization", "project"]} />));
    expect(host.querySelector('[data-miller-row="scope-tags"]')).toBeNull();
    expect(host.textContent).not.toContain("Pick a project to see its tasks.");
  });

  it("creates a project in place through useCreateProject and selects it", async () => {
    createProject.mockResolvedValueOnce({ id: "proj-new", name: "Harbor View intake", organization_id: "org-castellano" });
    await act(async () => root.render(<Harness />));
    await click(row("Castellano & Reyes, LLP"));
    await click(host.querySelector('button[aria-label="New project in Castellano & Reyes, LLP"]')!);
    const input = host.querySelector('input[placeholder="New project in Castellano & Reyes, LLP"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "Harbor View intake");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(createProject).toHaveBeenCalledWith({ name: "Harbor View intake", organization_id: "org-castellano" });
    expect(changes.at(-1)).toMatchObject({ projectId: "proj-new", projectName: "Harbor View intake" });
  });
});

describe("EntityEngagementPicker persists each dimension on its own channel", () => {
  const onOrganizationChange = jest.fn();
  const onProjectChange = jest.fn();
  const onTaskChange = jest.fn();
  function render(props: Partial<React.ComponentProps<typeof EntityEngagementPicker>> = {}) {
    return act(async () =>
      root.render(
        <EntityEngagementPicker
          presentation="inline"
          entityType="app"
          entityId="app-renewal-assistant"
          organizationId="org-castellano"
          projectId={null}
          taskId={null}
          onOrganizationChange={onOrganizationChange}
          onProjectChange={onProjectChange}
          onTaskChange={onTaskChange}
          {...props}
        />,
      ),
    );
  }

  it("a project pick writes the project FK only", async () => {
    await render();
    await click(row("Meridian renewal"));
    expect(onProjectChange).toHaveBeenCalledWith("proj-renewal");
    expect(onOrganizationChange).not.toHaveBeenCalled();
    expect(setScopes).not.toHaveBeenCalled();
  });

  it("a scope tag writes through useEntityScopes and never trims the project or task", async () => {
    heldScopeIds = ["scope-harbor"];
    await render({ projectId: "proj-renewal", taskId: "task-draft" });
    await click(row("Meridian Risk Services"));
    expect(setScopes).toHaveBeenCalledWith(["scope-harbor", "scope-meridian"]);
    expect(onProjectChange).not.toHaveBeenCalled();
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  it("a task pick writes the task FK", async () => {
    await render({ projectId: "proj-renewal" });
    await click(row("Draft the renewal letter"));
    expect(onTaskChange).toHaveBeenCalledWith("task-draft");
  });
});
