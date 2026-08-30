// features/tasks/services/taskCommentNotification.ts
//
// Fire-and-forget "someone commented on your task" notification. Moved out of
// taskService when the comment WRITE path moved into `@ai-matrx/associations`
// (W6 host adoption, 2026-08-30): every comment post — CommentThread's
// composer included — now goes through the package's `cmt_add` chokepoint,
// so the notification rides the host dataSource's cmt_add tap in
// features/scopes/host/associationsStore.ts (the ONE seam every package
// write crosses), not a per-composer helper. Standalone module (no
// taskService import) so the host wiring's dynamic import cannot cycle.

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";

/** Notify the task owner of a new comment. Never throws; logs on failure. */
export async function sendTaskCommentNotification(
  taskId: string,
  commentText: string,
): Promise<void> {
  try {
    // Get the task to find the owner
    const { data: task } = await workspaceDb(supabase)
      .from("tasks")
      .select("id, title, created_by")
      .is("deleted_at", null)
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
