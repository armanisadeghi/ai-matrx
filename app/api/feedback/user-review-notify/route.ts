/**
 * User Review Notification API Route
 *
 * Sends the canonical stored review message by email. The caller supplies only
 * the message ID; feedback ownership, sender identity, and message content are
 * derived from the database after authentication.
 *
 * POST /api/feedback/user-review-notify
 * Body: { message_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";
import { sendEmail, emailTemplates } from "@/lib/email/client";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
// 🚨 THE ONE HELPER. Never build `?org=` by hand — the rule lives once, in the
// database, where the notice/assist/DM triggers read it too.
import { linkCarriesItsOrganization } from "@/lib/organizations/linkCarriesItsOrganization";

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

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";

    if (isStoredAdminMessage) {
      const { data: prefs } = await admin
        .schema("users")
        .from("user_email_preferences")
        .select("feedback_notifications")
        .eq("user_id", feedback.user_id)
        .maybeSingle();

      if (prefs?.feedback_notifications === false) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: "User has disabled feedback notifications",
        });
      }

      const { data: recipient, error: recipientError } =
        await admin.auth.admin.getUserById(feedback.user_id);
      const recipientEmail = recipient.user?.email;

      if (recipientError || !recipientEmail) {
        return NextResponse.json(
          { success: false, error: "User email not found" },
          { status: 404 },
        );
      }

      const emailContent = emailTemplates.feedbackUserReviewMessage(
        feedback.username || recipientEmail,
        feedback.feedback_type,
        feedback.description,
        storedMessage.content,
        storedMessage.sender_name || "Admin",
        // /settings is declared organization-free in
        // platform.organization_free_link_prefixes() — account settings are about the
        // person — so this comes back unchanged. It goes through the helper anyway, so
        // the day that ruling changes this link follows it without an edit here.
        await linkCarriesItsOrganization(
          `${siteUrl}/settings/feedback`,
          feedback.organization_id,
        ),
      );
      const emailResult = await sendEmail({
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      if (!emailResult.success) {
        console.error(
          "Failed to send user review notification:",
          emailResult.error,
        );
        return NextResponse.json(
          { success: false, error: "Failed to send email" },
          { status: 500 },
        );
      }
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

      const emailContent = emailTemplates.feedbackUserReply(
        "Admin",
        feedback.feedback_type,
        feedback.description,
        storedMessage.content,
        feedback.username || storedMessage.sender_name || "User",
        await linkCarriesItsOrganization(
          `${siteUrl}/administration/users/feedback`,
          feedback.organization_id,
        ),
      );
      const emailResult = await sendEmail({
        to: adminEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      if (!emailResult.success) {
        console.error("Failed to send admin notification:", emailResult.error);
        return NextResponse.json(
          { success: false, error: "Failed to send email" },
          { status: 500 },
        );
      }
    }

    const { error: markError } = await admin.rpc("mark_user_message_emailed", {
      p_message_id: storedMessage.id,
    });
    if (markError) {
      console.error("Failed to mark review message as emailed:", markError);
      return NextResponse.json(
        { success: false, error: "Email sent, but delivery state was not saved" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, emailSent: true });
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
