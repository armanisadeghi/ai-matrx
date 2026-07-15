/**
 * Organization Invitation Email Route (email-only)
 *
 * The invitation ROW is created on the client via the canonical `inv_create`
 * RPC (`invitationsService.create`, client → Supabase per repo doctrine). This
 * route accepts only an invitation id. The caller-scoped `inv_get_managed`
 * RPC proves manager access and supplies the stored recipient/token/target.
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
      .single();

    if (!orgData) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const inviterName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Someone";

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const invitationUrl = `${siteUrl}/invitations/organization/accept/${invitationToken}`;
    const expiry = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const emailTemplate = emailTemplates.organizationInvitation(
      orgData.name,
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
      console.warn("Failed to send invitation email:", emailResult.error);
      // Don't fail the request if email fails — invitation row already exists
    }

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/organizations/invite:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process invitation";
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

export async function GET() {
  return NextResponse.json({
    status: "ok",
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
}
