// Database hooks for task management
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabase/client';
import type { DatabaseTask, DatabaseProject, ProjectWithTasks } from '../types';
import * as taskService from '../services/taskService';
import * as projectService from '../services/projectService';

/**
 * Hook for managing tasks with real-time updates
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

  // Subscribe to real-time updates
  useEffect(() => {
    loadTasks();

    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'tasks',
        },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTasks]);

  return {
    tasks,
    loading,
    error,
    refresh: loadTasks,
    createTask: taskService.createTask,
    updateTask: taskService.updateTask,
    deleteTask: taskService.deleteTask,
  };
}

/**
 * Hook for managing projects with real-time updates
 */
export function useProjects() {
  const [projects, setProjects] = useState<DatabaseProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load projects
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getUserProjects();
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    loadProjects();

    const channel = supabase
      .channel('projects-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'projects',
        },
        () => {
          loadProjects();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProjects]);

  return {
    projects,
    loading,
    error,
    refresh: loadProjects,
    createProject: projectService.createProject,
    updateProject: projectService.updateProject,
    deleteProject: projectService.deleteProject,
  };
}

/**
 * Hook for managing projects with their tasks (combined view)
 */
export function useProjectsWithTasks() {
  const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load projects with tasks
  const loadProjectsWithTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectsWithTasks();
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects with tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to real-time updates for both projects and tasks
  useEffect(() => {
    loadProjectsWithTasks();

    const projectsChannel = supabase
      .channel('projects-with-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'projects',
        },
        () => {
          loadProjectsWithTasks();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'workspace',
          table: 'tasks',
        },
        () => {
          loadProjectsWithTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(projectsChannel);
    };
  }, [loadProjectsWithTasks]);

  return {
    projects,
    loading,
    error,
    refresh: loadProjectsWithTasks,
  };
}

