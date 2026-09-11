/**
 * Resend Organization Invitation Email Route (email-only)
 *
 * The invitation row is refreshed (new expiry + fresh token) on the client via
 * the canonical `inv_resend` RPC (`invitationsService.resend`). This route
 * accepts only an invitation id; `inv_get_managed` derives the fresh token,
 * recipient, and organization after proving the caller is a manager.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/email/client";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import { withInvitedEmail } from "@/utils/auth/invitation-links";

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
    // THE strict RFC-4122 predicate (@ai-matrx/kit/uuid) — a validation door
    // on a public route only ever sees ids this system minted.

    if (!isRfc4122Uuid(invitationId)) {
      return NextResponse.json(
        { success: false, error: "A valid invitationId is required" },
        { status: 400 },
      );
    }

    const { data: invitation, error: invitationError } = await supabase.rpc(
      "inv_get_managed",
      { p_invitation_id: invitationId },
    );
    if (
      invitationError ||
      !invitation ||
      invitation.target_type !== "organization"
    ) {
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

    const { data: orgData } = await supabase
      .schema("iam")
      .from("organizations")
      .select("name")
      .eq("id", invitation.target_id)
      .maybeSingle();

    const inviterName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Someone";

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const invitationUrl = withInvitedEmail(
      `${siteUrl}/invitations/organization/accept/${invitationToken}`,
      recipientEmail,
    );
    const expiresAt = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const orgName = orgData?.name || "the organization";
    const emailTemplate = emailTemplates.organizationInvitationReminder(
      orgName,
      inviterName,
      invitationUrl,
      expiresAt,
    );

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      // `inv_resend` already minted a FRESH token, so the invitation is valid
      // and the older link is dead. Reporting a flat failure here would leave
      // the manager believing nothing happened while the recipient's old link
      // silently stopped working. Say exactly what happened and hand back the
      // new link as the remedy (DD-091, law 4).
      console.warn("Failed to resend invitation email:", emailResult.error);
      return NextResponse.json({
        success: true,
        emailSent: false,
        emailError: emailResult.error || "The email provider rejected the send",
        acceptUrl: invitationUrl,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Invitation resent successfully",
      emailSent: true,
    });
  } catch (error: unknown) {
    console.error(
      "Error in POST /api/organizations/invitations/resend:",
      error,
    );
    const message =
      error instanceof Error ? error.message : "Failed to resend invitation";
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        success: false,
        error: message,
        details: process.env.NODE_ENV === "development" ? stack : undefined,
      },
      { status: 500 },
    );
  }
}
