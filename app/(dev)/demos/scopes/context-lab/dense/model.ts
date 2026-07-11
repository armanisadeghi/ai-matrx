// /demos/scopes/context-lab/dense/model.ts
//
// Pure selection engine + flattening helpers shared by every dense-lab
// variation. No fetching here — the tree comes from Redux (useScopeTree),
// projects/tasks/items come through the official cached layer
// (features/scopes/components/context-assignment/data.ts).
//
// Selection model — the full four-level chain plus the two bottom systems:
//   org → scope type → scope → context item   +   projects, tasks
// Any node at any level is independently selectable (multi mode), or the
// whole selection collapses to exactly one node (single mode).

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
  | "org"
  | "type"
  | "scope"
  | "item"
  | "project"
  | "task";

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

/** Toggle a node. Single mode: selecting anything clears everything else. */
export function toggleNode(
  sel: DenseSelection,
  kind: DenseNodeKind,
  id: string,
  mode: SelectMode,
): DenseSelection {
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
        search: `${org.name} ${type.label_plural} ${type.label_singular}`.toLowerCase(),
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
