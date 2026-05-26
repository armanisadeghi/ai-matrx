/**
 * useQuickTask - Simple hook for creating tasks from anywhere in your app
 * 
 * Perfect for AI-generated tasks or quick task creation with minimal information.
 * 
 * @example
 * ```tsx
 * import { useQuickTask } from '@/app/(dev)/demos/general/task-manager/hooks/useQuickTask';
 * 
 * function MyAIComponent() {
 *   const { createTask, creating } = useQuickTask();
 *   
 *   const handleAIResponse = async (aiText: string) => {
 *     await createTask({
 *       title: "Review AI-generated content",
 *       description: aiText
 *     });
 *   };
 * }
 * ```
 */
'use client';

import { useState } from 'react';
import { createTask, quickCreateTask } from '../services/taskService';
import type { DatabaseTask } from '../types';
import type { CreateTaskInput } from '../services/taskService';

export function useQuickTask() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedTask, setLastCreatedTask] = useState<DatabaseTask | null>(null);

  /**
   * Create a task with optional details
   */
  const create = async (input: CreateTaskInput): Promise<DatabaseTask | null> => {
    setCreating(true);
    setError(null);
    
    try {
      const task = await createTask(input);
      
      if (task) {
        setLastCreatedTask(task);
        return task;
      } else {
        setError('Failed to create task');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setCreating(false);
    }
  };

  /**
   * Quick create - just title and optional description
   */
  const quick = async (title: string, description?: string): Promise<DatabaseTask | null> => {
    setCreating(true);
    setError(null);
    
    try {
      const task = await quickCreateTask(title, description);
      
      if (task) {
        setLastCreatedTask(task);
        return task;
      } else {
        setError('Failed to create task');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setCreating(false);
    }
  };

  return {
    createTask: create,
    quickCreate: quick,
    creating,
    error,
    lastCreatedTask,
  };
}

/**
 * Non-hook version for use outside React components
 * (e.g., in server actions, API routes, or other utility functions)
 */
export { createTask, quickCreateTask } from '../services/taskService';

