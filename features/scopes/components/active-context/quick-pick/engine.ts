"use client";

// features/scopes/components/active-context/quick-pick/engine.ts
//
// Shared picker engine for the Command Quick-Pick (and sibling insides).
// Promoted from /demos/scopes/context-lab/reimagine.
//
// Reads are REAL:
//   • org → scope type → scope tree: Redux scope tree (useScopeTree +
//     idempotent ensureScopeTree — never refetched from here).
//   • projects / tasks / context items: the canonical module-cached
//     context-assignment data layer (data.ts — TTL + in-flight dedup).
//
// Local `useSelectionEngine` is for demos / uncontrolled hosts. Production
// Surface-A active context uses ActiveContextTree (dense ContextTree), not
// this engine. Quick-adds via `createDraft` stay preview-only (draft nodes +
// toast) until a host wires durable create callbacks.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
  fetchTypeItems,
  type AssignableProject,
  type AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import {
  resolveColor,
  type ScopeColor,
} from "@/features/scopes/constants/scope-colors";
import type { OrgNode, ScopeTypeNode } from "@/features/scopes/types";

/* ── node model ──────────────────────────────────────────────────────────── */

export type NodeKind = "org" | "type" | "scope" | "item" | "project" | "task";

export const KIND_LABEL: Record<NodeKind, string> = {
  org: "Organization",
  type: "Scope type",
  scope: "Scope",
  item: "Context item",
  project: "Project",
  task: "Task",
};

/** A selectable node at ANY level of the shape:
 *  Org → Scope Type → Scope → Context Item, plus Projects/Tasks (bottom). */
export interface PickNode {
  kind: NodeKind;
  /** Items use a composite id `${scopeId}::${itemId}` (an item is picked
   *  per-scope — "Ava › age", not "age" in the abstract). */
  id: string;
  label: string;
  /** Breadcrumb path, excluding the node itself. */
  path: string[];
  color?: ScopeColor;
  iconName?: string | null;
  orgId: string | null;
  typeId?: string;
  scopeId?: string;
  /** Present only for `item` nodes; avoids reparsing the composite node id. */
  contextItemId?: string;
}

export const nodeKey = (n: Pick<PickNode, "kind" | "id">): string =>
  `${n.kind}:${n.id}`;

/* ── draft store (preview quick-adds, shared across every variant) ───────── */

export interface DraftType {
  id: string;
  orgId: string;
  labelSingular: string;
  labelPlural: string;
}
export interface DraftScope {
  id: string;
  orgId: string;
  typeId: string;
  name: string;
}
export interface DraftItem {
  id: string;
  typeId: string;
  name: string;
}

interface DraftsState {
  types: DraftType[];
  scopes: DraftScope[];
  items: DraftItem[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
}

let drafts: DraftsState = {
  types: [],
  scopes: [],
  items: [],
  projects: [],
  tasks: [],
};
const draftListeners = new Set<() => void>();
const subscribeDrafts = (cb: () => void): (() => void) => {
  draftListeners.add(cb);
  return () => {
    draftListeners.delete(cb);
  };
};
const getDrafts = (): DraftsState => drafts;

export function useDrafts(): DraftsState {
  return useSyncExternalStore(subscribeDrafts, getDrafts, getDrafts);
}

let draftSeq = 0;
const draftId = (kind: string): string => `draft:${kind}:${++draftSeq}`;

export type CreatePayload =
  | { kind: "type"; orgId: string; orgName: string; name: string }
  | {
      kind: "scope";
      orgId: string;
      typeId: string;
      typeName: string;
      name: string;
    }
  | { kind: "item"; typeId: string; typeName: string; name: string }
  | { kind: "project"; orgId: string | null; name: string }
  | { kind: "task"; name: string };

/** Preview create — add-at-any-level. Logs the exact write a live host would
 *  perform, adds a shared draft node, returns the new id. */
export function createDraft(p: CreatePayload): { id: string } {
  const name = p.name.trim();
  const id = draftId(p.kind);
  // Loud by design: this demo may not write Layer C / structural tables.
  console.log(
    "[context-reimagine] CREATE (preview — a live host would persist this) →",
    { ...p, name, draft_id: id },
  );
  if (p.kind === "type") {
    drafts = {
      ...drafts,
      types: [
        ...drafts.types,
        { id, orgId: p.orgId, labelSingular: name, labelPlural: name },
      ],
    };
  } else if (p.kind === "scope") {
    drafts = {
      ...drafts,
      scopes: [
        ...drafts.scopes,
        { id, orgId: p.orgId, typeId: p.typeId, name },
      ],
    };
  } else if (p.kind === "item") {
    drafts = {
      ...drafts,
      items: [...drafts.items, { id, typeId: p.typeId, name }],
    };
  } else if (p.kind === "project") {
    drafts = {
      ...drafts,
      projects: [
        ...drafts.projects,
        { id, name, orgId: p.orgId, isPersonal: false },
      ],
    };
  } else {
    drafts = {
      ...drafts,
      tasks: [
        ...drafts.tasks,
        { id, title: name, projectId: null, orgId: null, status: "incomplete" },
      ],
    };
  }
  draftListeners.forEach((l) => l());
  toast.success(`Created "${name}" (preview — logged, no DB write)`);
  return { id };
}

/* ── universe: real tree + projects + tasks, drafts merged ────────────────── */

export interface Universe {
  orgs: OrgNode[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  /** Tree: loading | ready | empty | error. `empty` = ready with zero orgs. */
  treeStatus: "loading" | "ready" | "empty" | "error";
  treeError: string | null;
  retryTree: () => void;
  engagementStatus: "loading" | "ready" | "error";
  engagementError: string | null;
  retryEngagement: () => void;
}

function fabricateType(d: DraftType): ScopeTypeNode {
  return {
    id: d.id,
    organization_id: d.orgId,
    label_singular: d.labelSingular,
    label_plural: d.labelPlural,
    icon: "sparkles",
    color: "violet",
    max_assignments_per_entity: null,
    sort_order: 999,
    parent_type_id: null,
    default_variable_keys: [],
    scopes: [],
  };
}

function mergeDrafts(orgs: OrgNode[], d: DraftsState): OrgNode[] {
  if (d.types.length === 0 && d.scopes.length === 0) return orgs;
  return orgs.map((o) => {
    const draftTypes = d.types
      .filter((t) => t.orgId === o.id)
      .map(fabricateType);
    const allTypes = [...o.scope_types, ...draftTypes];
    const withScopes = allTypes.map((t) => {
      const extra = d.scopes
        .filter((s) => s.typeId === t.id)
        .map((s) => ({
          id: s.id,
          scope_type_id: t.id,
          organization_id: o.id,
          name: s.name,
          description: "",
          parent_scope_id: null,
          settings: {},
        }));
      return extra.length > 0 ? { ...t, scopes: [...t.scopes, ...extra] } : t;
    });
    if (draftTypes.length === 0 && withScopes === allTypes) return o;
    return { ...o, scope_types: withScopes };
  });
}

export function useUniverse(): Universe {
  const dispatch = useAppDispatch();
  const { organizations, status, error, refresh } = useScopeTree();
  useEffect(() => {
    void dispatch(ensureScopeTree({}));
  }, [dispatch]);
  const d = useDrafts();

  const [projects, setProjects] = useState<AssignableProject[] | null>(null);
  const [tasks, setTasks] = useState<AssignableTask[] | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [engTick, setEngTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setEngagementError(null);
    Promise.all([fetchAssignableProjects(), fetchAssignableTasks()])
      .then(([p, t]) => {
        if (!alive) return;
        setProjects(p);
        setTasks(t);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setEngagementError(
          e instanceof Error ? e.message : "Couldn't load projects and tasks",
        );
      });
    return () => {
      alive = false;
    };
  }, [engTick]);

  const orgs = useMemo(() => mergeDrafts(organizations, d), [organizations, d]);
  const mergedProjects = useMemo(
    () => [...(projects ?? []), ...d.projects],
    [projects, d.projects],
  );
  const mergedTasks = useMemo(
    () => [...(tasks ?? []), ...d.tasks],
    [tasks, d.tasks],
  );

  const treeStatus: Universe["treeStatus"] =
    status === "error"
      ? "error"
      : organizations.length > 0
        ? "ready"
        : status === "ready"
          ? "empty"
          : "loading";

  return {
    orgs,
    projects: mergedProjects,
    tasks: mergedTasks,
    treeStatus,
    treeError: error,
    retryTree: () => void refresh(),
    engagementStatus: engagementError
      ? "error"
      : projects === null || tasks === null
        ? "loading"
        : "ready",
    engagementError,
    retryEngagement: () => setEngTick((t) => t + 1),
  };
}

/* ── node builders + search ──────────────────────────────────────────────── */

export function orgNodeOf(o: OrgNode): PickNode {
  return {
    kind: "org",
    id: o.id,
    // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
    label: o.is_personal ? `${o.name} (personal)` : o.name,
    path: [],
    orgId: o.id,
  };
}

export function typeNodeOf(o: OrgNode, t: ScopeTypeNode): PickNode {
  return {
    kind: "type",
    id: t.id,
    label: t.label_plural,
    path: [o.name],
    color: resolveColor(t),
    iconName: t.icon,
    orgId: o.id,
    typeId: t.id,
  };
}

export function scopeNodeOf(
  o: OrgNode,
  t: ScopeTypeNode,
  s: { id: string; name: string },
): PickNode {
  return {
    kind: "scope",
    id: s.id,
    label: s.name,
    path: [o.name, t.label_plural],
    color: resolveColor(t),
    iconName: t.icon,
    orgId: o.id,
    typeId: t.id,
    scopeId: s.id,
  };
}

export function itemNodeOf(
  scope: PickNode,
  item: { id: string; label: string },
): PickNode {
  return {
    kind: "item",
    id: `${scope.id}::${item.id}`,
    label: item.label,
    path: [...scope.path.slice(0, 1), scope.label],
    color: scope.color,
    orgId: scope.orgId,
    typeId: scope.typeId,
    scopeId: scope.id,
    contextItemId: item.id,
  };
}

export function projectNodeOf(
  p: AssignableProject,
  orgName: (id: string | null) => string,
): PickNode {
  return {
    kind: "project",
    id: p.id,
    label: p.name,
    path: [orgName(p.orgId), "Projects"],
    orgId: p.orgId,
  };
}

export function taskNodeOf(
  t: AssignableTask,
  orgName: (id: string | null) => string,
): PickNode {
  return {
    kind: "task",
    id: t.id,
    label: t.title,
    path: [orgName(t.orgId), "Tasks"],
    orgId: t.orgId,
  };
}

export function orgNameLookup(u: Universe): (id: string | null) => string {
  const byId = new Map(u.orgs.map((o) => [o.id, o.name]));
  return (id) => (id ? (byId.get(id) ?? "Other org") : "Unassigned");
}

/** Flat search index across org / type / scope / project / task. Context
 *  items are reached by drilling (they are lazy-loaded per type). */
export function buildIndex(u: Universe): PickNode[] {
  const orgName = orgNameLookup(u);
  const out: PickNode[] = [];
  for (const o of u.orgs) {
    out.push(orgNodeOf(o));
    for (const t of o.scope_types) {
      out.push(typeNodeOf(o, t));
      for (const s of t.scopes) out.push(scopeNodeOf(o, t, s));
    }
  }
  for (const p of u.projects) out.push(projectNodeOf(p, orgName));
  for (const t of u.tasks) out.push(taskNodeOf(t, orgName));
  return out;
}

const KIND_ORDER: Record<NodeKind, number> = {
  scope: 0,
  type: 1,
  org: 2,
  item: 3,
  project: 4,
  task: 5,
};

export function searchNodes(
  index: PickNode[],
  query: string,
  limit = 60,
): PickNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.slice(0, limit);
  const scored: { n: PickNode; score: number }[] = [];
  for (const n of index) {
    const l = n.label.toLowerCase();
    const inPath = n.path.some((p) => p.toLowerCase().includes(q));
    let score = -1;
    if (l === q) score = 0;
    else if (l.startsWith(q)) score = 1;
    else if (l.includes(q)) score = 2;
    else if (inPath) score = 3;
    if (score >= 0) scored.push({ n, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      KIND_ORDER[a.n.kind] - KIND_ORDER[b.n.kind] ||
      a.n.label.localeCompare(b.n.label),
  );
  return scored.slice(0, limit).map((s) => s.n);
}

/* ── per-column search (Miller Columns, DrillDeck, every column host) ─────── */

/** A column with MORE rows than this shows its own search box. */
export const COLUMN_SEARCH_THRESHOLD = 8;

export function columnShowsSearch(rowCount: number): boolean {
  return rowCount > COLUMN_SEARCH_THRESHOLD;
}

/** The ContextTree's flatten-and-filter, applied to one column's rows: a row
 *  stays when every whitespace-separated term of the query appears in its
 *  label (case-insensitive). An empty query keeps every row, in order. */
export function filterColumnRows<T>(
  rows: readonly T[],
  query: string,
  labelOf: (row: T) => string,
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...rows];
  return rows.filter((row) => {
    const haystack = labelOf(row).toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** One column's query. It clears itself whenever `sourceKey` changes (the
 *  column now lists different rows — another org, type or scope). */
export function useColumnQuery(
  sourceKey: string,
): [string, (query: string) => void] {
  const [state, setState] = useState({ key: sourceKey, query: "" });
  // Adjust-state-during-render: a new source forgets the old query for good
  // (returning to the old source must not resurrect it).
  if (state.key !== sourceKey) setState({ key: sourceKey, query: "" });
  const query = state.key === sourceKey ? state.query : "";
  const setQuery = useCallback(
    (next: string) => setState({ key: sourceKey, query: next }),
    [sourceKey],
  );
  return [query, setQuery];
}

/* ── lazy context items per scope type ───────────────────────────────────── */

export interface ItemLite {
  id: string;
  key: string;
  label: string;
}

export function useTypeItems(typeId: string | null): {
  status: "idle" | "loading" | "ready" | "error";
  items: ItemLite[];
  error: string | null;
  retry: () => void;
} {
  const d = useDrafts();
  const [state, setState] = useState<{
    forType: string | null;
    status: "idle" | "loading" | "ready" | "error";
    items: ItemLite[];
    error: string | null;
  }>({ forType: null, status: "idle", items: [], error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!typeId) {
      setState({ forType: null, status: "idle", items: [], error: null });
      return undefined;
    }
    // Draft types have no server-side items — resolve instantly.
    if (typeId.startsWith("draft:")) {
      setState({ forType: typeId, status: "ready", items: [], error: null });
      return undefined;
    }
    let alive = true;
    setState({ forType: typeId, status: "loading", items: [], error: null });
    fetchTypeItems(typeId)
      .then((rows) => {
        if (!alive) return;
        setState({
          forType: typeId,
          status: "ready",
          items: rows.map((r) => ({
            id: r.id,
            key: r.key,
            label: r.display_name || r.key,
          })),
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          forType: typeId,
          status: "error",
          items: [],
          error: e instanceof Error ? e.message : "Couldn't load context items",
        });
      });
    return () => {
      alive = false;
    };
  }, [typeId, tick]);

  const items = useMemo(() => {
    const draftsForType = d.items
      .filter((i) => i.typeId === typeId)
      .map((i) => ({ id: i.id, key: i.name, label: i.name }));
    return [...state.items, ...draftsForType];
  }, [state.items, d.items, typeId]);

  return {
    status: state.status,
    items,
    error: state.error,
    retry: () => setTick((t) => t + 1),
  };
}

/** Items for SEVERAL scope types at once — Miller's OR-merged items column
 *  (multiple selected scopes can span multiple types). Cached + deduped by
 *  the same data.ts layer underneath. */
export function useItemsForTypes(typeIds: string[]): {
  status: "idle" | "loading" | "ready" | "error";
  itemsByType: Record<string, ItemLite[]>;
  error: string | null;
  retry: () => void;
} {
  const d = useDrafts();
  const key = [...new Set(typeIds)].sort().join(",");
  const [state, setState] = useState<{
    forKey: string;
    status: "idle" | "loading" | "ready" | "error";
    itemsByType: Record<string, ItemLite[]>;
    error: string | null;
  }>({ forKey: "", status: "idle", itemsByType: {}, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) {
      setState({ forKey: "", status: "idle", itemsByType: {}, error: null });
      return undefined;
    }
    let alive = true;
    setState((p) => ({ ...p, forKey: key, status: "loading", error: null }));
    const ids = key.split(",");
    const real = ids.filter((t) => !t.startsWith("draft:"));
    Promise.all(
      real.map((t) =>
        fetchTypeItems(t).then(
          (rows) =>
            [
              t,
              rows.map((r) => ({
                id: r.id,
                key: r.key,
                label: r.display_name || r.key,
              })),
            ] as const,
        ),
      ),
    )
      .then((pairs) => {
        if (!alive) return;
        const byType: Record<string, ItemLite[]> = Object.fromEntries(pairs);
        for (const t of ids) byType[t] ??= [];
        setState({
          forKey: key,
          status: "ready",
          itemsByType: byType,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          forKey: key,
          status: "error",
          itemsByType: {},
          error: e instanceof Error ? e.message : "Couldn't load context items",
        });
      });
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const itemsByType = useMemo(() => {
    const out: Record<string, ItemLite[]> = {};
    for (const t of key ? key.split(",") : []) {
      const real = state.itemsByType[t] ?? [];
      const draftsFor = d.items
        .filter((i) => i.typeId === t)
        .map((i) => ({ id: i.id, key: i.name, label: i.name }));
      out[t] = [...real, ...draftsFor];
    }
    return out;
  }, [state.itemsByType, d.items, key]);

  return {
    status: state.status,
    itemsByType,
    error: state.error,
    retry: () => setTick((t) => t + 1),
  };
}

/* ── selection engine (multi by default, optional single-select) ─────────── */

export type PickerMode = "assignment" | "active" | "filter";

export const MODE_LABEL: Record<PickerMode, string> = {
  assignment: "Assign",
  active: "Set active",
  filter: "Filter",
};

export interface SelectionEngine {
  nodes: PickNode[];
  count: number;
  single: boolean;
  isOn: (kind: NodeKind, id: string) => boolean;
  toggle: (node: PickNode) => void;
  clear: () => void;
}

export function useSelectionEngine(single: boolean): SelectionEngine {
  const [selected, setSelected] = useState<Map<string, PickNode>>(
    () => new Map(),
  );

  // Flipping to single-select trims to the most recent pick — no stale multi
  // state can leak through a mode switch.
  useEffect(() => {
    if (!single) return;
    setSelected((prev) => {
      if (prev.size <= 1) return prev;
      const last = [...prev.entries()].at(-1);
      return last ? new Map([last]) : new Map();
    });
  }, [single]);

  const toggle = useCallback(
    (node: PickNode) => {
      setSelected((prev) => {
        const key = nodeKey(node);
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
          return next;
        }
        if (single) return new Map([[key, node]]);
        next.set(key, node);
        return next;
      });
    },
    [single],
  );

  const isOn = useCallback(
    (kind: NodeKind, id: string) => selected.has(`${kind}:${id}`),
    [selected],
  );

  const clear = useCallback(() => setSelected(new Map()), []);

  return useMemo(
    () => ({
      nodes: [...selected.values()],
      count: selected.size,
      single,
      isOn,
      toggle,
      clear,
    }),
    [selected, single, isOn, toggle, clear],
  );
}

/* ── drill path engine (one pick per column: org → type → scope → item) ──── */

/** A single path down the four columns — what an inspector-style host holds
 *  (one organization, one scope type, one scope, one context item). */
export interface DrillPath {
  orgId: string | null;
  typeId: string | null;
  scopeId: string | null;
  /** The context item's own id (not the composite `${scopeId}::${itemId}`). */
  itemId: string | null;
}

export const EMPTY_DRILL_PATH: DrillPath = {
  orgId: null,
  typeId: null,
  scopeId: null,
  itemId: null,
};

/** Picking a node sets ITS column and clears every column to its right;
 *  picking the node that is already on clears it (and the columns after). */
export function applyDrillPick(path: DrillPath, node: PickNode): DrillPath {
  switch (node.kind) {
    case "org":
      return path.orgId === node.id
        ? EMPTY_DRILL_PATH
        : { ...EMPTY_DRILL_PATH, orgId: node.id };
    case "type":
      return {
        orgId: node.orgId,
        typeId: path.typeId === node.id ? null : node.id,
        scopeId: null,
        itemId: null,
      };
    case "scope":
      return {
        orgId: node.orgId,
        typeId: node.typeId ?? null,
        scopeId: path.scopeId === node.id ? null : node.id,
        itemId: null,
      };
    case "item": {
      const itemId = node.contextItemId ?? node.id.split("::")[1] ?? null;
      const same = path.scopeId === node.scopeId && path.itemId === itemId;
      return {
        orgId: node.orgId,
        typeId: node.typeId ?? null,
        scopeId: node.scopeId ?? null,
        itemId: same ? null : itemId,
      };
    }
    default:
      return path;
  }
}

/** Locate a scope in the universe — the back-fill for a bare `?scope=` link. */
export function drillPathForScope(
  orgs: OrgNode[],
  scopeId: string,
): DrillPath | null {
  for (const org of orgs) {
    for (const type of org.scope_types) {
      if (type.scopes.some((scope) => scope.id === scopeId)) {
        return { orgId: org.id, typeId: type.id, scopeId, itemId: null };
      }
    }
  }
  return null;
}

/** The picked nodes of a path, resolved against the universe. */
export function drillPathNodes(
  orgs: OrgNode[],
  path: DrillPath,
  itemLabel?: string | null,
): PickNode[] {
  const org = orgs.find((candidate) => candidate.id === path.orgId);
  if (!org) return [];
  const out: PickNode[] = [orgNodeOf(org)];
  const type = org.scope_types.find((candidate) => candidate.id === path.typeId);
  if (!type) return out;
  out.push(typeNodeOf(org, type));
  const scope = type.scopes.find((candidate) => candidate.id === path.scopeId);
  if (!scope) return out;
  const scopeNode = scopeNodeOf(org, type, scope);
  out.push(scopeNode);
  if (path.itemId) {
    out.push(
      itemNodeOf(scopeNode, {
        id: path.itemId,
        label: itemLabel ?? "Context item",
      }),
    );
  }
  return out;
}

/** A controlled SelectionEngine over a DrillPath, for any Miller Columns /
 *  DrillDeck host that wants exactly one pick per column. */
export function useDrillPathEngine({
  orgs,
  path,
  onChange,
  itemLabel,
}: {
  orgs: OrgNode[];
  path: DrillPath;
  onChange: (next: DrillPath) => void;
  itemLabel?: string | null;
}): SelectionEngine {
  return useMemo(() => {
    const nodes = drillPathNodes(orgs, path, itemLabel);
    const isOn = (kind: NodeKind, id: string): boolean => {
      if (kind === "org") return path.orgId === id;
      if (kind === "type") return path.typeId === id;
      if (kind === "scope") return path.scopeId === id;
      if (kind === "item")
        return (
          path.itemId !== null && `${path.scopeId}::${path.itemId}` === id
        );
      return false;
    };
    return {
      nodes,
      count: nodes.length,
      single: true,
      isOn,
      toggle: (node) => onChange(applyDrillPick(path, node)),
      clear: () => onChange(EMPTY_DRILL_PATH),
    };
  }, [orgs, path, onChange, itemLabel]);
}

/** Preview commit: logs the exact payload a live host would persist. */
export function commitSelection(mode: PickerMode, nodes: PickNode[]): void {
  const byKind: Partial<Record<NodeKind, { id: string; label: string }[]>> = {};
  for (const n of nodes) {
    (byKind[n.kind] ??= []).push({ id: n.id, label: n.label });
  }
  console.log(
    `[context-reimagine] ${mode.toUpperCase()} commit (preview — no DB write) →`,
    byKind,
  );
  toast.success(
    `${MODE_LABEL[mode]}: ${nodes.length} node${nodes.length === 1 ? "" : "s"} captured (logged to console — no DB write)`,
  );
}

/** Compact human summary of a selection, e.g. "2 scopes · 1 project". */
export function summarizeSelection(nodes: PickNode[]): string {
  if (nodes.length === 0) return "";
  const counts = new Map<NodeKind, number>();
  for (const n of nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const plural: Record<NodeKind, [string, string]> = {
    org: ["org", "orgs"],
    type: ["type", "types"],
    scope: ["scope", "scopes"],
    item: ["item", "items"],
    project: ["project", "projects"],
    task: ["task", "tasks"],
  };
  const order: NodeKind[] = ["org", "type", "scope", "item", "project", "task"];
  return order
    .filter((k) => counts.has(k))
    .map((k) => {
      const c = counts.get(k) ?? 0;
      return `${c} ${plural[k][c === 1 ? 0 : 1]}`;
    })
    .join(" · ");
}
