/**
 * Review-message notice.
 *
 * Delivers the canonical stored review message through the notification spine.
 * The caller supplies only the message ID; feedback ownership, sender identity,
 * and message content are derived from the database after authentication.
 *
 * - An admin's message to the reporter → `feedback.review_requested` (email +
 *   the paired DM, sent as the admin).
 * - The reporter's reply → `feedback.user_replied`, to the operator inbox
 *   (`ADMIN_EMAIL`), with the DM when that inbox belongs to an account.
 *
 * POST /api/feedback/user-review-notify
 * Body: { message_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  accountEmail,
  legacyEmailOptOut,
  notifyFromSql,
  preview,
  userIdForEmail,
  type NotifyFromSqlResult,
} from "@/lib/notifications/notifyFromSql";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await getClaimsUser(supabase);

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "User not authenticated" },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const messageId =
      typeof body === "object" &&
      body !== null &&
      "message_id" in body &&
      typeof body.message_id === "string"
        ? body.message_id
        : null;

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "message_id is required" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: storedMessage, error: messageError } = await admin
      .schema("users")
      .from("feedback_user_messages")
      .select(
        "id, feedback_id, content, sender_type, sender_name, email_sent",
      )
      .eq("id", messageId)
      .single();

    if (
      messageError ||
      !storedMessage ||
      !storedMessage.id ||
      !storedMessage.feedback_id ||
      storedMessage.content === null
    ) {
      return NextResponse.json(
        { success: false, error: "Review message not found" },
        { status: 404 },
      );
    }

    if (storedMessage.email_sent) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Message was already emailed",
      });
    }

    const { data: feedback, error: feedbackError } = await admin
      .schema("users")
      .from("user_feedback")
      .select(
        "id, user_id, created_by, username, feedback_type, description, deleted_at, organization_id",
      )
      .eq("id", storedMessage.feedback_id)
      .is("deleted_at", null)
      .single();

    if (feedbackError || !feedback) {
      return NextResponse.json(
        { success: false, error: "Feedback item not found" },
        { status: 404 },
      );
    }

    const isAdmin = await hasAdminPower(supabase, user.id, "any");
    const isOwner =
      feedback.user_id === user.id || feedback.created_by === user.id;
    const isStoredAdminMessage = storedMessage.sender_type === "admin";
    const isStoredUserMessage = storedMessage.sender_type === "user";

    if (
      (!isStoredAdminMessage && !isStoredUserMessage) ||
      (isStoredAdminMessage && !isAdmin) ||
      (isStoredUserMessage && !isOwner)
    ) {
      return NextResponse.json(
        { success: false, error: "Not authorized to send this notification" },
        { status: 403 },
      );
    }

    if (!feedback.organization_id) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "This feedback item is not filed under an organization",
      });
    }

    const description = preview(String(feedback.description), 150);
    let result: NotifyFromSqlResult;

    if (isStoredAdminMessage) {
      if (!feedback.user_id) {
        return NextResponse.json(
          { success: false, error: "Feedback item has no reporter" },
          { status: 404 },
        );
      }
      const recipientEmail = await accountEmail(admin, feedback.user_id);
      result = await notifyFromSql(admin, {
        organizationId: feedback.organization_id,
        eventKey: "feedback.review_requested",
        recipientUserId: feedback.user_id,
        toAddress: recipientEmail,
        payload: {
          feedback: {
            type: String(feedback.feedback_type),
            username: feedback.username || recipientEmail || "there",
            description,
          },
          message: {
            sender: storedMessage.sender_name || "Admin",
            text: storedMessage.content,
          },
        },
        deepLink: "/user-settings/feedback",
        targetKind: "feedback",
        targetId: feedback.id,
        dedupeKey: `feedback.review_requested:${storedMessage.id}`,
        dm: { sender_user_id: user.id },
        optedOut: await legacyEmailOptOut(
          admin,
          feedback.user_id,
          "feedback_notifications",
        ),
      });
    } else {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
      if (!adminEmail) {
        console.warn("No admin email configured");
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: "No admin email configured",
        });
      }
      result = await notifyFromSql(admin, {
        organizationId: feedback.organization_id,
        eventKey: "feedback.user_replied",
        recipientUserId: await userIdForEmail(admin, adminEmail),
        toAddress: adminEmail,
        recipientLabel: "Feedback admin",
        payload: {
          feedback: {
            type: String(feedback.feedback_type),
            description,
          },
          message: {
            sender: feedback.username || storedMessage.sender_name || "User",
            text: storedMessage.content,
          },
        },
        deepLink: "/administration/users/feedback",
        targetKind: "feedback",
        targetId: feedback.id,
        dedupeKey: `feedback.user_replied:${storedMessage.id}`,
        dm: { sender_user_id: user.id },
      });
    }

    if (result.queued.length === 0) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        queued: result.queued,
        skipped: result.skipped,
        say: result.say,
      });
    }

    const { error: markError } = await admin.rpc("mark_user_message_emailed", {
      p_message_id: storedMessage.id,
    });
    if (markError) {
      console.error("Failed to mark review message as emailed:", markError);
      return NextResponse.json(
        { success: false, error: "The notice is on its way, but its delivery state was not saved" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      emailSent: result.queued.includes("email"),
      queued: result.queued,
      skipped: result.skipped,
      say: result.say,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to send notification";
    console.error("Error in POST /api/feedback/user-review-notify:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
