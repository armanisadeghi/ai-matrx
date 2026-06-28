import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendTaskAssignmentEmail } from "@/lib/email/notificationService";

/**
 * POST /api/notifications/task-assigned
 * Send task assignment notification email
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { assigneeId, taskTitle, taskId, taskDescription } = body;

    if (!assigneeId || !taskTitle || !taskId) {
      return NextResponse.json(
        {
          success: false,
          msg: "assigneeId, taskTitle, and taskId are required",
        },
        { status: 400 },
      );
    }

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
      .schema("users")
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const assignerName =
      assignerProfile?.display_name ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) ||
      "Someone";

    const result = await sendTaskAssignmentEmail({
      assigneeId,
      assignerName,
      taskTitle,
      taskId,
      taskDescription,
    });

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
