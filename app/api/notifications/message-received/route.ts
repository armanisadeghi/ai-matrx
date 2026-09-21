import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendMessageNotificationEmail } from "@/lib/email/notificationService";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * POST /api/notifications/message-received
 * Send message notification email (for offline users)
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

    const body = await request.json();
    const { recipientId, messagePreview, conversationId } = body;

    if (!recipientId || !messagePreview || !conversationId) {
      return NextResponse.json(
        {
          success: false,
          msg: "recipientId, messagePreview, and conversationId are required",
        },
        { status: 400 },
      );
    }

    // Don't send notification to yourself
    if (recipientId === user.id) {
      return NextResponse.json({
        success: true,
        msg: "Self-message, no notification needed",
        skipped: true,
      });
    }

    // Get sender's name
    const { data: senderProfile } = await supabase
      .schema("users").from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const senderName =
      senderProfile?.display_name ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) ||
      "Someone";

    const result = await sendMessageNotificationEmail({
      recipientId,
      senderName,
      messagePreview,
      conversationId,
      // A DM thread is account-level: `/messages` is declared organization-free in
      // platform.organization_free_link_prefixes(), so there is no organization to
      // name and none is invented. The helper is still what decides, one call down.
      organizationId: null,
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
    console.error("Error in POST /api/notifications/message-received:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send notification" },
      { status: 500 },
    );
  }
}
