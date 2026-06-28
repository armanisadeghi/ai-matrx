import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendCommentNotificationEmail } from "@/lib/email/notificationService";

/**
 * POST /api/notifications/comment-added
 * Send comment notification email
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
    const {
      resourceOwnerId,
      commentText,
      resourceTitle,
      resourceType,
      resourceId,
    } = body;

    if (
      !resourceOwnerId ||
      !commentText ||
      !resourceTitle ||
      !resourceType ||
      !resourceId
    ) {
      return NextResponse.json(
        {
          success: false,
          msg: "resourceOwnerId, commentText, resourceTitle, resourceType, and resourceId are required",
        },
        { status: 400 },
      );
    }

    // Don't send notification if commenting on your own resource
    if (resourceOwnerId === user.id) {
      return NextResponse.json({
        success: true,
        msg: "Self-comment, no notification needed",
        skipped: true,
      });
    }

    // Get commenter's name
    const { data: commenterProfile } = await supabase
      .schema("users").from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const commenterName =
      commenterProfile?.display_name ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) ||
      "Someone";

    const result = await sendCommentNotificationEmail({
      resourceOwnerId,
      commenterName,
      commentText,
      resourceTitle,
      resourceType,
      resourceId,
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
    console.error("Error in POST /api/notifications/comment-added:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send notification" },
      { status: 500 },
    );
  }
}
