// Database types for task management — aligned with `types/database.types.ts`

import type { Database } from "@/types/database.types";

export type DatabaseProject =
  Database["workspace"]["Tables"]["projects"]["Row"];

export type DatabaseTask = Database["workspace"]["Tables"]["tasks"]["Row"];

// NOTE: task comments, attachments, and assignments moved off the legacy
// junction tables in the 2026-06 canonical-DB cutover:
//   - comments    → platform.comments  (via features/comments/commentsService)
//   - attachments → platform.associations (user_file → task; associationsService)
//   - assignments → ctx_tasks.assignee_id (primary assignee; no junction)
// The dead `DatabaseTaskAttachment` / `DatabaseTaskComment` /
// `DatabaseTaskAssignment` row aliases were removed with the cutover.

// Joined types for easier use in UI
export interface ProjectWithTasks extends DatabaseProject {
  tasks: DatabaseTask[];
}

// Simple task creation interface for external use (AI, etc.)
export interface CreateTaskInput {
  title: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null; // For creating subtasks
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  assignee_id?: string | null;
  status?: string;
  created_by?: string | null;
}

// Full task creation with all options
export interface CreateTaskOptions {
  projectId?: string;
  description?: string;
  dueDate?: string;
}
