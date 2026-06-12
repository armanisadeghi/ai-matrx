// features/scopes/components/context-assignment/data.ts
//
// The single data layer for every ContextAssignment* component. These
// components will live all over the app, so the fetch discipline here is
// load-bearing:
//
//   • Core structure (orgs → scope types → scopes → projects) is NOT fetched
//     here at all. It comes from the Redux scope tree, hydrated once at app
//     boot (`ensureScopeTree` in DeferredSingletons, no-refetch policy) and
//     refreshed only when a structural mutation fires
//     (`refreshScopeTreeAfterMutation`). Components read it via `useScopeTree`.
//
//   • Engagement data (the user's tasks, a type's context items) is fetched
//     lazily when a component mounts/opens — through THIS module, which is
//     module-scoped: a short TTL cache + in-flight dedup shared by every
//     instance on the page. Fifty fields rendered at once produce at most one
//     request per key per TTL window, never a request storm.
//
// If you are adding a read to any ContextAssignment component, add it here —
// never fetch directly from the component.

import { getUserProjects } from "@/features/projects/service";
import { getUserTasks } from "@/features/tasks/services/taskService";
import { scopesService } from "@/features/scopes/service/scopesService";
import type { ContextItemRow } from "@/features/scopes/types";

const TTL_MS = 60_000;

interface CacheEntry {
  at: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fetcher()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** A project row flattened for assignment pickers. Includes projects from
 *  EVERY org plus org-less ("unassigned") projects — the scope tree only
 *  carries per-org projects, and unassigned ones matter most for tagging. */
export interface AssignableProject {
  id: string;
  name: string;
  orgId: string | null;
  isPersonal: boolean;
}

export async function fetchAssignableProjects(): Promise<AssignableProject[]> {
  return cached("projects", async () => {
    const rows = await getUserProjects();
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      orgId: p.organizationId,
      isPersonal: p.isPersonal,
    }));
  });
}

/** A task row flattened for assignment pickers. Tasks are independent of
 *  projects — `projectId` is optional containment, and a task with no org of
 *  its own follows its parent project's org. */
export interface AssignableTask {
  id: string;
  title: string;
  projectId: string | null;
  orgId: string | null;
  status: string | null;
}

export async function fetchAssignableTasks(): Promise<AssignableTask[]> {
  return cached("tasks", async () => {
    const rows = await getUserTasks();
    return rows.map((t) => ({
      id: t.id,
      title: (t as { title?: string }).title ?? "Untitled task",
      projectId: (t as { project_id?: string | null }).project_id ?? null,
      orgId: (t as { organization_id?: string | null }).organization_id ?? null,
      status: (t as { status?: string | null }).status ?? null,
    }));
  });
}

/** Context items defined on a scope type — used by slot pickers. */
export async function fetchTypeItems(
  scopeTypeId: string,
): Promise<ContextItemRow[]> {
  return cached(`items:${scopeTypeId}`, async () => {
    const r = await scopesService.listContextItems(scopeTypeId);
    return r.ok ? r.data.items : [];
  });
}

/**
 * Bulk per-entity scope assignments for LIST surfaces (file tables, note
 * lists): one query per visible page of rows, cached + deduped like
 * everything else here. Keyed by sorted id-set so scrolling back re-uses it.
 */
export async function fetchEntityScopesBulk(
  entityType: string,
  entityIds: string[],
): Promise<Record<string, string[]>> {
  if (entityIds.length === 0) return {};
  const key = `bulk:${entityType}:${[...entityIds].sort().join(",")}`;
  return cached(key, async () => {
    const r = await scopesService.getEntityScopesBulk(
      entityType as Parameters<typeof scopesService.getEntityScopesBulk>[0],
      entityIds,
    );
    return r.ok ? r.data.byEntity : {};
  });
}

/* ── row-scope store: per-row context status for LIST surfaces ────────────
   A tiny external store so table cells can read "this row's scope ids"
   without prop-threading or per-row fetches. Lists call `primeEntityScopes`
   once per visible page (one bulk query); cells subscribe via
   useSyncExternalStore; saves write through with `setRowScopes`. */

const rowScopeStore = new Map<string, string[]>();
const rowScopeListeners = new Set<() => void>();
const notifyRowScopes = () => rowScopeListeners.forEach((l) => l());

export function primeEntityScopes(entityType: string, entityIds: string[]): void {
  const missing = entityIds.filter((id) => !rowScopeStore.has(`${entityType}:${id}`));
  if (missing.length === 0) return;
  void fetchEntityScopesBulk(entityType, missing).then((byEntity) => {
    for (const id of missing) {
      rowScopeStore.set(`${entityType}:${id}`, byEntity[id] ?? []);
    }
    notifyRowScopes();
  });
}

export function subscribeRowScopes(cb: () => void): () => void {
  rowScopeListeners.add(cb);
  return () => { rowScopeListeners.delete(cb); };
}

/** undefined = not yet loaded (render neutral, never amber-by-default). */
export function getRowScopes(entityType: string, entityId: string): string[] | undefined {
  return rowScopeStore.get(`${entityType}:${entityId}`);
}

/** Write-through after a save so every visible cell updates instantly. */
export function setRowScopes(entityType: string, entityId: string, scopeIds: string[]): void {
  rowScopeStore.set(`${entityType}:${entityId}`, scopeIds);
  invalidateAssignableData("bulk");
  notifyRowScopes();
}

/**
 * Drop cached engagement data after a mutation (e.g. a quick-add created a
 * real task, or a row's context was edited) so the next engagement refetches.
 * Pass nothing to clear all.
 */
export function invalidateAssignableData(
  kind?: "projects" | "tasks" | "items" | "bulk",
  id?: string,
): void {
  if (!kind) {
    cache.clear();
    return;
  }
  if (kind === "projects") cache.delete("projects");
  if (kind === "tasks") cache.delete("tasks");
  if (kind === "items") {
    if (id) cache.delete(`items:${id}`);
    else for (const k of [...cache.keys()]) if (k.startsWith("items:")) cache.delete(k);
  }
  if (kind === "bulk") {
    for (const k of [...cache.keys()]) if (k.startsWith("bulk:")) cache.delete(k);
  }
}
