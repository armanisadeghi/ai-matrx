/**
 * Names and scope builder of `tasks`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import type { TaskPriorityValue } from "@/features/tasks/constants/priority";


/** One comment as the surface emits it in `comments`. */
export interface TasksScopeComment {
  id: string;
  body: string;
  created_at: string;
  author_name?: string;
}

export function createTasksScope(values: {
  selection?: string;
  content?: string;
  // Allow the editor-surround blob (a string) as well as a structured bag,
  // matching the Notes convention; the launcher normalizes a string `context`.
  context?: Record<string, unknown> | string;
  text_before?: string;
  text_after?: string;
  active_task_id?: string;
  active_task_title?: string;
  active_task_created_at?: string;
  active_task_owner_id?: string;
  active_task?: Record<string, unknown>;
  active_task_description?: string;
  subtasks?: Array<{ id: string; title: string; status?: string }>;
  subtask_count?: number;
  completed_subtask_count?: number;
  active_task_status?: string;
  active_task_lifecycle_status?: string;
  active_task_priority?: TaskPriorityValue | null;
  active_task_due_date?: string;
  active_task_labels?: string[];
  active_task_assignee_id?: string;
  comments?: TasksScopeComment[];
  comment_count?: number;
  active_project_id?: string;
  active_project_name?: string;
  task_list?: unknown[];
  project_list?: unknown[];
  task_count?: number;
  search_query?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
