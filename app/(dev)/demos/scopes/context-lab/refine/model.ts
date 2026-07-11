"use client";

// /demos/scopes/context-lab/refine — shared selection model + data hooks.
//
// REAL data everywhere: the Redux scope tree (useScopeTree / ensureScopeTree),
// projects + tasks + context items via the module-cached
// context-assignment/data.ts layer. Per the lab convention, only the FINAL
// durable save (Layer C) and inline creates are faked with console.log + toast
// — a real write from a demo route would be illegal. Nothing here ever touches
// appContextSlice (Layer A is Surface A's exclusive right).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import type {
  ContextItemRow,
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";

/* ── selection model ─────────────────────────────────────────────────────── */

export type PickKind = "org" | "scope" | "item" | "project" | "task";

/** Item picks are compound: `${scopeId}::${itemId}` — an item is only
 *  meaningful as "this scope's «field»", never in the abstract. */
export interface PickSel {
  orgIds: string[];
  scopeIds: string[];
  itemIds: string[];
  projectIds: string[];
  taskIds: string[];
}

export const EMPTY_SEL: PickSel = {
  orgIds: [],
  scopeIds: [],
  itemIds: [],
  projectIds: [],
  taskIds: [],
};

const KEY_OF: Record<PickKind, keyof PickSel> = {
  org: "orgIds",
  scope: "scopeIds",
  item: "itemIds",
  project: "projectIds",
  task: "taskIds",
};

export function selCount(sel: PickSel): number {
  return (
    sel.orgIds.length +
    sel.scopeIds.length +
    sel.itemIds.length +
    sel.projectIds.length +
    sel.taskIds.length
  );
}

export function itemPickId(scopeId: string, itemId: string): string {
  return `${scopeId}::${itemId}`;
}

export interface PickController {
  sel: PickSel;
  /** true → picking anything replaces the whole selection (single-select). */
  single: boolean;
  has: (kind: PickKind, id: string) => boolean;
  toggle: (kind: PickKind, id: string) => void;
  clear: () => void;
  count: number;
}

export function usePickController(opts?: {
  single?: boolean;
  onChange?: (sel: PickSel) => void;
  /** single mode: called after a pick lands (hosts close their popover). */
  onPick?: () => void;
  initial?: PickSel;
}): PickController {
  const { single = false, onChange, onPick, initial } = opts ?? {};
  const [sel, setSel] = useState<PickSel>(initial ?? EMPTY_SEL);
  // Plain functions — React Compiler memoizes; events are discrete so reading
  // `sel` directly (instead of an updater) is safe and keeps onChange in sync.

  const has = (kind: PickKind, id: string) =>
    sel[KEY_OF[kind]].includes(id);

  const toggle = (kind: PickKind, id: string) => {
    const key = KEY_OF[kind];
    let next: PickSel;
    if (single) {
      const already = sel[key].includes(id);
      next = already ? EMPTY_SEL : { ...EMPTY_SEL, [key]: [id] };
      if (!already) onPick?.();
    } else {
      const cur = sel[key];
      next = {
        ...sel,
        [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      };
    }
    setSel(next);
    onChange?.(next);
  };

  const clear = () => {
    setSel(EMPTY_SEL);
    onChange?.(EMPTY_SEL);
  };

  return { sel, single, has, toggle, clear, count: selCount(sel) };
}

/* ── flattened views of the real tree ────────────────────────────────────── */

export interface FlatScope {
  scope: ScopeNode;
  type: ScopeTypeNode;
  org: OrgNode;
}

export function flattenScopes(orgs: OrgNode[]): FlatScope[] {
  return orgs.flatMap((org) =>
    org.scope_types.flatMap((type) =>
      type.scopes.map((scope) => ({ scope, type, org })),
    ),
  );
}

/** Human label for any pick id — used by chips, summaries, save logs. */
export function useLabelResolver(
  orgs: OrgNode[],
  projects: AssignableProject[],
  tasks: AssignableTask[],
  itemsByType: Record<string, ContextItemRow[]>,
) {
  return useMemo(() => {
    const flat = flattenScopes(orgs);
    return (kind: PickKind, id: string): string => {
      if (kind === "org") {
        return orgs.find((o) => o.id === id)?.name ?? id;
      }
      if (kind === "scope") {
        return flat.find((f) => f.scope.id === id)?.scope.name ?? id;
      }
      if (kind === "project") {
        return projects.find((p) => p.id === id)?.name ?? id;
      }
      if (kind === "task") {
        return tasks.find((t) => t.id === id)?.title ?? id;
      }
      // item — `${scopeId}::${itemId}`
      const [scopeId, itemId] = id.split("::");
      const fs = flat.find((f) => f.scope.id === scopeId);
      const item = fs
        ? (itemsByType[fs.type.id] ?? []).find((i) => i.id === itemId)
        : undefined;
      return fs && item
        ? `${fs.scope.name} · ${item.display_name}`
        : id;
    };
  }, [orgs, projects, tasks, itemsByType]);
}

/* ── real data: tree + projects + tasks (one place, cached layer) ────────── */

export interface RefineData {
  orgs: OrgNode[];
  treeStatus: "idle" | "loading" | "ready" | "error";
  treeError: string | null;
  retryTree: () => void;
  projects: AssignableProject[];
  tasks: AssignableTask[];
  engagementStatus: "loading" | "ready" | "error";
  retryEngagement: () => void;
}

export function useRefineData(): RefineData {
  const dispatch = useAppDispatch();
  const { organizations, status, error, refresh } = useScopeTree();

  useEffect(() => {
    void dispatch(ensureScopeTree({}));
  }, [dispatch]);

  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [tasks, setTasks] = useState<AssignableTask[]>([]);
  const [engagementStatus, setEngagementStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [engagementNonce, setEngagementNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchAssignableProjects(), fetchAssignableTasks()])
      .then(([p, t]) => {
        if (!alive) return;
        setProjects(p);
        setTasks(t);
        setEngagementStatus("ready");
      })
      .catch(() => {
        if (alive) setEngagementStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [engagementNonce]);

  // Normalize tree status ("idle" while the boot ensure is in flight → loading)
  const treeStatus: RefineData["treeStatus"] =
    organizations.length > 0
      ? "ready"
      : status === "error"
        ? "error"
        : status === "ready"
          ? "ready"
          : "loading";

  return {
    orgs: organizations,
    treeStatus,
    treeError: error,
    retryTree: () => void refresh(),
    projects,
    tasks,
    engagementStatus,
    retryEngagement: () => {
      setEngagementStatus("loading");
      setEngagementNonce((n) => n + 1);
    },
  };
}

/* ── context items per scope type (lazy, real, cached, with error state) ─── */

export interface ItemsState {
  itemsByType: Record<string, ContextItemRow[]>;
  loadingTypeIds: Set<string>;
  errorTypeIds: Set<string>;
  ensure: (typeId: string) => void;
  retry: (typeId: string) => void;
}

export function useTypeItems(): ItemsState {
  const [itemsByType, setItemsByType] = useState<
    Record<string, ContextItemRow[]>
  >({});
  const [loadingTypeIds, setLoading] = useState<Set<string>>(new Set());
  const [errorTypeIds, setErrors] = useState<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());

  const load = useCallback((typeId: string) => {
    requested.current.add(typeId);
    setLoading((p) => new Set(p).add(typeId));
    setErrors((p) => {
      const n = new Set(p);
      n.delete(typeId);
      return n;
    });
    fetchTypeItems(typeId)
      .then((items) =>
        setItemsByType((p) => ({ ...p, [typeId]: items })),
      )
      .catch(() => {
        requested.current.delete(typeId);
        setErrors((p) => new Set(p).add(typeId));
      })
      .finally(() =>
        setLoading((p) => {
          const n = new Set(p);
          n.delete(typeId);
          return n;
        }),
      );
  }, []);

  const ensure = useCallback(
    (typeId: string) => {
      if (requested.current.has(typeId)) return;
      load(typeId);
    },
    [load],
  );

  return { itemsByType, loadingTypeIds, errorTypeIds, ensure, retry: load };
}

/* ── inline create (add-at-any-level) — lab convention: log, never write ─── */

export interface DraftScope {
  id: string;
  name: string;
  typeId: string;
  orgId: string;
}
export interface DraftType {
  id: string;
  orgId: string;
  labelSingular: string;
  labelPlural: string;
}
export interface DraftItem {
  id: string;
  typeId: string;
  displayName: string;
}

export interface DraftStore {
  scopes: DraftScope[];
  types: DraftType[];
  items: DraftItem[];
  createScope: (typeId: string, orgId: string, name: string) => DraftScope;
  createType: (orgId: string, label: string) => DraftType;
  createItem: (typeId: string, displayName: string) => DraftItem;
}

let draftSeq = 0;

/** Demo-safe add-at-any-level. In the shipping field this goes through
 *  createScope / scope-type / context-item services; here (a demo route) the
 *  write is logged loudly and the created node overlays the real tree so the
 *  full interaction — including selecting the new node — stays real. */
export function useDraftStore(): DraftStore {
  const [scopes, setScopes] = useState<DraftScope[]>([]);
  const [types, setTypes] = useState<DraftType[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);

  const createScope = useCallback(
    (typeId: string, orgId: string, name: string) => {
      const d: DraftScope = {
        id: `draft:scope:${draftSeq++}`,
        name: name.trim(),
        typeId,
        orgId,
      };
      console.log("[context-lab/refine] CREATE scope (demo — no DB write) →", {
        table: "ctx_scopes",
        org_id: orgId,
        scope_type_id: typeId,
        name: d.name,
      });
      toast.success(`Created "${d.name}" (logged — no DB write)`);
      setScopes((p) => [...p, d]);
      return d;
    },
    [],
  );

  const createType = useCallback((orgId: string, label: string) => {
    const clean = label.trim();
    const d: DraftType = {
      id: `draft:type:${draftSeq++}`,
      orgId,
      labelSingular: clean,
      labelPlural: clean.endsWith("s") ? clean : `${clean}s`,
    };
    console.log(
      "[context-lab/refine] CREATE scope type (demo — no DB write) →",
      { table: "ctx_scope_types", org_id: orgId, label_singular: clean },
    );
    toast.success(`Created type "${d.labelPlural}" (logged — no DB write)`);
    setTypes((p) => [...p, d]);
    return d;
  }, []);

  const createItem = useCallback((typeId: string, displayName: string) => {
    const d: DraftItem = {
      id: `draft:item:${draftSeq++}`,
      typeId,
      displayName: displayName.trim(),
    };
    console.log(
      "[context-lab/refine] CREATE context item (demo — no DB write) →",
      { table: "ctx_context_items", scope_type_id: typeId, display_name: d.displayName },
    );
    toast.success(`Created field "${d.displayName}" (logged — no DB write)`);
    setItems((p) => [...p, d]);
    return d;
  }, []);

  return { scopes, types, items, createScope, createType, createItem };
}

/** Overlay drafts on the real tree so every variation renders one merged
 *  structure (drafts are selectable like real nodes). */
export function mergeDrafts(orgs: OrgNode[], drafts: DraftStore): OrgNode[] {
  if (
    drafts.scopes.length === 0 &&
    drafts.types.length === 0
  )
    return orgs;
  return orgs.map((org) => {
    const draftTypes: ScopeTypeNode[] = drafts.types
      .filter((t) => t.orgId === org.id)
      .map((t) => ({
        id: t.id,
        organization_id: org.id,
        label_singular: t.labelSingular,
        label_plural: t.labelPlural,
        icon: "sparkles",
        color: "violet",
        max_assignments_per_entity: null,
        sort_order: 999,
        parent_type_id: null,
        default_variable_keys: [],
        scopes: [],
      }));
    const withDraftScopes = [...org.scope_types, ...draftTypes].map((type) => {
      const extra = drafts.scopes.filter(
        (s) => s.typeId === type.id && s.orgId === org.id,
      );
      if (extra.length === 0) return type;
      return {
        ...type,
        scopes: [
          ...type.scopes,
          ...extra.map(
            (s): ScopeNode => ({
              id: s.id,
              scope_type_id: type.id,
              organization_id: org.id,
              name: s.name,
              description: "",
              parent_scope_id: null,
              settings: {},
            }),
          ),
        ],
      };
    });
    return { ...org, scope_types: withDraftScopes };
  });
}

/** Merge draft items into a type's loaded item list (display only). */
export function mergeDraftItems(
  real: ContextItemRow[] | undefined,
  drafts: DraftStore,
  typeId: string,
): ContextItemRow[] {
  const base = real ?? [];
  const extra = drafts.items
    .filter((d) => d.typeId === typeId)
    .map(
      (d) =>
        ({
          id: d.id,
          scope_type_id: typeId,
          display_name: d.displayName,
          key: d.displayName.toLowerCase().replace(/\s+/g, "_"),
          value_type: "text",
        }) as unknown as ContextItemRow,
    );
  return [...base, ...extra];
}

/* ── the faked terminal save (lab convention) ────────────────────────────── */

export function fakeSave(
  surface: string,
  mode: "assignment" | "active" | "filter" | "single",
  sel: PickSel,
  label: (kind: PickKind, id: string) => string,
): void {
  console.log(`[context-lab/refine] SAVE (${surface}, ${mode}) →`, {
    orgs: sel.orgIds.map((id) => label("org", id)),
    scopes: sel.scopeIds.map((id) => label("scope", id)),
    items: sel.itemIds.map((id) => label("item", id)),
    projects: sel.projectIds.map((id) => label("project", id)),
    tasks: sel.taskIds.map((id) => label("task", id)),
    raw: sel,
  });
  toast.success(
    `${selCount(sel)} context ${selCount(sel) === 1 ? "node" : "nodes"} saved (logged — no DB write)`,
  );
}
