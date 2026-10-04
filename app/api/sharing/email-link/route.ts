import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { notifyFromSql } from "@/lib/notifications/notifyFromSql";

/**
 * POST /api/sharing/email-link
 * Send a share link to the current user — through the notification spine
 * (`share.link_saved`): email plus the paired DM, so the link is also waiting in
 * their AI Matrx inbox.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);

    if (!user?.email) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized or no email on account" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { resourceType, resourceName, shareUrl, message, organizationId } = body;

    if (!resourceType || !resourceName || !shareUrl) {
      return NextResponse.json(
        { success: false, msg: "resourceType, resourceName, and shareUrl are required" },
        { status: 400 }
      );
    }
    if (!isRfc4122Uuid(organizationId)) {
      return NextResponse.json(
        { success: false, msg: "Pick an organization first" },
        { status: 400 }
      );
    }
    let url: URL;
    try {
      url = new URL(String(shareUrl));
    } catch {
      return NextResponse.json(
        { success: false, msg: "shareUrl is not a link" },
        { status: 400 }
      );
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return NextResponse.json(
        { success: false, msg: "shareUrl is not a web link" },
        { status: 400 }
      );
    }

    const note = typeof message === "string" ? message.trim() : "";
    const result = await notifyFromSql(createAdminClient(), {
      organizationId,
      eventKey: "share.link_saved",
      recipientUserId: user.id,
      toAddress: user.email,
      payload: {
        saved: {
          resource_type: String(resourceType),
          resource_name: String(resourceName),
          note_line: note || "No note.",
          url: url.toString(),
        },
      },
    });

    if (result.queued.length > 0) {
      return NextResponse.json({
        success: true,
        msg: result.say,
        queued: result.queued,
        skipped: result.skipped,
      });
    }

    return NextResponse.json(
      { success: false, msg: result.say, skipped: result.skipped },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error in POST /api/sharing/email-link:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send email" },
      { status: 500 }
    );
  }
}
