/**
 * Resend Organization Invitation Email Route (email-only)
 *
 * The invitation row is refreshed (new expiry + fresh token) on the client via
 * the canonical `inv_resend` RPC (`invitationsService.resend`). This route
 * exists ONLY to re-send the reminder email — it receives the fresh token +
 * recipient email + organizationId and renders/sends the message. It NEVER
 * touches any invitation table.
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
    const { token, organizationId, email } = body;

    if (!token || !organizationId || !email) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: token, organizationId, email",
        },
        { status: 400 },
      );
    }

    const { data: orgData } = await supabase
      .schema("iam")
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();

    const inviterName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Someone";

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const invitationUrl = `${siteUrl}/invitations/organization/accept/${token}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const orgName = orgData?.name || "the organization";
    const emailTemplate = emailTemplates.organizationInvitationReminder(
      orgName,
      inviterName,
      invitationUrl,
      expiresAt,
    );

    const emailResult = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      console.warn("Failed to resend invitation email:", emailResult.error);
      return NextResponse.json(
        { success: false, error: "Failed to send email" },
        { status: 500 },
      );
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
