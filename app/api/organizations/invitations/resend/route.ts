/**
 * Resend Organization Invitation API Route
 *
 * Handles resending invitation emails with extended expiry
 * This must run on the server to access EMAIL_FROM and RESEND_API_KEY
 *
 * Environment variables needed:
 * - RESEND_API_KEY=re_xxxxxxxxxxxx
 * - EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
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
    const { invitationId } = body;

    // Validate input
    if (!invitationId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: invitationId" },
        { status: 400 },
      );
    }

    // Fetch the invitation to resend
    const { data: invitation, error: fetchError } = await graveyardDb(supabase)
      .from("organization_invitations")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (fetchError || !invitation) {
      console.error("Error fetching invitation:", fetchError);
      return NextResponse.json(
        { success: false, error: "Invitation not found" },
        { status: 404 },
      );
    }

    const { data: orgData } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", invitation.organization_id)
      .maybeSingle();

    // Update expiry date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: updateError } = await graveyardDb(supabase)
      .from("organization_invitations")
      .update({ expires_at: expiresAt.toISOString() })
      .eq("id", invitationId);

    if (updateError) {
      console.error("Error updating invitation expiry:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to update invitation" },
        { status: 500 },
      );
    }

    // Get inviter details
    const inviterName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Someone";

    // Generate invitation URL
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const invitationUrl = `${siteUrl}/invitations/organization/accept/${invitation.token}`;

    // Prepare email template (using reminder template for resend)
    const orgName = orgData?.name || "the organization";
    const emailTemplate = emailTemplates.organizationInvitationReminder(
      orgName,
      inviterName,
      invitationUrl,
      expiresAt,
    );

    // Send invitation email
    const emailResult = await sendEmail({
      to: invitation.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    // Update invitation record with email status
    if (emailResult.success) {
      await graveyardDb(supabase)
        .from("organization_invitations")
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", invitationId);
    } else {
      console.warn("Failed to resend invitation email:", emailResult.error);
      // Return error if email fails
      return NextResponse.json(
        { success: false, error: "Failed to send email" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Invitation resent successfully",
      emailSent: emailResult.success,
    });
  } catch (error: any) {
    console.error(
      "Error in POST /api/organizations/invitations/resend:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to resend invitation",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
