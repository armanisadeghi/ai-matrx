/**
 * Organization Invitation API Route
 *
 * Handles creating organization invitations and sending invitation emails
 * This must run on the server to access EMAIL_FROM and RESEND_API_KEY
 *
 * Environment variables needed:
 * - RESEND_API_KEY=re_xxxxxxxxxxxx
 * - EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/email/client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
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

    // Parse request body
    const body = await request.json();
    const { email, role, organizationId } = body;

    // Validate input
    if (!email || !role || !organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: email, role, organizationId",
        },
        { status: 400 },
      );
    }

    // Display expiry for the email (RPC sets the authoritative 7-day expiry).
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create the invitation via the canonical SECURITY DEFINER RPC: validates
    // admin permission + non-membership, dedups by (org,email), generates the
    // token, resolves invited_user_id, and writes to iam.invitations.
    const { data: invitationId, error: rpcError } = await supabase.rpc(
      "invite_to_organization",
      {
        org_id: organizationId,
        email_address: email.toLowerCase().trim(),
        member_role: role,
        invited_by_user_id: user.id,
      },
    );

    if (rpcError || !invitationId) {
      const msg = rpcError?.message || "Failed to create invitation";
      const status = msg.includes("already a member")
        ? 409
        : msg.includes("permission")
          ? 403
          : 500;
      console.error("Error creating invitation:", rpcError);
      return NextResponse.json({ success: false, error: msg }, { status });
    }

    // Read back the row (inviter is an org admin → RLS std_select allows it) so we
    // have the generated token for the email link.
    const { data: invitation } = await supabase
      .schema("iam")
      .from("invitations")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (!invitation) {
      return NextResponse.json(
        {
          success: false,
          error: "Invitation created but could not be loaded",
        },
        { status: 500 },
      );
    }

    // Fetch organization details for the email
    const { data: orgData } = await supabase
      .schema("iam").from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    if (!orgData) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    // Get inviter details from current authenticated user
    const inviterName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Someone";

    // Generate invitation URL
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const invitationUrl = `${siteUrl}/invitations/organization/accept/${invitation.token}`;

    // Prepare email template
    const emailTemplate = emailTemplates.organizationInvitation(
      orgData.name,
      inviterName,
      invitationUrl,
      expiresAt,
    );

    // Send invitation email
    const emailResult = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    // Update invitation record with email status
    if (emailResult.success) {
      await supabase
        .schema("iam")
        .from("invitations")
        .update({
          metadata: {
            ...(invitation.metadata ?? {}),
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          },
        })
        .eq("id", invitation.id);
    } else {
      console.warn("Failed to send invitation email:", emailResult.error);
      // Don't fail the request if email fails - invitation is still created
    }

    return NextResponse.json({
      success: true,
      data: invitation,
      emailSent: emailResult.success,
    });
  } catch (error: any) {
    console.error("Error in POST /api/organizations/invite:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process invitation",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
}
