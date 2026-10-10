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
//   • Engagement data (the user's projects and tasks) is
//     fetched lazily when a component mounts/opens — through THIS module, which
//     is module-scoped: a short TTL cache + in-flight dedup shared by every
//     instance on the page. Fifty fields rendered at once produce at most one
//     request per key per TTL window, never a request storm.
//
//   • A scope type's context FIELDS are never cached here: they are scope data,
//     held by the Redux catalog (`readScopeTypeFields` / `listScopeTypeItems`),
//     which shows a refused read instead of an empty list. A list row's scope
//     tags are the holder's too (`ensureEntityScopesBulk` + `useRowScopes`).
//
// If you are adding a read to any ContextAssignment component, add it here —
// never fetch directly from the component.

import { getUserProjects } from "@/features/projects/service";
import {
  getProjectTasks,
  getUserTasks,
} from "@/features/tasks/services/taskService";

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
}

export async function fetchAssignableProjects(): Promise<AssignableProject[]> {
  return cached("projects", async () => {
    const rows = await getUserProjects();
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      orgId: p.organizationId,
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

/**
 * Drop cached engagement data after a mutation (e.g. a quick-add created a
 * real task, or a row's context was edited) so the next engagement refetches.
 * Pass nothing to clear all.
 */
/** One project's tasks, read on demand — the engagement pickers' Tasks column.
 *  The person's whole task list (`fetchAssignableTasks`) is a capped
 *  organization-wide read; a project's own list is complete. */
export async function fetchProjectTasks(
  projectId: string,
): Promise<AssignableTask[]> {
  return cached(`tasks:project:${projectId}`, async () => {
    const rows = await getProjectTasks(projectId);
    return rows.map((t) => ({
      id: t.id,
      title: (t as { title?: string }).title ?? "Untitled task",
      projectId: (t as { project_id?: string | null }).project_id ?? projectId,
      orgId: (t as { organization_id?: string | null }).organization_id ?? null,
      status: (t as { status?: string | null }).status ?? null,
    }));
  });
}

export function invalidateAssignableData(kind?: "projects" | "tasks"): void {
  if (!kind) {
    cache.clear();
    return;
  }
  if (kind === "projects") cache.delete("projects");
  if (kind === "tasks") {
    cache.delete("tasks");
    for (const k of [...cache.keys()]) if (k.startsWith("tasks:project:")) cache.delete(k);
  }
}
