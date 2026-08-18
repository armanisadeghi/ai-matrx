/**
 * Class Invitation Email Route (email-only) — the class twin of
 * /api/organizations/invite, on the SAME canonical invitation system.
 *
 * The invitation ROW is created on the client via `inv_create`
 * (invitationsService, target_type='scope'). This route accepts only an
 * invitation id: the caller-scoped `inv_get_managed` RPC proves the caller
 * manages the invitation (class owner / org admin) and supplies the stored
 * recipient/token, and the class name comes from the owner-readable
 * `edu_class_state` RPC. An email failure never fails the request — the
 * invitation row already exists and its link can be copied from the UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/email/client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "User not authenticated" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { invitationId } = body;
    const isUuid =
      typeof invitationId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        invitationId,
      );
    if (!isUuid) {
      return NextResponse.json(
        { success: false, error: "A valid invitationId is required" },
        { status: 400 },
      );
    }

    const { data: invitation, error: invitationError } = await supabase.rpc(
      "inv_get_managed",
      { p_invitation_id: invitationId },
    );
    if (invitationError || !invitation || invitation.target_type !== "scope") {
      return NextResponse.json(
        { success: false, error: "Invitation not found or not manageable" },
        { status: 403 },
      );
    }
    const recipientEmail = invitation.email;
    const invitationToken = invitation.token;
    if (!recipientEmail || !invitationToken) {
      return NextResponse.json(
        { success: false, error: "Invitation recipient or token is missing" },
        { status: 500 },
      );
    }

    // Class name — the owner-readable class state RPC (the caller manages the
    // invitation, so they can read the class).
    const { data: classState } = await supabase.rpc("edu_class_state", {
      p_class: invitation.target_id,
    });
    let className = "a class";
    if (
      classState &&
      typeof classState === "object" &&
      !Array.isArray(classState)
    ) {
      const rawName = (classState as Record<string, unknown>).name;
      if (typeof rawName === "string" && rawName.length > 0) {
        className = rawName;
      }
    }

    const inviterName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Your teacher";

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const invitationUrl = `${siteUrl}/invitations/class/accept/${invitationToken}`;
    const expiry = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const emailTemplate = emailTemplates.classInvitation(
      className,
      inviterName,
      invitationUrl,
      expiry,
    );

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });
    if (!emailResult.success) {
      console.warn("Failed to send class invitation email:", emailResult.error);
    }

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/education/class-invite:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process invitation";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
}
