/**
 * Organization Invitation Email Route (email-only)
 *
 * The invitation ROW is created on the client via the canonical `inv_create`
 * RPC (`invitationsService.create`, client → Supabase per repo doctrine). This
 * route exists ONLY to send the invitation email — it receives the
 * already-created token + email + organizationId and renders/sends the message.
 * It NEVER touches any invitation table.
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
    const { email, organizationId, token, expiresAt } = body;

    if (!email || !organizationId || !token) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: email, organizationId, token",
        },
        { status: 400 },
      );
    }

    const { data: orgData } = await supabase
      .schema("iam")
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
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
    const invitationUrl = `${siteUrl}/invitations/organization/accept/${token}`;
    const expiry = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const emailTemplate = emailTemplates.organizationInvitation(
      orgData.name,
      inviterName,
      invitationUrl,
      expiry,
    );

    const emailResult = await sendEmail({
      to: email,
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
