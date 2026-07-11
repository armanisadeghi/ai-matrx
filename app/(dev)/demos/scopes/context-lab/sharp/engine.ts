"use client";

// /demos/scopes/context-lab/sharp — shared engine
//
// One data hook + one selection model shared by every ui-sharp variation.
// Reads follow the doctrine exactly: the org→type→scope tree comes from the
// Redux scope tree (hydrated once at boot, never refetched here); projects,
// tasks and context items come through the module-cached
// context-assignment/data.ts layer. Nothing in this folder writes Layer A or
// Layer C — final saves log to console + toast (the lab convention).

import { useEffect, useMemo, useState } from "react";
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
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
  ContextItemRow,
} from "@/features/scopes/types";

/* ── data ──────────────────────────────────────────────────────────────── */

export interface FlatScope {
  scope: ScopeNode;
  type: ScopeTypeNode;
  org: OrgNode;
}

export interface PickerData {
  orgs: OrgNode[];
  flatScopes: FlatScope[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function usePickerData(): PickerData {
  const dispatch = useAppDispatch();
  const { organizations, status, error, refresh } = useScopeTree();
  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [tasks, setTasks] = useState<AssignableTask[]>([]);
  const [engError, setEngError] = useState<string | null>(null);
  const [engLoading, setEngLoading] = useState(true);

  useEffect(() => {
    dispatch(ensureScopeTree({}));
  }, [dispatch]);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchAssignableProjects(), fetchAssignableTasks()])
      .then(([p, t]) => {
        if (!alive) return;
        setProjects(p);
        setTasks(t);
        setEngError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setEngError(
          e instanceof Error ? e.message : "Could not load projects/tasks",
        );
      })
      .finally(() => {
        if (alive) setEngLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const flatScopes = useMemo<FlatScope[]>(
    () =>
      organizations.flatMap((org) =>
        org.scope_types.flatMap((type) =>
          type.scopes.map((scope) => ({ scope, type, org })),
        ),
      ),
    [organizations],
  );

  return useMemo(
    () => ({
      orgs: organizations,
      flatScopes,
      projects,
      tasks,
      loading:
        (status === "loading" || status === "idle") &&
        organizations.length === 0
          ? true
          : engLoading,
      error: error ?? engError,
      retry: () => {
        void refresh();
      },
    }),
    [
      organizations,
      flatScopes,
      projects,
      tasks,
      status,
      engLoading,
      error,
      engError,
      refresh,
    ],
  );
}

/* ── context items (lazy, module-cached via data.ts) ───────────────────── */

export interface TypeItemsState {
  items: ContextItemRow[] | null;
  loading: boolean;
  error: string | null;
}

export function useTypeItems(scopeTypeId: string | null): TypeItemsState {
  const [state, setState] = useState<TypeItemsState & { forId: string | null }>(
    { items: null, loading: false, error: null, forId: null },
  );

  // Adjust-during-render (the sanctioned reset pattern): a new type id
  // immediately shows its loading state without an effect-cascade.
  if (state.forId !== scopeTypeId) {
    setState({
      items: null,
      loading: scopeTypeId !== null,
      error: null,
      forId: scopeTypeId,
    });
  }

  useEffect(() => {
    if (!scopeTypeId) return;
    let alive = true;
    fetchTypeItems(scopeTypeId)
      .then((items) => {
        if (alive)
          setState({ items, loading: false, error: null, forId: scopeTypeId });
      })
      .catch((e: unknown) => {
        if (alive)
          setState({
            items: null,
            loading: false,
            error: e instanceof Error ? e.message : "Could not load items",
            forId: scopeTypeId,
          });
      });
    return () => {
      alive = false;
    };
  }, [scopeTypeId]);

  return state;
}

/* ── selection model ───────────────────────────────────────────────────── */

/** A context-item cell reference — the deepest selectable node. */
export interface ItemRef {
  scopeId: string;
  itemId: string;
  itemLabel: string;
  scopeName: string;
}

export interface SharpSelection {
  orgIds: string[];
  scopeIds: string[];
  projectIds: string[];
  taskIds: string[];
  itemRefs: ItemRef[];
}

export const EMPTY_SELECTION: SharpSelection = {
  orgIds: [],
  scopeIds: [],
  projectIds: [],
  taskIds: [],
  itemRefs: [],
};

export interface SelectionApi {
  selection: SharpSelection;
  count: number;
  hasOrg: (id: string) => boolean;
  hasScope: (id: string) => boolean;
  hasProject: (id: string) => boolean;
  hasTask: (id: string) => boolean;
  hasItem: (scopeId: string, itemId: string) => boolean;
  toggleOrg: (id: string) => void;
  toggleScope: (id: string) => void;
  toggleProject: (id: string) => void;
  toggleTask: (id: string) => void;
  toggleItem: (ref: ItemRef) => void;
  clear: () => void;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function useSharpSelection(
  onChange?: (sel: SharpSelection) => void,
): SelectionApi {
  const [selection, setSelection] = useState<SharpSelection>(EMPTY_SELECTION);

  function update(next: SharpSelection) {
    setSelection(next);
    onChange?.(next);
  }

  return {
    selection,
    count:
      selection.orgIds.length +
      selection.scopeIds.length +
      selection.projectIds.length +
      selection.taskIds.length +
      selection.itemRefs.length,
    hasOrg: (id) => selection.orgIds.includes(id),
    hasScope: (id) => selection.scopeIds.includes(id),
    hasProject: (id) => selection.projectIds.includes(id),
    hasTask: (id) => selection.taskIds.includes(id),
    hasItem: (scopeId, itemId) =>
      selection.itemRefs.some(
        (r) => r.scopeId === scopeId && r.itemId === itemId,
      ),
    toggleOrg: (id) =>
      update({ ...selection, orgIds: toggle(selection.orgIds, id) }),
    toggleScope: (id) =>
      update({ ...selection, scopeIds: toggle(selection.scopeIds, id) }),
    toggleProject: (id) =>
      update({ ...selection, projectIds: toggle(selection.projectIds, id) }),
    toggleTask: (id) =>
      update({ ...selection, taskIds: toggle(selection.taskIds, id) }),
    toggleItem: (ref) =>
      update({
        ...selection,
        itemRefs: selection.itemRefs.some(
          (r) => r.scopeId === ref.scopeId && r.itemId === ref.itemId,
        )
          ? selection.itemRefs.filter(
              (r) => !(r.scopeId === ref.scopeId && r.itemId === ref.itemId),
            )
          : [...selection.itemRefs, ref],
      }),
    clear: () => update(EMPTY_SELECTION),
  };
}

/** Human summary of a selection ("Titanium · AI Matrx · +3"). */
export function summarizeSelection(
  sel: SharpSelection,
  data: PickerData,
  max = 2,
): { names: string[]; extra: number } {
  const names: string[] = [];
  for (const id of sel.orgIds) {
    const o = data.orgs.find((x) => x.id === id);
    if (o) names.push(o.name);
  }
  for (const id of sel.scopeIds) {
    const s = data.flatScopes.find((x) => x.scope.id === id);
    if (s) names.push(s.scope.name);
  }
  for (const r of sel.itemRefs) names.push(`${r.scopeName} · ${r.itemLabel}`);
  for (const id of sel.projectIds) {
    const p = data.projects.find((x) => x.id === id);
    if (p) names.push(p.name);
  }
  for (const id of sel.taskIds) {
    const t = data.tasks.find((x) => x.id === id);
    if (t) names.push(t.title);
  }
  return { names: names.slice(0, max), extra: Math.max(0, names.length - max) };
}

/* ── fake writes (lab convention: console + toast, never the DB) ───────── */

export function previewWrite(
  action: string,
  payload: Record<string, unknown>,
  message: string,
): void {
  console.log(`[context-lab/sharp] ${action} →`, payload);
  toast.success(`${message} (logged — no DB write)`);
}

export function orgInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
