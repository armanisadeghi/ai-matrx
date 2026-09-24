import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendTaskAssignmentEmail } from "@/lib/email/notificationService";
import { sendDm } from "@/lib/services/system-dm";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { z } from "zod";

const assignmentNoticeRequest = z.object({
  taskId: z.string().uuid(),
  taskVersion: z.number().int().nonnegative(),
});

/**
 * POST /api/notifications/task-assigned
 * Send task assignment notification email
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    const parsed = assignmentNoticeRequest.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          msg: "A task ID and the saved task version are required",
        },
        { status: 400 },
      );
    }
    const { taskId, taskVersion } = parsed.data;

    // This signed-in read is governed by task RLS. The request supplies an
    // identity for the saved change, never the recipient or words to send.
    const { data: taskRow, error: taskError } = await supabase
      .schema("workspace").from("tasks")
      .select("id, assignee_id, title, description, organization_id, updated_by, updated_at, version")
      .eq("id", taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (taskError) {
      console.error("[task-assigned] task read failed:", taskError);
      return NextResponse.json({ success: false, msg: "Could not verify task assignment" }, { status: 503 });
    }
    if (!taskRow) {
      return NextResponse.json({ success: false, msg: "Task not found" }, { status: 404 });
    }
    if (!taskRow.organization_id || !taskRow.assignee_id) {
      return NextResponse.json({ success: false, msg: "Task has no notification destination" }, { status: 409 });
    }
    // This bounds the legacy post-write route to the caller's recent saved
    // task version. It cannot prove an assignee transition or dedupe replays;
    // those require a transactional assignment event in the shared outbox.
    const ageMs = Date.now() - Date.parse(taskRow.updated_at);
    if (taskRow.version !== taskVersion ||
        taskRow.updated_by !== user.id ||
        !Number.isFinite(ageMs) || ageMs < 0 || ageMs > 5 * 60_000) {
      return NextResponse.json(
        { success: false, msg: "This is not the user's recent saved task version" },
        { status: 409 },
      );
    }

    const assigneeId = taskRow.assignee_id;
    const taskTitle = taskRow.title;
    const taskDescription = taskRow.description ?? undefined;

    // Don't send notification if assigning to yourself
    if (assigneeId === user.id) {
      return NextResponse.json({
        success: true,
        msg: "Self-assignment, no notification needed",
        skipped: true,
      });
    }

    // Get assigner's name
    const { data: assignerProfile } = await supabase
      .schema("users").from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const assignerName =
      assignerProfile?.display_name ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) ||
      "Someone";

    // In-app DM (actionable: Open / Complete / Snooze) + email, in parallel.
    // Both best-effort; the assignment itself already succeeded.
    const [dmResult, result] = await Promise.all([
      sendDm({
        senderId: user.id,
        recipientId: assigneeId,
        organizationId: taskRow.organization_id,
        content: `${assignerName} assigned you a task: ${taskTitle}`,
        actionData: {
          kind: "task_reminder",
          payload: { task_id: taskId, title: taskTitle },
        },
      }),
      sendTaskAssignmentEmail({
        assigneeId,
        organizationId: taskRow.organization_id,
        assignerName,
        taskTitle,
        taskId,
        taskDescription,
      }),
    ]);
    if (!dmResult.ok && dmResult.error !== "self") {
      console.error("[task-assigned] DM failed:", dmResult.error);
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        msg: result.message,
        skipped: result.skipped,
      });
    }

    return NextResponse.json(
      { success: false, msg: result.message, error: result.error },
      { status: 500 },
    );
  } catch (error) {
    console.error("Error in POST /api/notifications/task-assigned:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send notification" },
      { status: 500 },
    );
  }
}
