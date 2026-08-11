// Database hooks for task management
//
// Realtime doctrine (.claude/skills/supabase-realtime): Supabase sends us our
// OWN writes, and that echo lands 50–500ms AFTER the REST response we already
// applied. Every handler below therefore (a) suppresses echoes with a
// timestamp-monotonic `updated_at` guard, and (b) applies the payload row
// instead of refetching the whole list wherever the payload is sufficient.
// The `supabase` singleton is deliberate: every realtime consumer in this repo
// (notes / files / transcript-studio / data-tables) shares it so the app opens
// ONE websocket — see features/notes/redux/realtimeMiddleware.ts.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { uniqueChannelTopic } from '@/utils/supabase/realtime';
import { getUserId } from '@/utils/auth/getUserId';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { DatabaseTask, DatabaseProject, ProjectWithTasks } from '../types';
import * as taskService from '../services/taskService';
import * as projectService from '../services/projectService';

/** Collapse a burst of row events into a single refetch. */
const REFETCH_DEBOUNCE_MS = 300;

/** ms of a timestamptz, or null when absent/unparseable. */
function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Monotonic echo guard. A row that is not strictly newer than what we already
 * hold carries zero information — our own write's echo always lands here,
 * because the REST response that produced the same `updated_at` was applied
 * first. Unparseable timestamps fall through to accepting the payload:
 * degrade to delivering, never to silently dropping.
 */
function isStaleEcho(
  incoming: string | null | undefined,
  known: string | null | undefined,
): boolean {
  const next = toMs(incoming);
  const prev = toMs(known);
  if (next === null || prev === null) return false;
  return next <= prev;
}

/**
 * Hook for managing tasks with real-time updates.
 *
 * Realtime applies the changed ROW from the payload — `workspace.tasks`
 * carries every column this list needs (`created_by` + `deleted_at` reproduce
 * the `getUserTasks()` scope exactly), so no event ever costs a refetch.
 * The mutators are wrapped so a local write lands in state immediately; its
 * echo then arrives with an equal `updated_at` and is dropped.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<DatabaseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tasks
  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await taskService.getUserTasks();
      setTasks(data);
    } catch (err) {
      setError('Failed to load tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeTaskRow = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.some((t) => t.id === taskId)
        ? prev.filter((t) => t.id !== taskId)
        : prev,
    );
  }, []);

  /** Upsert one row, honouring this list's scope and the monotonic guard. */
  const applyTaskRow = useCallback((row: DatabaseTask) => {
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
      // Own echo (or any stale replay) — returning `prev` bails out of the
      // state update entirely, so no re-render and no refetch.
      if (isStaleEcho(row.updated_at, prev[index].updated_at)) return prev;
      const next = prev.slice();
      next[index] = row;
      return next;
    });
  }, []);

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

  // Subscribe to real-time updates
  useEffect(() => {
    loadTasks();

    const channel = supabase
      // Unique topic: several components mount this hook at once, and a shared
      // topic hands them all the SAME channel object (see utils/supabase/realtime).
      .channel(uniqueChannelTopic('tasks-changes'))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'tasks',
        },
        (payload: RealtimePostgresChangesPayload<DatabaseTask>) => {
          if (payload.eventType === 'DELETE') {
            // Default replica identity gives us the primary key only — enough.
            const { id } = payload.old;
            if (id) removeTaskRow(id);
            return;
          }
          applyTaskRow(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTasks, applyTaskRow, removeTaskRow]);

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
 * back to a debounced refetch, gated by the monotonic guard so an echo can
 * never cost one.
 */
export function useProjects() {
  const [projects, setProjects] = useState<DatabaseProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** id → last `updated_at` we have already accounted for. */
  const seenRef = useRef(new Map<string, number>());
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remember = useCallback((row: Pick<DatabaseProject, 'id' | 'updated_at'>) => {
    const ms = toMs(row.updated_at);
    if (ms !== null) seenRef.current.set(row.id, ms);
  }, []);

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

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      loadProjects();
    }, REFETCH_DEBOUNCE_MS);
  }, [loadProjects]);

  const removeProjectRow = useCallback((projectId: string) => {
    seenRef.current.delete(projectId);
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
        if (isStaleEcho(row.updated_at, prev[index].updated_at)) return prev;
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

  // Subscribe to real-time updates
  useEffect(() => {
    loadProjects();

    const channel = supabase
      .channel(uniqueChannelTopic('projects-changes'))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'projects',
        },
        (payload: RealtimePostgresChangesPayload<DatabaseProject>) => {
          if (payload.eventType === 'DELETE') {
            const { id } = payload.old;
            if (id) removeProjectRow(id);
            return;
          }
          const row = payload.new;
          // Own echo / stale replay — costs nothing.
          const seen = seenRef.current.get(row.id);
          const incoming = toMs(row.updated_at);
          if (seen !== undefined && incoming !== null && incoming <= seen) return;
          if (row.created_by === getUserId()) {
            applyProjectRow(row);
            return;
          }
          // A project I'm a member of but don't own: membership decides whether
          // it belongs in this list, and the row can't tell us. Refetch once.
          remember(row);
          scheduleRefetch();
        },
      )
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadProjects, applyProjectRow, removeProjectRow, remember, scheduleRefetch]);

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
 * do is refetch on echoes — so every event passes the monotonic guard first
 * (keyed per table+id), task events for unparented tasks are dropped (they
 * never appear in this view), and surviving events are debounced into one
 * reload. Read-only surface: it exposes no mutators.
 */
export function useProjectsWithTasks() {
  const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** `${table}:${id}` → last `updated_at` already reflected in `projects`. */
  const seenRef = useRef(new Map<string, number>());
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load projects with tasks
  const loadProjectsWithTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectsWithTasks();
      const seen = seenRef.current;
      for (const project of data) {
        const projectMs = toMs(project.updated_at);
        if (projectMs !== null) seen.set(`projects:${project.id}`, projectMs);
        for (const task of project.tasks ?? []) {
          const taskMs = toMs(task.updated_at);
          if (taskMs !== null) seen.set(`tasks:${task.id}`, taskMs);
        }
      }
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects with tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      loadProjectsWithTasks();
    }, REFETCH_DEBOUNCE_MS);
  }, [loadProjectsWithTasks]);

  // Subscribe to real-time updates for both projects and tasks
  useEffect(() => {
    loadProjectsWithTasks();

    /** True when the event carries nothing this view doesn't already know. */
    const isStale = (table: 'projects' | 'tasks', id: string, updatedAt: string) => {
      const seen = seenRef.current.get(`${table}:${id}`);
      if (seen === undefined) return false;
      const next = toMs(updatedAt);
      return next !== null && next <= seen;
    };

    const onRow = (
      table: 'projects' | 'tasks',
      payload: RealtimePostgresChangesPayload<{
        id: string;
        updated_at: string;
        project_id?: string | null;
      }>,
    ) => {
      if (payload.eventType === 'DELETE') {
        const { id } = payload.old;
        if (id) seenRef.current.delete(`${table}:${id}`);
        scheduleRefetch();
        return;
      }
      const row = payload.new;
      // Unparented tasks are not part of this view — never reload for them.
      if (table === 'tasks' && !row.project_id) return;
      if (isStale(table, row.id, row.updated_at)) return;
      const ms = toMs(row.updated_at);
      if (ms !== null) seenRef.current.set(`${table}:${row.id}`, ms);
      scheduleRefetch();
    };

    const projectsChannel = supabase
      .channel(uniqueChannelTopic('projects-with-tasks-changes'))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'projects',
        },
        (payload: RealtimePostgresChangesPayload<DatabaseProject>) =>
          onRow('projects', payload),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'tasks',
        },
        (payload: RealtimePostgresChangesPayload<DatabaseTask>) =>
          onRow('tasks', payload),
      )
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(projectsChannel);
    };
  }, [loadProjectsWithTasks, scheduleRefetch]);

  return {
    projects,
    loading,
    error,
    refresh: loadProjectsWithTasks,
  };
}
