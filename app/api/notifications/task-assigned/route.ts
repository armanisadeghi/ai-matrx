import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendTaskAssignmentEmail } from "@/lib/email/notificationService";
import { sendDm } from "@/lib/services/system-dm";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { createAdminClient } from "@/utils/supabase/adminClient";
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

    if (assigneeId === user.id) {
      return NextResponse.json({
        success: true,
        msg: "Self-assignment, no notification needed",
        skipped: true,
      });
    }

    // This route remains the actionable DM producer during the email cutover.
    // The database activation marker is written only after this compatibility
    // code is live. A saved outbox row wins even if the activation occurred
    // while the task write was finishing; older writes keep the email fallback.
    const admin = createAdminClient();
    const { data: eventType, error: eventError } = await admin
      .schema("communication").from("notification_event_type")
      .select("config")
      .eq("event_key", "task.assigned")
      .maybeSingle();
    if (eventError) {
      console.error("[task-assigned] event read failed:", eventError);
      return NextResponse.json({ success: false, msg: "Could not verify assignment email" }, { status: 503 });
    }
    const eventConfig = eventType?.config;
    const configValues: Record<string, unknown> | null = eventConfig &&
      typeof eventConfig === "object" && !Array.isArray(eventConfig)
        ? eventConfig as Record<string, unknown>
        : null;
    const cutoverAt = configValues?.assignment_outbox_active === true &&
      typeof configValues.assignment_outbox_activated_at === "string"
        ? Date.parse(configValues.assignment_outbox_activated_at)
        : NaN;
    const outboxActive = Number.isFinite(cutoverAt);
    let outboxOwnsEmail = false;
    if (outboxActive) {
      const { data: notice, error: noticeError } = await admin
        .schema("communication").from("notification")
        .select("id")
        .eq("organization_id", taskRow.organization_id)
        .eq("dedupe_key", `task.assigned:${taskId}:${taskVersion}:email`)
        .maybeSingle();
      if (noticeError) {
        console.error("[task-assigned] outbox read failed:", noticeError);
        return NextResponse.json({ success: false, msg: "Could not verify assignment email" }, { status: 503 });
      }
      outboxOwnsEmail = Boolean(notice) || Date.parse(taskRow.updated_at) >= cutoverAt;
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
    const emailDelivery: Promise<Awaited<ReturnType<typeof sendTaskAssignmentEmail>>> =
      outboxOwnsEmail ? Promise.resolve({
        success: true,
        skipped: true,
        message: "Assignment email handled by the notification outbox",
      }) : sendTaskAssignmentEmail({
        assigneeId,
        organizationId: taskRow.organization_id,
        assignerName,
        taskTitle,
        taskId,
        taskDescription,
      });
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
      emailDelivery,
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
