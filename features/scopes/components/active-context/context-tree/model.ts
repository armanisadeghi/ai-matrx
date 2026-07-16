// features/scopes/components/active-context/context-tree/model.ts
//
// Pure selection engine for the dense ContextTree (Surface A). No fetching —
// the tree comes from Redux (useScopeTree); projects/tasks/items come through
// the official cached layer (context-assignment/data.ts).
//
// Selection model — the full four-level chain plus the two bottom systems:
//   org → scope type → scope → context item   +   projects, tasks
//
// ADD IS ADDITIVE (load-bearing, 2026-07-16): selecting a node NEVER removes
// any other dimension. Cascade-up only ADDS ancestors (type/org). Project/task
// are exclusive within their own kind (replacing the previous project does not
// touch scopes). Explicit uncheck is the only remove path.
//
// Cascade-up (required): selecting a child ALWAYS selects its ancestors.
// You cannot have a scope selected without its scope type and org.

import type {
  OrgNode,
  ScopeTypeNode,
  ScopeNode,
  ContextItemRow,
} from "@/features/scopes/types";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";

export type DenseNodeKind =
  "org" | "type" | "scope" | "item" | "project" | "task";

/** Item selections are per-CELL (scope × item), encoded as one token. */
export const itemRef = (scopeId: string, itemId: string) =>
  `${scopeId}::${itemId}`;

export interface DenseSelection {
  orgIds: string[];
  scopeTypeIds: string[];
  scopeIds: string[];
  /** `${scopeId}::${itemId}` tokens. */
  itemRefs: string[];
  projectIds: string[];
  taskIds: string[];
}

export const EMPTY_SELECTION: DenseSelection = {
  orgIds: [],
  scopeTypeIds: [],
  scopeIds: [],
  itemRefs: [],
  projectIds: [],
  taskIds: [],
};

export type SelectMode = "multi" | "single";

export function selectionCount(sel: DenseSelection): number {
  return (
    sel.orgIds.length +
    sel.scopeTypeIds.length +
    sel.scopeIds.length +
    sel.itemRefs.length +
    sel.projectIds.length +
    sel.taskIds.length
  );
}

export function isEmptySelection(sel: DenseSelection): boolean {
  return selectionCount(sel) === 0;
}

function keyOf(kind: DenseNodeKind): keyof DenseSelection {
  switch (kind) {
    case "org":
      return "orgIds";
    case "type":
      return "scopeTypeIds";
    case "scope":
      return "scopeIds";
    case "item":
      return "itemRefs";
    case "project":
      return "projectIds";
    case "task":
      return "taskIds";
  }
}

export function isSelected(
  sel: DenseSelection,
  kind: DenseNodeKind,
  id: string,
): boolean {
  return sel[keyOf(kind)].includes(id);
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Ancestor lookup built once per tree render from live org/project/task data. */
export interface AncestryMap {
  scope: Map<string, { orgId: string; typeId: string }>;
  type: Map<string, { orgId: string }>;
  /** Scopes belonging to a type (for cascade-down on type deselect). */
  scopesByType: Map<string, string[]>;
  /** Types / scopes belonging to an org (for cascade-down on org deselect). */
  typesByOrg: Map<string, string[]>;
  scopesByOrg: Map<string, string[]>;
  projectOrg: Map<string, string | null>;
  taskOrg: Map<string, string | null>;
}

export function buildAncestryMap(
  orgs: OrgNode[],
  projects: AssignableProject[],
  tasks: AssignableTask[],
): AncestryMap {
  const scope = new Map<string, { orgId: string; typeId: string }>();
  const type = new Map<string, { orgId: string }>();
  const scopesByType = new Map<string, string[]>();
  const typesByOrg = new Map<string, string[]>();
  const scopesByOrg = new Map<string, string[]>();
  for (const o of orgs) {
    const typeIds: string[] = [];
    const scopeIds: string[] = [];
    for (const t of o.scope_types) {
      type.set(t.id, { orgId: o.id });
      typeIds.push(t.id);
      const sids = t.scopes.map((s) => s.id);
      scopesByType.set(t.id, sids);
      for (const s of t.scopes) {
        scope.set(s.id, { orgId: o.id, typeId: t.id });
        scopeIds.push(s.id);
      }
    }
    typesByOrg.set(o.id, typeIds);
    scopesByOrg.set(o.id, scopeIds);
  }
  return {
    scope,
    type,
    scopesByType,
    typesByOrg,
    scopesByOrg,
    projectOrg: new Map(projects.map((p) => [p.id, p.orgId])),
    taskOrg: new Map(tasks.map((t) => [t.id, t.orgId])),
  };
}

function ensureAncestors(
  sel: DenseSelection,
  kind: DenseNodeKind,
  id: string,
  ancestry: AncestryMap,
): DenseSelection {
  const next: DenseSelection = {
    ...sel,
    orgIds: [...sel.orgIds],
    scopeTypeIds: [...sel.scopeTypeIds],
    scopeIds: [...sel.scopeIds],
    itemRefs: [...sel.itemRefs],
    projectIds: [...sel.projectIds],
    taskIds: [...sel.taskIds],
  };

  if (kind === "item") {
    const scopeId = id.split("::")[0];
    const a = ancestry.scope.get(scopeId);
    if (a) {
      next.scopeIds = uniq([...next.scopeIds, scopeId]);
      next.scopeTypeIds = uniq([...next.scopeTypeIds, a.typeId]);
      next.orgIds = uniq([...next.orgIds, a.orgId]);
    }
  } else if (kind === "scope") {
    const a = ancestry.scope.get(id);
    if (a) {
      next.scopeTypeIds = uniq([...next.scopeTypeIds, a.typeId]);
      next.orgIds = uniq([...next.orgIds, a.orgId]);
    }
  } else if (kind === "type") {
    const a = ancestry.type.get(id);
    if (a) next.orgIds = uniq([...next.orgIds, a.orgId]);
  } else if (kind === "project") {
    const orgId = ancestry.projectOrg.get(id);
    if (orgId) next.orgIds = uniq([...next.orgIds, orgId]);
  } else if (kind === "task") {
    const orgId = ancestry.taskOrg.get(id);
    if (orgId) next.orgIds = uniq([...next.orgIds, orgId]);
  } else if (kind === "org") {
    next.orgIds = uniq([...next.orgIds, id]);
  }

  return next;
}

/** Pin the singular org slot without touching any other dimension. */
function pinOrg(sel: DenseSelection, orgId: string | null): DenseSelection {
  if (!orgId) return sel;
  return { ...sel, orgIds: [orgId] };
}

function preferredOrgFor(
  kind: DenseNodeKind,
  id: string,
  ancestry: AncestryMap,
): string | null {
  if (kind === "org") return id;
  if (kind === "item") {
    return ancestry.scope.get(id.split("::")[0])?.orgId ?? null;
  }
  if (kind === "scope") return ancestry.scope.get(id)?.orgId ?? null;
  if (kind === "type") return ancestry.type.get(id)?.orgId ?? null;
  if (kind === "project") return ancestry.projectOrg.get(id) ?? null;
  if (kind === "task") return ancestry.taskOrg.get(id) ?? null;
  return null;
}

/**
 * Explicit uncheck only. Cascade-down removes CHILDREN of the unchecked node
 * (type → its scopes/items, scope → its items). Never wipes unrelated
 * dimensions — unchecking org does NOT clear scopes/projects/tasks.
 */
function deselectCascaded(
  sel: DenseSelection,
  kind: DenseNodeKind,
  id: string,
  ancestry: AncestryMap,
): DenseSelection {
  if (kind === "org") {
    return { ...sel, orgIds: sel.orgIds.filter((x) => x !== id) };
  }
  if (kind === "type") {
    const scopeIds = new Set(ancestry.scopesByType.get(id) ?? []);
    return {
      ...sel,
      scopeTypeIds: sel.scopeTypeIds.filter((x) => x !== id),
      scopeIds: sel.scopeIds.filter((x) => !scopeIds.has(x)),
      itemRefs: sel.itemRefs.filter((ref) => !scopeIds.has(ref.split("::")[0])),
    };
  }
  if (kind === "scope") {
    return {
      ...sel,
      scopeIds: sel.scopeIds.filter((x) => x !== id),
      itemRefs: sel.itemRefs.filter((ref) => ref.split("::")[0] !== id),
    };
  }
  const key = keyOf(kind);
  return { ...sel, [key]: sel[key].filter((x) => x !== id) };
}

/**
 * Toggle a node. ADD IS ADDITIVE — selecting never strips other dimensions.
 * Cascade-up only ADDS ancestors. Project/task replace within their own kind.
 * Prefer this over bare `toggleNode` everywhere the tree is shown.
 */
export function toggleNodeCascaded(
  sel: DenseSelection,
  kind: DenseNodeKind,
  id: string,
  mode: SelectMode,
  ancestry: AncestryMap,
): DenseSelection {
  const key = keyOf(kind);
  const has = sel[key].includes(id);

  if (mode === "single") {
    if (has) return EMPTY_SELECTION;
    // Single-select mode replaces the WHOLE selection (host asked for one
    // pick) — that is not the multi Surface-A path.
    let next: DenseSelection = { ...EMPTY_SELECTION, [key]: [id] };
    next = ensureAncestors(next, kind, id, ancestry);
    return pinOrg(next, preferredOrgFor(kind, id, ancestry));
  }

  if (has) return deselectCascaded(sel, kind, id, ancestry);

  // ── SELECT (additive) ────────────────────────────────────────────────
  // Keep every existing pick. Only the toggled kind changes (project/task
  // are singular within their kind; scopes/types/items accumulate).
  let next: DenseSelection = {
    ...sel,
    orgIds: [...sel.orgIds],
    scopeTypeIds: [...sel.scopeTypeIds],
    scopeIds: [...sel.scopeIds],
    itemRefs: [...sel.itemRefs],
    projectIds: [...sel.projectIds],
    taskIds: [...sel.taskIds],
    [key]:
      kind === "project" || kind === "task" || kind === "org"
        ? [id]
        : uniq([...sel[key], id]),
  };
  next = ensureAncestors(next, kind, id, ancestry);
  // Pin org when the pick implies one — NEVER filter scopes/projects/tasks.
  return pinOrg(next, preferredOrgFor(kind, id, ancestry));
}

/** @deprecated Prefer `toggleNodeCascaded` — bare toggle violates ancestor invariants. */
export function toggleNode(
  sel: DenseSelection,
  kind: DenseNodeKind,
  id: string,
  mode: SelectMode,
  ancestry?: AncestryMap,
): DenseSelection {
  if (ancestry) return toggleNodeCascaded(sel, kind, id, mode, ancestry);
  const key = keyOf(kind);
  const has = sel[key].includes(id);
  if (mode === "single") {
    if (has) return EMPTY_SELECTION;
    return { ...EMPTY_SELECTION, [key]: [id] };
  }
  return {
    ...sel,
    [key]: has ? sel[key].filter((x) => x !== id) : [...sel[key], id],
  };
}

/* ── flat row model (quick-pick / ledger) ─────────────────────────────── */

export interface FlatNode {
  kind: DenseNodeKind;
  id: string;
  label: string;
  /** Breadcrumb labels above this node (org → type → scope). */
  path: string[];
  depth: number;
  org?: OrgNode;
  type?: ScopeTypeNode;
  scope?: ScopeNode;
  item?: ContextItemRow;
  project?: AssignableProject;
  task?: AssignableTask;
  /** Lowercased haystack for filtering. */
  search: string;
}

export function flattenTree(orgs: OrgNode[]): FlatNode[] {
  const rows: FlatNode[] = [];
  for (const org of orgs) {
    rows.push({
      kind: "org",
      id: org.id,
      label: org.name,
      path: [],
      depth: 0,
      org,
      search: org.name.toLowerCase(),
    });
    for (const type of org.scope_types) {
      rows.push({
        kind: "type",
        id: type.id,
        label: type.label_plural,
        path: [org.name],
        depth: 1,
        org,
        type,
        search:
          `${org.name} ${type.label_plural} ${type.label_singular}`.toLowerCase(),
      });
      for (const scope of type.scopes) {
        rows.push({
          kind: "scope",
          id: scope.id,
          label: scope.name,
          path: [org.name, type.label_plural],
          depth: 2,
          org,
          type,
          scope,
          search:
            `${org.name} ${type.label_plural} ${type.label_singular} ${scope.name}`.toLowerCase(),
        });
      }
    }
  }
  return rows;
}

export function projectNode(
  p: AssignableProject,
  orgName: string | null,
): FlatNode {
  return {
    kind: "project",
    id: p.id,
    label: p.name,
    path: [orgName ?? "Unassigned"],
    depth: 1,
    project: p,
    search: `project ${orgName ?? "unassigned"} ${p.name}`.toLowerCase(),
  };
}

export function taskNode(t: AssignableTask): FlatNode {
  return {
    kind: "task",
    id: t.id,
    label: t.title,
    path: [t.status ?? "task"],
    depth: 1,
    task: t,
    search: `task ${t.title} ${t.status ?? ""}`.toLowerCase(),
  };
}

/* ── selection resolution (for ledgers / chips / summaries) ───────────── */

export interface ResolvedSelection {
  orgs: { id: string; label: string }[];
  types: { id: string; label: string; orgName: string; type: ScopeTypeNode }[];
  scopes: {
    id: string;
    label: string;
    typeLabel: string;
    orgName: string;
    type: ScopeTypeNode;
  }[];
  items: {
    ref: string;
    label: string;
    scopeName: string;
    typeLabel: string;
    type?: ScopeTypeNode;
  }[];
  projects: { id: string; label: string }[];
  tasks: { id: string; label: string }[];
}

export function resolveSelection(
  sel: DenseSelection,
  orgs: OrgNode[],
  projects: AssignableProject[],
  tasks: AssignableTask[],
  itemsByType: Record<string, ContextItemRow[]>,
): ResolvedSelection {
  const out: ResolvedSelection = {
    orgs: [],
    types: [],
    scopes: [],
    items: [],
    projects: [],
    tasks: [],
  };
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  for (const id of sel.orgIds) {
    const o = orgById.get(id);
    if (o) out.orgs.push({ id, label: o.name });
  }
  for (const o of orgs) {
    for (const t of o.scope_types) {
      if (sel.scopeTypeIds.includes(t.id)) {
        out.types.push({
          id: t.id,
          label: t.label_plural,
          orgName: o.name,
          type: t,
        });
      }
      for (const s of t.scopes) {
        if (sel.scopeIds.includes(s.id)) {
          out.scopes.push({
            id: s.id,
            label: s.name,
            typeLabel: t.label_singular,
            orgName: o.name,
            type: t,
          });
        }
        for (const ref of sel.itemRefs) {
          const [scopeId, itemId] = ref.split("::");
          if (scopeId !== s.id) continue;
          const item = (itemsByType[t.id] ?? []).find((i) => i.id === itemId);
          out.items.push({
            ref,
            label: item?.display_name ?? "field",
            scopeName: s.name,
            typeLabel: t.label_singular,
            type: t,
          });
        }
      }
    }
  }
  for (const id of sel.projectIds) {
    const p = projects.find((x) => x.id === id);
    out.projects.push({ id, label: p?.name ?? "project" });
  }
  for (const id of sel.taskIds) {
    const t = tasks.find((x) => x.id === id);
    out.tasks.push({ id, label: t?.title ?? "task" });
  }
  return out;
}

/** One-line summary, e.g. "1 org · 3 scopes · 2 fields". */
export function summarizeSelection(sel: DenseSelection): string {
  const parts: string[] = [];
  const p = (n: number, s: string, pl?: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? s : (pl ?? `${s}s`)}`);
  };
  p(sel.orgIds.length, "org");
  p(sel.scopeTypeIds.length, "type");
  p(sel.scopeIds.length, "scope");
  p(sel.itemRefs.length, "field");
  p(sel.projectIds.length, "project");
  p(sel.taskIds.length, "task");
  return parts.length ? parts.join(" · ") : "No context";
}
