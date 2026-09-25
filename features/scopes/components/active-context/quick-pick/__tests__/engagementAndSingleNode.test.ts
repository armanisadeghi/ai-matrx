/**
 * The two modes lane HIERARCHY-CASCADE added to the canonical engine:
 *   (a) engagement rungs — organization → project → task, scopes as tags —
 *       the selection the bespoke HierarchyCascade used to hold;
 *   (b) single node, any rung — exactly one organization OR project OR task
 *       OR scope, the binding target the bespoke ShortcutScopePicker chose.
 * The use case is a law firm's workspace: Castellano & Reyes, LLP runs the
 * "Meridian renewal" project with its tasks, and tags work by Client scope.
 * Pure functions (plus one renderless hook read through a tiny harness).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ALL_ENGAGEMENT_RUNGS,
  EMPTY_ENGAGEMENT_SELECTION,
  applyEngagementPick,
  applySingleNodePick,
  engagementNodes,
  fillEngagementSelection,
  orgNodeOf,
  projectNodeOf,
  resolvePickNode,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useEngagementEngine,
  useSingleNodeEngine,
  type EngagementSelection,
  type PickNode,
  type SelectionEngine,
} from "../engine";
import type { OrgNode } from "@/features/scopes/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const orgs = [
  { id: "org-castellano", name: "Castellano & Reyes, LLP", slug: "castellano-reyes", is_personal: false, scope_types: [clients] },
  { id: "org-ironclad-a", name: "Ironclad Mobile Mechanic", slug: "ironclad-mobile-mechanic", is_personal: false, scope_types: [] },
  { id: "org-ironclad-b", name: "Ironclad Mobile Mechanic", slug: "ironclad-mobile-mechanic-9ffd844b", is_personal: false, scope_types: [] },
] as unknown as OrgNode[];

const projects = [
  { id: "proj-renewal", name: "Meridian renewal", orgId: "org-castellano", isPersonal: false },
  { id: "proj-fleet", name: "Fleet service contracts", orgId: "org-ironclad-a", isPersonal: false },
];
const tasks = [
  { id: "task-draft", title: "Draft the renewal letter", projectId: "proj-renewal", orgId: "org-castellano", status: "incomplete" },
  { id: "task-intake", title: "Intake call notes", projectId: null, orgId: "org-castellano", status: "incomplete" },
];
const u = { orgs, projects, tasks };
const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? "Unassigned";

const castellano = orgNodeOf(orgs[0]!, orgs);
const renewal = projectNodeOf(projects[0]!, orgName);
const draftTask = taskNodeOf(tasks[0]!, orgName);
const intakeTask = taskNodeOf(tasks[1]!, orgName);
const meridian = scopeNodeOf(orgs[0]!, clients as never, clients.scopes[0]!);
const harbor = scopeNodeOf(orgs[0]!, clients as never, clients.scopes[1]!);

describe("engagement rungs: organization → project → task, scopes as tags", () => {
  it("an organization pick holds it by name and clears everything under it", () => {
    const held: EngagementSelection = {
      ...EMPTY_ENGAGEMENT_SELECTION,
      organizationId: "org-ironclad-a",
      projectId: "proj-fleet",
      projectName: "Fleet service contracts",
      scopeIds: ["scope-x"],
    };
    expect(applyEngagementPick(held, castellano, u)).toEqual({
      ...EMPTY_ENGAGEMENT_SELECTION,
      organizationId: "org-castellano",
      organizationName: "Castellano & Reyes, LLP",
    });
    // The same organization again clears the whole selection.
    expect(applyEngagementPick({ ...EMPTY_ENGAGEMENT_SELECTION, organizationId: "org-castellano" }, castellano, u)).toEqual(EMPTY_ENGAGEMENT_SELECTION);
  });

  it("a project pick fills its organization and clears the task; again clears the project", () => {
    const withProject = applyEngagementPick(EMPTY_ENGAGEMENT_SELECTION, renewal, u);
    expect(withProject).toMatchObject({
      organizationId: "org-castellano",
      organizationName: "Castellano & Reyes, LLP",
      projectId: "proj-renewal",
      projectName: "Meridian renewal",
      taskId: null,
    });
    const withTask = applyEngagementPick(withProject, draftTask, u);
    expect(applyEngagementPick(withTask, renewal, u)).toMatchObject({ projectId: null, taskId: null, organizationId: "org-castellano" });
  });

  it("a task pick fills its project and organization; a task with no project keeps none", () => {
    expect(applyEngagementPick(EMPTY_ENGAGEMENT_SELECTION, draftTask, u)).toMatchObject({
      organizationId: "org-castellano",
      projectId: "proj-renewal",
      projectName: "Meridian renewal",
      taskId: "task-draft",
      taskName: "Draft the renewal letter",
    });
    expect(applyEngagementPick(EMPTY_ENGAGEMENT_SELECTION, intakeTask, u)).toMatchObject({
      organizationId: "org-castellano",
      projectId: null,
      taskId: "task-intake",
    });
  });

  it("a scope is a tag: toggles on and off, any number, and never clears the project or task", () => {
    const start = applyEngagementPick(EMPTY_ENGAGEMENT_SELECTION, draftTask, u);
    const one = applyEngagementPick(start, meridian, u);
    const two = applyEngagementPick(one, harbor, u);
    expect(two.scopeIds).toEqual(["scope-meridian", "scope-harbor"]);
    expect(two).toMatchObject({ projectId: "proj-renewal", taskId: "task-draft" });
    expect(applyEngagementPick(two, meridian, u).scopeIds).toEqual(["scope-harbor"]);
  });

  it("switching organization through a project of another org drops the tags of the old one", () => {
    const tagged = applyEngagementPick(applyEngagementPick(EMPTY_ENGAGEMENT_SELECTION, castellano, u), meridian, u);
    const fleet = projectNodeOf(projects[1]!, orgName);
    expect(applyEngagementPick(tagged, fleet, u)).toMatchObject({ organizationId: "org-ironclad-a", scopeIds: [] });
  });

  it("scope types and context items are not engagement picks", () => {
    const type = typeNodeOf(orgs[0]!, clients as never);
    expect(applyEngagementPick(EMPTY_ENGAGEMENT_SELECTION, type, u)).toBe(EMPTY_ENGAGEMENT_SELECTION);
  });

  it("the held selection resolves to nodes in rung order, keeping a name the universe does not know", () => {
    const sel: EngagementSelection = {
      organizationId: "org-castellano",
      organizationName: "Castellano & Reyes, LLP",
      projectId: "proj-archived",
      projectName: "Closed matter (archived)",
      taskId: "task-draft",
      taskName: "Draft the renewal letter",
      scopeIds: ["scope-harbor"],
    };
    expect(engagementNodes(u, sel).map((n) => [n.kind, n.label])).toEqual([
      ["org", "Castellano & Reyes, LLP"],
      ["project", "Closed matter (archived)"],
      ["task", "Draft the renewal letter"],
      ["scope", "Harbor View Medical Group"],
    ]);
  });
});

describe("a held selection fills the rungs it implies", () => {
  it("a host holding only a task shows it under its project and organization, with names", () => {
    expect(fillEngagementSelection(u, { ...EMPTY_ENGAGEMENT_SELECTION, taskId: "task-draft" })).toEqual({
      organizationId: "org-castellano",
      organizationName: "Castellano & Reyes, LLP",
      projectId: "proj-renewal",
      projectName: "Meridian renewal",
      taskId: "task-draft",
      taskName: "Draft the renewal letter",
      scopeIds: [],
    });
  });

  it("a host holding only a project gets its organization; an unknown project stays as held", () => {
    expect(fillEngagementSelection(u, { ...EMPTY_ENGAGEMENT_SELECTION, projectId: "proj-fleet" })).toMatchObject({ organizationId: "org-ironclad-a" });
    const unknown = { ...EMPTY_ENGAGEMENT_SELECTION, projectId: "proj-gone" };
    expect(fillEngagementSelection(u, unknown)).toBe(unknown);
  });
});

describe("the same organization name, told apart (UI-FIX-19)", () => {
  it("an org node carries the address only when another org in its list shares the name", () => {
    expect(orgNodeOf(orgs[1]!, orgs).hint).toBe("ironclad-mobile-mechanic");
    expect(orgNodeOf(orgs[2]!, orgs).hint).toBe("ironclad-mobile-mechanic-9ffd844b");
    expect(orgNodeOf(orgs[0]!, orgs).hint).toBeUndefined();
  });
});

describe("single node, any rung", () => {
  const kinds = ["org", "project", "task"] as const;

  it("a selectable node becomes THE node, replacing any other kind", () => {
    expect(applySingleNodePick(null, castellano, kinds)).toEqual({ kind: "org", id: "org-castellano" });
    expect(applySingleNodePick({ kind: "org", id: "org-castellano" }, draftTask, kinds)).toEqual({ kind: "task", id: "task-draft" });
  });

  it("picking the held node again clears it; a kind the host does not accept changes nothing", () => {
    expect(applySingleNodePick({ kind: "project", id: "proj-renewal" }, renewal, kinds)).toBeNull();
    const held = { kind: "project" as const, id: "proj-renewal" };
    expect(applySingleNodePick(held, meridian, kinds)).toBe(held);
  });

  it("resolves any kind against the universe", () => {
    expect(resolvePickNode(u, "scope", "scope-meridian")?.label).toBe("Meridian Risk Services");
    expect(resolvePickNode(u, "task", "task-intake")?.label).toBe("Intake call notes");
    expect(resolvePickNode(u, "org", "org-nowhere")).toBeNull();
  });
});

describe("the engines are controlled SelectionEngines", () => {
  function read<T>(hook: () => T): T {
    let out: T | undefined;
    function Probe() {
      out = hook();
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    act(() => root.unmount());
    return out as T;
  }

  it("engagement engine: isOn per rung, a pick on an unoffered rung is ignored", () => {
    const onChange = jest.fn();
    const value: EngagementSelection = { ...EMPTY_ENGAGEMENT_SELECTION, organizationId: "org-castellano", scopeIds: ["scope-meridian"] };
    const engine: SelectionEngine = read(() =>
      useEngagementEngine({ universe: u, value, onChange, rungs: ["organization", "task"] }),
    );
    expect(engine.isOn("org", "org-castellano")).toBe(true);
    expect(engine.isOn("scope", "scope-meridian")).toBe(true);
    expect(engine.count).toBe(2);
    engine.toggle(renewal); // project rung not offered
    expect(onChange).not.toHaveBeenCalled();
    engine.toggle(draftTask);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-draft" }));
    expect(ALL_ENGAGEMENT_RUNGS).toEqual(["organization", "scope", "project", "task"]);
  });

  it("single-node engine hands the host the typed node, or null when cleared", () => {
    const onChange = jest.fn<void, [PickNode | null]>();
    const engine: SelectionEngine = read(() =>
      useSingleNodeEngine({ universe: u, value: { kind: "task", id: "task-draft" }, onChange, selectableKinds: ["org", "project", "task"] }),
    );
    expect(engine.single).toBe(true);
    expect(engine.nodes.map((n) => n.label)).toEqual(["Draft the renewal letter"]);
    engine.toggle(renewal);
    expect(onChange).toHaveBeenLastCalledWith(renewal);
    engine.toggle(draftTask);
    expect(onChange).toHaveBeenLastCalledWith(null);
    engine.toggle(meridian); // not selectable
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
