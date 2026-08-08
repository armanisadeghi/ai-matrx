// UI Types for Task Manager
import type { TaskSortField } from "./sort";
import type { TaskStatus, TaskOrigin } from "../constants/status";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  /** Canonical lifecycle status (normalized from the raw DB value). */
  status: TaskStatus;
  description: string;
  attachments: string[];
  dueDate: string;
  startDate?: string | null;
  completedAt?: string | null;
  recurrenceRule?: string | null;
  priority?: "low" | "medium" | "high" | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  parentTaskId?: string | null;
  subtasks?: Task[];
  updatedAt?: string | null;
  userId?: string | null;
  isPublic?: boolean;
  settings?: { labels?: string[]; [key: string]: unknown };
  /** Provenance — who/what created this task and where it came from. */
  origin?: TaskOrigin;
  sourceType?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

export interface TaskWithProject extends Task {
  projectId: string;
  projectName: string;
}

export type TaskFilterType = "all" | "incomplete" | "overdue";

// Re-export database types
export * from "./database";

// Re-export sort types
export * from "./sort";
