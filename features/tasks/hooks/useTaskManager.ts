// Database hooks for task management
//
// REALTIME: `@ai-matrx/realtime` owns every channel here. The package supplies
// the unique instance topic, echo suppression (its write ledger, timestamp-
// monotonic FIRST), dedup, the decoupled ordered handler queue, jittered
// reconnect with a stability reset, tab-sleep/network awareness, and the
// `onBackfill` door — none of which this file may re-implement. What it hand-
// rolled before, and what is now DELETED: `toMs`, `isStaleEcho`, and the two
// `seenRef` "last updated_at we already saw" maps. Those were a private,
// per-hook copy of the ledger; the ledger is the shared one, so a write made by
// one hook is recognized as our own by all three.
//
// What is NOT the package's job and stays here: the 300ms refetch debounce (a
// burst of DISTINCT remote rows still deserves one reload), and the scope rules
// that decide whether a given row belongs in a given list.
//
// Before this change these three channels had static topics, no echo
// suppression on two of them, and NO reconnect catch-up at all — a dropped
// socket left a permanently wrong, healthy-looking list.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { defineChannelNamespace } from '@ai-matrx/realtime';
import { useChannel, useRealtimeManager } from '@ai-matrx/realtime/react';
import type { PostgresChangeDelivery } from '@ai-matrx/realtime';
import type { DatabaseTask, DatabaseProject, ProjectWithTasks } from '../types';
import * as taskService from '../services/taskService';
import * as projectService from '../services/projectService';
import { getUserId } from '@/utils/auth/getUserId';

/** Collapse a burst of row events into a single refetch. */
const REFETCH_DEBOUNCE_MS = 300;

const TASKS_TABLE = 'workspace.tasks';
const PROJECTS_TABLE = 'workspace.projects';

/** One place names these channels — a second, different declaration throws. */
const tasksChannel = defineChannelNamespace({
  namespace: 'workspace-tasks',
  parts: [],
  description: 'workspace.tasks rows visible to the signed-in user',
});

const projectsChannel = defineChannelNamespace({
  namespace: 'workspace-projects',
  parts: [],
  description: 'workspace.projects rows visible to the signed-in user',
});

const projectsWithTasksChannel = defineChannelNamespace({
  namespace: 'workspace-projects-with-tasks',
  parts: [],
  description: 'workspace.projects + workspace.tasks for the combined project/task view',
});

/**
 * The event carries a row typed by the table it came from. The package's
 * binding array is deliberately heterogeneous (one channel, several tables —
 * see `useProjectsWithTasks` below), so the row arrives as the wire shape and
 * the binding's own declaration is what names it.
 */
function rowAs<T>(delivery: PostgresChangeDelivery): T | null {
  return delivery.row as T | null;
}

function idOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
}

/** Content the app can change on a task/project row — the ledger's echo test. */
function rowFingerprint(row: Record<string, unknown>): string {
  return JSON.stringify([
    row.name ?? null,
    row.title ?? null,
    row.description ?? null,
    row.status ?? null,
    row.priority ?? null,
    row.due_date ?? null,
    row.project_id ?? null,
    row.deleted_at ?? null,
  ]);
}

/**
 * Hook for managing tasks with real-time updates.
 *
 * Realtime applies the changed ROW from the payload — `workspace.tasks`
 * carries every column this list needs (`created_by` + `deleted_at` reproduce
 * the `getUserTasks()` scope exactly), so no event ever costs a refetch.
 * Our own writes are registered on the manager's write ledger, so their echoes
 * never reach the handler at all.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<DatabaseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const manager = useRealtimeManager();

  /** Teach the ledger the server state we hold, so its echo is silent. */
  const observe = useCallback(
    (row: DatabaseTask) => {
      manager?.ledger.observe({
        table: TASKS_TABLE,
        id: row.id,
        updatedAt: row.updated_at ?? null,
        fingerprint: rowFingerprint(row as unknown as Record<string, unknown>),
      });
    },
    [manager],
  );

  // Load tasks
  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await taskService.getUserTasks();
      data.forEach(observe);
      setTasks(data);
    } catch (err) {
      setError('Failed to load tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [observe]);

  const removeTaskRow = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.some((t) => t.id === taskId)
        ? prev.filter((t) => t.id !== taskId)
        : prev,
    );
  }, []);

  /** Upsert one row, honouring this list's scope. */
  const applyTaskRow = useCallback(
    (row: DatabaseTask) => {
      observe(row);
      setTasks((prev) => {
        const index = prev.findIndex((t) => t.id === row.id);
        // Outside this list's scope (own, undeleted tasks) — drop it, and evict
        // it if it was there before (soft-delete / reassignment).
        if (row.created_by !== getUserId() || row.deleted_at !== null) {
          return index === -1 ? prev : prev.filter((t) => t.id !== row.id);
        }
        if (index === -1) {
          // Same order as getUserTasks(): created_at descending.
          return [row, ...prev].sort((a, b) =>
            b.created_at.localeCompare(a.created_at),
          );
        }
        const next = prev.slice();
        next[index] = row;
        return next;
      });
    },
    [observe],
  );

  const createTask = useCallback(
    async (input: taskService.CreateTaskInput) => {
      const row = await taskService.createTask(input);
      if (row) applyTaskRow(row);
      return row;
    },
    [applyTaskRow],
  );

  const updateTask = useCallback(
    async (taskId: string, updates: taskService.UpdateTaskInput) => {
      const row = await taskService.updateTask(taskId, updates);
      if (row) applyTaskRow(row);
      return row;
    },
    [applyTaskRow],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      const ok = await taskService.deleteTask(taskId);
      if (ok) removeTaskRow(taskId);
      return ok;
    },
    [removeTaskRow],
  );

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useChannel({
    topic: tasksChannel.topic(),
    postgresChanges: [
      {
        event: '*',
        schema: 'workspace',
        table: 'tasks',
        rowId: (row) => (typeof row.id === 'string' ? row.id : undefined),
        fingerprint: rowFingerprint,
        onChange: (delivery) => {
          if (delivery.payload.eventType === 'DELETE') {
            // Default replica identity gives us the primary key only — enough.
            const id = idOf(delivery.payload.old);
            if (id) removeTaskRow(id);
            return;
          }
          const row = rowAs<DatabaseTask>(delivery);
          if (row) applyTaskRow(row);
        },
      },
    ],
    // Realtime has no replay: reconnect, tab wake, network restore and queue
    // overflow all re-read the list instead of leaving a screen that lies.
    onBackfill: () => {
      void loadTasks();
    },
  });

  return {
    tasks,
    loading,
    error,
    refresh: loadTasks,
    createTask,
    updateTask,
    deleteTask,
  };
}

/**
 * Hook for managing projects with real-time updates.
 *
 * A project row alone cannot reproduce this list's scope — it is a membership
 * join (`membershipsService.forUser("project")` ∪ projects I created). So the
 * payload is applied directly only for projects I own; anything else falls
 * back to a debounced refetch. Own echoes never arrive (the ledger drops them),
 * so an echo can never cost one.
 */
export function useProjects() {
  const [projects, setProjects] = useState<DatabaseProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const manager = useRealtimeManager();

  /** Teach the ledger the server state we hold, so its echo is silent. */
  const remember = useCallback(
    (row: DatabaseProject) => {
      manager?.ledger.observe({
        table: PROJECTS_TABLE,
        id: row.id,
        updatedAt: row.updated_at ?? null,
        fingerprint: rowFingerprint(row as unknown as Record<string, unknown>),
      });
    },
    [manager],
  );

  // Load projects
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getUserProjects();
      data.forEach(remember);
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [remember]);

  const scheduleRefetch = useDebouncedRefetch(loadProjects);

  const removeProjectRow = useCallback((projectId: string) => {
    setProjects((prev) =>
      prev.some((p) => p.id === projectId)
        ? prev.filter((p) => p.id !== projectId)
        : prev,
    );
  }, []);

  const applyProjectRow = useCallback(
    (row: DatabaseProject) => {
      remember(row);
      setProjects((prev) => {
        const index = prev.findIndex((p) => p.id === row.id);
        if (row.deleted_at !== null) {
          return index === -1 ? prev : prev.filter((p) => p.id !== row.id);
        }
        if (index === -1) {
          // Same order as getUserProjects(): created_at descending.
          return [row, ...prev].sort((a, b) =>
            b.created_at.localeCompare(a.created_at),
          );
        }
        const next = prev.slice();
        next[index] = row;
        return next;
      });
    },
    [remember],
  );

  const createProject = useCallback(
    async (name: string, description?: string) => {
      const row = await projectService.createProject(name, description);
      if (row) applyProjectRow(row);
      return row;
    },
    [applyProjectRow],
  );

  const updateProject = useCallback(
    async (
      projectId: string,
      updates: { name?: string; description?: string },
    ) => {
      const row = await projectService.updateProject(projectId, updates);
      if (row) applyProjectRow(row);
      return row;
    },
    [applyProjectRow],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const ok = await projectService.deleteProject(projectId);
      if (ok) removeProjectRow(projectId);
      return ok;
    },
    [removeProjectRow],
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useChannel({
    topic: projectsChannel.topic(),
    postgresChanges: [
      {
        event: '*',
        schema: 'workspace',
        table: 'projects',
        rowId: (row) => (typeof row.id === 'string' ? row.id : undefined),
        fingerprint: rowFingerprint,
        onChange: (delivery) => {
          if (delivery.payload.eventType === 'DELETE') {
            const id = idOf(delivery.payload.old);
            if (id) removeProjectRow(id);
            return;
          }
          const row = rowAs<DatabaseProject>(delivery);
          if (!row) return;
          if (row.created_by === getUserId()) {
            applyProjectRow(row);
            return;
          }
          // A project I'm a member of but don't own: membership decides whether
          // it belongs in this list, and the row can't tell us. Refetch once.
          remember(row);
          scheduleRefetch();
        },
      },
    ],
    onBackfill: () => {
      void loadProjects();
    },
  });

  return {
    projects,
    loading,
    error,
    refresh: loadProjects,
    createProject,
    updateProject,
    deleteProject,
  };
}

/**
 * Hook for managing projects with their tasks (combined view).
 *
 * This one genuinely needs a refetch: the view is a project↔task JOIN scoped
 * by membership, which no single row payload can reproduce. What it must NOT
 * do is refetch on echoes — the ledger drops those before the handler runs.
 * Task events for unparented tasks are dropped (they never appear in this
 * view), and surviving events are debounced into one reload. Read-only
 * surface: it exposes no mutators.
 */
export function useProjectsWithTasks() {
  const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const manager = useRealtimeManager();

  // Load projects with tasks
  const loadProjectsWithTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectsWithTasks();
      const ledger = manager?.ledger;
      if (ledger) {
        for (const project of data) {
          ledger.observe({
            table: PROJECTS_TABLE,
            id: project.id,
            updatedAt: project.updated_at ?? null,
            fingerprint: rowFingerprint(
              project as unknown as Record<string, unknown>,
            ),
          });
          for (const task of project.tasks ?? []) {
            ledger.observe({
              table: TASKS_TABLE,
              id: task.id,
              updatedAt: task.updated_at ?? null,
              fingerprint: rowFingerprint(
                task as unknown as Record<string, unknown>,
              ),
            });
          }
        }
      }
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects with tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [manager]);

  const scheduleRefetch = useDebouncedRefetch(loadProjectsWithTasks);

  useEffect(() => {
    loadProjectsWithTasks();
  }, [loadProjectsWithTasks]);

  useChannel({
    topic: projectsWithTasksChannel.topic(),
    postgresChanges: [
      {
        event: '*',
        schema: 'workspace',
        table: 'projects',
        rowId: (row) => (typeof row.id === 'string' ? row.id : undefined),
        fingerprint: rowFingerprint,
        onChange: () => scheduleRefetch(),
      },
      {
        event: '*',
        schema: 'workspace',
        table: 'tasks',
        rowId: (row) => (typeof row.id === 'string' ? row.id : undefined),
        fingerprint: rowFingerprint,
        onChange: (delivery) => {
          if (delivery.payload.eventType !== 'DELETE') {
            const row = delivery.row;
            // Unparented tasks are not part of this view — never reload for them.
            if (row && !row.project_id) return;
          }
          scheduleRefetch();
        },
      },
    ],
    onBackfill: () => {
      void loadProjectsWithTasks();
    },
  });

  return {
    projects,
    loading,
    error,
    refresh: loadProjectsWithTasks,
  };
}

/**
 * A burst of DISTINCT remote rows deserves ONE reload. This is list-shaped
 * consumer logic, not realtime plumbing — the package's own queue coalesces
 * nothing, deliberately, because only the consumer knows what a reload costs.
 */
function useDebouncedRefetch(run: () => void | Promise<void>): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(run);
  latestRef.current = run;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void latestRef.current();
    }, REFETCH_DEBOUNCE_MS);
  }, []);
}
