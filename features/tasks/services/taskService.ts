// Task service for database operations
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { getSharedWithMe } from "@/utils/permissions/service";
import type { DbRpcRow } from "@/types/supabase-rpc";
import type { DatabaseTask } from "../types";
import * as FilesApi from "@/features/files/api";
import {
  deleteFile as cloudDeleteFile,
  uploadFiles as cloudUploadFiles,
} from "@/features/files/redux/thunks";
import { ensureFolderPath } from "@/features/files/redux/thunks";
import { folderForTask } from "@/features/files/utils/folder-conventions";
import { getStore } from "@/lib/redux/store-singleton";
// Type-only import — does not introduce a runtime cycle through store-singleton.
import type { AppDispatch } from "@/lib/redux/store";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  assignee_id?: string | null;
  status?: "incomplete" | "completed";
  user_id?: string | null;
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
  user_id?: string | null;
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
    const { data, error } = await supabase
      .from("ctx_tasks")
      .insert({
        title: input.title,
        description: input.description || null,
        project_id: input.project_id || null,
        parent_task_id: input.parent_task_id || null,
        due_date: input.due_date || null,
        priority: input.priority || null,
        assignee_id: input.assignee_id || null,
        status: input.status || "incomplete",
        user_id: userId,
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
    const { data, error } = await supabase
      .from("ctx_tasks")
      .select("*")
      .eq("user_id", userId)
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
    const { data, error } = await supabase
      .from("ctx_tasks")
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

// ─── Attachments ─────────────────────────────────────────────────────────────

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
    const { data, error } = await supabase
      .from("ctx_task_attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("uploaded_at", { ascending: true });
    if (error) {
      console.error("Error fetching task attachments:", error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error("Exception fetching task attachments:", error);
    return [];
  }
}

/**
 * Upload a task attachment. Migrated to cloud-files in Phase 9 — the file
 * now lives under `Task Attachments/{taskId}/` in the user's cloud-files
 * tree, so they can open the Files app and see every attachment grouped by
 * task. The attachment row's `file_path` column stores the cloud-files
 * UUID (not a storage path) — use `getAttachmentUrl(filePath)` to resolve
 * to a fresh signed URL when opening.
 *
 * UUID regex check in `isCloudFileId` below decides whether a given
 * `file_path` is a new-format cloud-files id or a legacy storage path.
 * Legacy rows continue working against the old system until they're
 * migrated or deleted — see features/files/migration/INVENTORY.md.
 */
export async function uploadTaskAttachment(
  taskId: string,
  file: File,
): Promise<TaskAttachment | null> {
  try {
    const userId = requireUserId();
    const store = getStore();
    if (!store) {
      console.error("Redux store not ready for upload");
      return null;
    }
    // store-singleton intentionally types dispatch loosely (EnhancedStore<any,any,any>)
    // to stay cycle-free; recover the thunk-aware Promise so `.unwrap()` resolves.
    const dispatch = store.dispatch as AppDispatch;

    // Ensure the user-visible folder `Task Attachments/{taskId}` exists.
    let parentFolderId: string | null = null;
    try {
      parentFolderId = await dispatch(
        ensureFolderPath({
          folderPath: folderForTask(taskId),
          visibility: "private",
        }),
      ).unwrap();
    } catch (err) {
      console.error("Failed to ensure task attachments folder:", err);
    }

    const { uploaded, failed } = await dispatch(
      cloudUploadFiles({
        files: [file],
        parentFolderId,
        visibility: "private",
        metadata: {
          origin: "task-attachment",
          task_id: taskId,
        },
        concurrency: 1,
      }),
    ).unwrap();

    if (failed.length > 0 || uploaded.length === 0) {
      // `failed` is `Array<{name, error}>` since 2026-04-24 — extract the
      // real backend error so callers can surface it to the user instead
      // of seeing a silent null return.
      const reason = failed[0]?.error ?? "Upload failed";
      console.error("Task attachment upload failed:", failed);
      throw new Error(`Couldn't attach file: ${reason}`);
    }
    const fileId = uploaded[0];

    const { data, error: insertError } = await supabase
      .from("ctx_task_attachments")
      .insert({
        task_id: taskId,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        // Store the cloud-files UUID here. `getAttachmentUrl` detects this
        // format and hits the cloud-files signed-URL endpoint.
        file_path: fileId,
        uploaded_by: userId,
      })
      .select()
      .single();
    if (insertError) {
      console.error("Error recording attachment:", insertError.message);
      // Best-effort cleanup of the orphaned cloud-files upload.
      try {
        await dispatch(cloudDeleteFile({ fileId, hardDelete: false })).unwrap();
      } catch {
        /* best effort */
      }
      return null;
    }
    return data;
  } catch (error) {
    console.error("Exception uploading attachment:", error);
    return null;
  }
}

/**
 * Resolve an attachment's `file_path` column to a URL that can be opened in
 * the browser. The handler auto-refreshes signed URLs before they expire.
 */
export async function getAttachmentUrl(fileId: string): Promise<string> {
  try {
    const { data } = await FilesApi.Files.getSignedUrl(fileId, {
      expiresIn: 3600,
    });
    return data.url;
  } catch (err) {
    console.error("Error resolving cloud-files signed URL:", err);
    return "";
  }
}

export async function deleteTaskAttachment(
  attachmentId: string,
  fileId: string,
): Promise<boolean> {
  try {
    const store = getStore();
    if (store) {
      try {
        const dispatch = store.dispatch as AppDispatch;
        await dispatch(
          cloudDeleteFile({ fileId, hardDelete: false }),
        ).unwrap();
      } catch (err) {
        console.error("cloud-files delete failed:", err);
      }
    }
    const { error } = await supabase
      .from("ctx_task_attachments")
      .delete()
      .eq("id", attachmentId);
    if (error) {
      console.error("Error deleting attachment record:", error.message);
      return false;
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
    color: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  },
  {
    value: "feature",
    label: "Feature",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  },
  {
    value: "improvement",
    label: "Improvement",
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
  },
  {
    value: "docs",
    label: "Docs",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400",
  },
  {
    value: "design",
    label: "Design",
    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400",
  },
  {
    value: "research",
    label: "Research",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  },
  {
    value: "question",
    label: "Question",
    color:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400",
  },
  {
    value: "blocked",
    label: "Blocked",
    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-400",
  },
] as const;

export type TaskLabel = (typeof TASK_LABEL_OPTIONS)[number]["value"];

export async function updateTaskLabels(
  taskId: string,
  labels: TaskLabel[],
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("ctx_tasks")
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
    const { data, error } = await supabase
      .from("ctx_tasks")
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
      const { data: currentTask } = await supabase
        .from("ctx_tasks")
        .select("assignee_id")
        .eq("id", taskId)
        .single();
      previousAssigneeId = currentTask?.assignee_id || null;
    }

    const { data, error } = await supabase
      .from("ctx_tasks")
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
    const { error } = await supabase
      .from("ctx_tasks")
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
    const { data, error } = await supabase
      .from("ctx_tasks")
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
    const { error } = await supabase
      .from("ctx_tasks")
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

    const { data, error } = await supabase
      .from("ctx_tasks")
      .select("*")
      .in("id", taskIds)
      .neq("user_id", user.id)
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
    p_resource_type: "tasks",
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
 * Make a task publicly accessible (sets is_public = true on the task row).
 */
export async function makeTaskPublic(taskId: string): Promise<TaskShareResult> {
  const { data, error } = await supabase.rpc("make_resource_public", {
    p_resource_type: "tasks",
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
 * Make a task private (sets is_public = false on the task row).
 */
export async function makeTaskPrivate(
  taskId: string,
): Promise<TaskShareResult> {
  const { data, error } = await supabase.rpc("make_resource_private", {
    p_resource_type: "tasks",
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
    p_resource_type: "tasks",
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
    p_resource_type: "tasks",
    p_resource_id: taskId,
  });
  if (error) {
    console.error("Error fetching task permissions:", error.message);
    return [];
  }
  return (data as unknown as ResourcePermission[]) || [];
}

/**
 * Get comments for a task
 */
export async function getTaskComments(taskId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from("ctx_task_comments")
      .select(
        `
        id,
        content,
        created_at,
        updated_at,
        user_id
      `,
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching task comments:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception fetching task comments:", error);
    return [];
  }
}

/**
 * Create a comment on a task
 */
export async function createTaskComment(
  taskId: string,
  content: string,
): Promise<any | null> {
  try {
    const userId = requireUserId();
    const { data, error } = await supabase
      .from("ctx_task_comments")
      .insert({
        task_id: taskId,
        user_id: userId,
        content,
      })
      .select(
        `
        id,
        content,
        created_at,
        updated_at,
        user_id
      `,
      )
      .single();

    if (error) {
      console.error("Error creating task comment:", error.message);
      return null;
    }

    // Send comment notification to task owner
    if (data) {
      sendTaskCommentNotification(taskId, content).catch((err) => {
        console.error("Error sending comment notification:", err);
      });
    }

    return data;
  } catch (error) {
    console.error("Exception creating task comment:", error);
    return null;
  }
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
    const { data: task } = await supabase
      .from("ctx_tasks")
      .select("id, title, user_id")
      .eq("id", taskId)
      .single();

    if (!task?.user_id) return;

    await fetch("/api/notifications/comment-added", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceOwnerId: task.user_id,
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
