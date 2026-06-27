// Task service for database operations
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId } from "@/utils/auth/getUserId";
import { getSharedWithMe } from "@/utils/permissions/service";
import type { DbRpcRow } from "@/types/supabase-rpc";
import type { DatabaseTask } from "../types";
import { fileHandler, folderForTask } from "@/features/files";
import { associationsService } from "@/features/scopes/service/associationsService";
import { commentsService } from "@/features/comments/service/commentsService";
import type { Comment } from "@/features/comments/types";
import { isScopesRpcErr } from "@/features/scopes/types";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  assignee_id?: string | null;
  status?: "incomplete" | "completed";
  created_by?: string | null;
  organization_id?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  assignee_id?: string | null;
  status?: "incomplete" | "completed";
  created_by?: string | null;
}

export interface CreateTaskOptions {
  projectId?: string;
  description?: string;
  dueDate?: string;
}

/**
 * Create a new task
 */
export async function createTask(
  input: CreateTaskInput,
): Promise<DatabaseTask | null> {
  try {
    const userId = requireUserId();
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .insert({
        title: input.title,
        description: input.description || null,
        project_id: input.project_id || null,
        parent_task_id: input.parent_task_id || null,
        due_date: input.due_date || null,
        priority: input.priority || null,
        assignee_id: input.assignee_id || null,
        status: input.status || "incomplete",
        created_by: userId,
        organization_id: input.organization_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating task:", error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Exception creating task:", error);
    return null;
  }
}

/**
 * Simplified task creation for quick adds (e.g., from AI or other features)
 * Only requires a title, everything else is optional
 */
export async function quickCreateTask(
  title: string,
  description: string = "",
  options?: CreateTaskOptions,
): Promise<DatabaseTask | null> {
  return createTask({
    title,
    description: description || null,
    project_id: options?.projectId || null,
    due_date: options?.dueDate || null,
  });
}

/**
 * Get all tasks for the current user
 */
export async function getUserTasks(): Promise<DatabaseTask[]> {
  try {
    const userId = requireUserId();
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching tasks:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception fetching tasks:", error);
    return [];
  }
}

/**
 * Get tasks for a specific project
 */
export async function getProjectTasks(
  projectId: string,
): Promise<DatabaseTask[]> {
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching project tasks:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception fetching project tasks:", error);
    return [];
  }
}

/**
 * Get the TOP-LEVEL tasks for a project (parent_task_id IS NULL only) — the
 * list a project board / project-flavored surface shows. Subtasks are excluded
 * here; they are loaded on demand by the editor that opens a given task.
 *
 * `ctx_tasks` hard-deletes (no soft-delete column), so no `is_deleted` filter
 * is needed. Ordered oldest-first for a stable, append-at-bottom list.
 */
export async function getTopLevelProjectTasks(
  projectId: string,
): Promise<DatabaseTask[]> {
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching top-level project tasks:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception fetching top-level project tasks:", error);
    return [];
  }
}

// ─── Attachments ─────────────────────────────────────────────────────────────
//
// Canonical model: "a file attached to a task" is an ASSOCIATION edge with the
// file as SOURCE (`user_file`) and the task as TARGET (`task`) — there is no
// dedicated attachments table anymore. Reads come from `get_task_associations`
// (which already aggregates the task's `files`), writes go through the
// `associationsService` chokepoint. The file itself lives in cloud-files under
// `Task Attachments/{taskId}/`, so users see every attachment grouped by task
// in the Files app.

/**
 * A file attached to a task. `id` and `file_path` are both the cloud-files
 * UUID — `getAttachmentUrl(file_path)` resolves it to a fresh signed URL.
 * Shape preserved from the legacy table so existing UI/serializers consume it
 * unchanged; it is now projected from the association edge.
 */
export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  file_path: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export async function getTaskAttachments(
  taskId: string,
): Promise<TaskAttachment[]> {
  try {
    // `get_task_associations` returns the task's attached files (the source
    // entities of `user_file → task` edges), joined to file metadata.
    const { data, error } = await supabase.rpc("get_task_associations", {
      p_task_id: taskId,
    });
    if (error) {
      console.error("Error fetching task attachments:", error.message);
      return [];
    }
    const bundle = (data ?? {}) as {
      files?: {
        id: string;
        filename: string;
        mime_type: string | null;
        storage_path: string;
        created_at: string;
      }[];
    };
    return (bundle.files ?? []).map((f) => ({
      id: f.id,
      task_id: taskId,
      file_name: f.filename,
      file_type: f.mime_type,
      file_size: null,
      file_path: f.id,
      uploaded_by: null,
      uploaded_at: f.created_at,
    }));
  } catch (error) {
    console.error("Exception fetching task attachments:", error);
    return [];
  }
}

/**
 * Upload a file and attach it to a task. The file lands in cloud-files under
 * `Task Attachments/{taskId}/`; the link is an association edge
 * (`user_file → task`) created through `associationsService`.
 */
export async function uploadTaskAttachment(
  taskId: string,
  file: File,
): Promise<TaskAttachment | null> {
  try {
    requireUserId();

    // Ensure the user-visible folder `Task Attachments/{taskId}` exists.
    const folderPath = folderForTask(taskId);
    try {
      await fileHandler.ensureFolderPath({
        folderPath,
        visibility: "private",
      });
    } catch (err) {
      console.error("Failed to ensure task attachments folder:", err);
    }

    let fileId: string;
    try {
      const normalized = await fileHandler.upload(
        { kind: "file", file },
        {
          folderPath,
          visibility: "private",
          metadata: {
            origin: "task-attachment",
            task_id: taskId,
          },
        },
      );
      if (!normalized.fileId) {
        throw new Error("Upload returned no fileId");
      }
      fileId = normalized.fileId;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Upload failed";
      console.error("Task attachment upload failed:", err);
      throw new Error(`Couldn't attach file: ${reason}`);
    }

    // Link file (source) → task (target) via the canonical association edge.
    const linked = await associationsService.add({
      sourceType: "user_file",
      sourceId: fileId,
      targetType: "task",
      targetId: taskId,
    });
    if (isScopesRpcErr(linked)) {
      console.error("Error linking attachment to task:", linked.error.message);
      // Best-effort cleanup of the orphaned cloud-files upload.
      try {
        await fileHandler.remove(fileId, { hard: false });
      } catch {
        /* best effort */
      }
      return null;
    }

    return {
      id: fileId,
      task_id: taskId,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      file_path: fileId,
      uploaded_by: requireUserId(),
      uploaded_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Exception uploading attachment:", error);
    return null;
  }
}

/**
 * Resolve an attachment's `file_path` (cloud-files UUID) to a URL that can be
 * opened in the browser. The handler auto-refreshes signed URLs before they
 * expire.
 */
export async function getAttachmentUrl(fileId: string): Promise<string> {
  try {
    return await fileHandler
      .use({ kind: "file_id", fileId })
      .as({ kind: "html_src" });
  } catch (err) {
    console.error("Error resolving cloud-files signed URL:", err);
    return "";
  }
}

/**
 * Detach a file from a task. Removes the `user_file → task` association edge
 * and soft-deletes the cloud-files row. `attachmentId` and `fileId` are the
 * same cloud-files UUID for canonical (association-backed) attachments.
 */
export async function deleteTaskAttachment(
  taskId: string,
  fileId: string,
): Promise<boolean> {
  try {
    // Drop the association edge (file → task).
    const unlinked = await associationsService.remove({
      sourceType: "user_file",
      sourceId: fileId,
      targetType: "task",
      targetId: taskId,
    });
    if (isScopesRpcErr(unlinked)) {
      console.error(
        "Error removing attachment association:",
        unlinked.error.message,
      );
      return false;
    }
    // Soft-delete the cloud-files row (best-effort; realtime reconciles).
    try {
      await fileHandler.remove(fileId, { hard: false });
    } catch (err) {
      console.error("cloud-files delete failed:", err);
    }
    return true;
  } catch (error) {
    console.error("Exception deleting attachment:", error);
    return false;
  }
}

// ─── Labels (stored in settings JSONB) ───────────────────────────────────────

export const TASK_LABEL_OPTIONS = [
  {
    value: "bug",
    label: "Bug",
    color: "bg-destructive/10 text-destructive",
  },
  {
    value: "feature",
    label: "Feature",
    color: "bg-primary/10 text-primary",
  },
  {
    value: "improvement",
    label: "Improvement",
    color: "bg-secondary/10 text-secondary",
  },
  {
    value: "docs",
    label: "Docs",
    color: "bg-info/10 text-info",
  },
  {
    value: "design",
    label: "Design",
    color: "bg-accent-2/10 text-accent-2",
  },
  {
    value: "research",
    label: "Research",
    color: "bg-warning/10 text-warning",
  },
  {
    value: "question",
    label: "Question",
    color: "bg-accent-3/10 text-accent-3",
  },
  {
    value: "blocked",
    label: "Blocked",
    color: "bg-destructive/15 text-destructive",
  },
] as const;

export type TaskLabel = (typeof TASK_LABEL_OPTIONS)[number]["value"];

export async function updateTaskLabels(
  taskId: string,
  labels: TaskLabel[],
): Promise<boolean> {
  try {
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .update({ settings: { labels } })
      .eq("id", taskId);
    if (error) {
      console.error("Error updating task labels:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Exception updating task labels:", error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single task by ID
 */
export async function getTaskById(
  taskId: string,
): Promise<DatabaseTask | null> {
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (error) {
      console.error("Error fetching task by ID:", error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Exception fetching task by ID:", error);
    return null;
  }
}

/**
 * Update a task
 */
export async function updateTask(
  taskId: string,
  updates: UpdateTaskInput,
): Promise<DatabaseTask | null> {
  try {
    // If assignee is changing, get the current task first for comparison
    let previousAssigneeId: string | null = null;
    if (updates.assignee_id !== undefined) {
      const { data: currentTask } = await workspaceDb(supabase)
        .from("tasks")
        .select("assignee_id")
        .eq("id", taskId)
        .single();
      previousAssigneeId = currentTask?.assignee_id || null;
    }

    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      console.error("Error updating task:", error.message);
      return null;
    }

    // Send assignment notification if assignee changed to someone new
    if (
      updates.assignee_id &&
      updates.assignee_id !== previousAssigneeId &&
      data
    ) {
      // Fire and forget - don't block the update on notification
      sendTaskAssignmentNotification(data).catch((err) => {
        console.error("Error sending task assignment notification:", err);
      });
    }

    return data;
  } catch (error) {
    console.error("Exception updating task:", error);
    return null;
  }
}

/**
 * Send task assignment notification (internal helper)
 */
async function sendTaskAssignmentNotification(
  task: DatabaseTask,
): Promise<void> {
  if (!task.assignee_id) return;

  try {
    await fetch("/api/notifications/task-assigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeId: task.assignee_id,
        taskTitle: task.title,
        taskId: task.id,
        taskDescription: task.description,
      }),
    });
  } catch (error) {
    console.error("Failed to send task assignment notification:", error);
  }
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<boolean> {
  try {
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      console.error("Error deleting task:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Exception deleting task:", error);
    return false;
  }
}

/**
 * Get subtasks for a specific task
 */
export async function getSubtasks(taskId: string): Promise<DatabaseTask[]> {
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .eq("parent_task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching subtasks:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception fetching subtasks:", error);
    return [];
  }
}

/**
 * Create a subtask for a parent task
 */
export async function createSubtask(
  parentTaskId: string,
  title: string,
  description?: string,
): Promise<DatabaseTask | null> {
  return createTask({
    title,
    description: description || null,
    parent_task_id: parentTaskId,
    status: "incomplete",
  });
}

/**
 * Update subtask completion status
 */
export async function updateSubtaskStatus(
  subtaskId: string,
  completed: boolean,
): Promise<boolean> {
  try {
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .update({ status: completed ? "completed" : "incomplete" })
      .eq("id", subtaskId);

    if (error) {
      console.error("Error updating subtask status:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Exception updating subtask status:", error);
    return false;
  }
}

/**
 * Delete a subtask
 */
export async function deleteSubtask(subtaskId: string): Promise<boolean> {
  return deleteTask(subtaskId);
}

/**
 * Get tasks explicitly shared with the current user via direct permission grants.
 * Does not include tasks accessible via project/workspace/org hierarchy —
 * those appear automatically in the normal task queries via RLS.
 *
 * Uses the shared permissions service to get grant IDs, then fetches full rows.
 * RLS on tasks ensures only currently-accessible rows are returned.
 */
export async function getSharedWithMeTasks(): Promise<DatabaseTask[]> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return [];

    const grants = await getSharedWithMe("task");
    if (grants.length === 0) return [];

    const taskIds = grants.map((g) => g.resourceId);

    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .in("id", taskIds)
      .neq("created_by", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching shared tasks:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception fetching shared tasks:", error);
    return [];
  }
}

// ============================================================================
// Task-specific Sharing Helpers (wrap the universal Phase 1 RPCs)
// ============================================================================

export interface ResourcePermission {
  id: string;
  resource_id: string;
  resource_type: string;
  granted_to_user_id: string;
  granted_to_user: unknown;
  granted_to_organization_id: string;
  granted_to_organization: unknown;
  permission_level: string;
  is_public: boolean;
  created_at: string;
}
type _CheckResourcePermission =
  ResourcePermission extends DbRpcRow<"get_resource_permissions">
    ? true
    : false;
declare const _resourcePermission: _CheckResourcePermission;
true satisfies typeof _resourcePermission;

export interface TaskShareResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Share a task with a specific user.
 * Wraps share_resource_with_user() — ownership validated server-side.
 */
export async function shareTask(
  taskId: string,
  targetUserId: string,
  level: "viewer" | "editor" | "admin" = "viewer",
): Promise<TaskShareResult> {
  const { data, error } = await supabase.rpc("share_resource_with_user", {
    // Canonical resource_type is 'task' (singular) — matches DB shareable_resource_registry.
    p_resource_type: "task",
    p_resource_id: taskId,
    p_target_user_id: targetUserId,
    p_permission_level: level,
  });
  if (error) return { success: false, error: error.message };
  const result = data as unknown as TaskShareResult;
  return {
    success: result?.success ?? false,
    message: result?.message,
    error: result?.error,
  };
}

/**
 * Make a task publicly accessible (sets visibility = 'public' on the task row).
 */
export async function makeTaskPublic(taskId: string): Promise<TaskShareResult> {
  const { data, error } = await supabase.rpc("make_resource_public", {
    // Canonical resource_type is 'task' (singular).
    p_resource_type: "task",
    p_resource_id: taskId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as unknown as TaskShareResult;
  return {
    success: result?.success ?? false,
    message: result?.message,
    error: result?.error,
  };
}

/**
 * Make a task private (sets visibility = 'private' on the task row).
 */
export async function makeTaskPrivate(
  taskId: string,
): Promise<TaskShareResult> {
  const { data, error } = await supabase.rpc("make_resource_private", {
    // Canonical resource_type is 'task' (singular).
    p_resource_type: "task",
    p_resource_id: taskId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as unknown as TaskShareResult;
  return {
    success: result?.success ?? false,
    message: result?.message,
    error: result?.error,
  };
}

/**
 * Revoke a user's access to a task.
 * Wraps revoke_resource_access() — ownership validated server-side.
 */
export async function revokeTaskAccess(
  taskId: string,
  targetUserId: string,
): Promise<TaskShareResult> {
  const { data, error } = await supabase.rpc("revoke_resource_access", {
    p_resource_type: "task",
    p_resource_id: taskId,
    p_target_user_id: targetUserId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as unknown as TaskShareResult;
  return {
    success: result?.success ?? false,
    message: result?.message,
    error: result?.error,
  };
}

/**
 * Get all permissions for a task (owner-only).
 * Uses get_resource_permissions() SECURITY DEFINER RPC.
 */
export async function getTaskPermissions(taskId: string) {
  const { data, error } = await supabase.rpc("get_resource_permissions", {
    p_resource_type: "task",
    p_resource_id: taskId,
  });
  if (error) {
    console.error("Error fetching task permissions:", error.message);
    return [];
  }
  return (data as unknown as ResourcePermission[]) || [];
}

/**
 * Get comments for a task.
 *
 * Backed by the canonical comments primitive (`platform.comments`) via the
 * `commentsService` chokepoint — entity_type='task'. Returns clean `Comment`
 * rows (oldest→newest, threaded via `parentId`).
 */
export async function getTaskComments(taskId: string): Promise<Comment[]> {
  const res = await commentsService.listForEntity("task", taskId);
  if (isScopesRpcErr(res)) {
    console.error("Error fetching task comments:", res.error.message);
    return [];
  }
  return res.data.comments;
}

/**
 * Create a comment on a task.
 *
 * Writes through `commentsService` (entity_type='task'); the RPC resolves the
 * org from the task. Re-reads the created comment so the caller gets the full
 * `Comment` (with author) back, matching the list shape.
 */
export async function createTaskComment(
  taskId: string,
  content: string,
  parentId?: string | null,
): Promise<Comment | null> {
  const added = await commentsService.add({
    entityType: "task",
    entityId: taskId,
    body: content,
    parentId: parentId ?? null,
  });
  if (isScopesRpcErr(added)) {
    console.error("Error creating task comment:", added.error.message);
    return null;
  }
  const newId = added.data.id;

  // Send comment notification to task owner (fire-and-forget).
  sendTaskCommentNotification(taskId, content).catch((err) => {
    console.error("Error sending comment notification:", err);
  });

  // Re-read the thread to return the freshly-created comment with its author.
  const list = await commentsService.listForEntity("task", taskId);
  if (isScopesRpcErr(list)) return null;
  return list.data.comments.find((c) => c.id === newId) ?? null;
}

/**
 * Send task comment notification (internal helper)
 */
async function sendTaskCommentNotification(
  taskId: string,
  commentText: string,
): Promise<void> {
  try {
    // Get the task to find the owner
    const { data: task } = await workspaceDb(supabase)
      .from("tasks")
      .select("id, title, created_by")
      .eq("id", taskId)
      .single();

    if (!task?.created_by) return;

    await fetch("/api/notifications/comment-added", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceOwnerId: task.created_by,
        commentText,
        resourceTitle: task.title,
        resourceType: "task",
        resourceId: task.id,
      }),
    });
  } catch (error) {
    console.error("Failed to send comment notification:", error);
  }
}
