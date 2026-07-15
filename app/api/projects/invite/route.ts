/**
 * Project Invitation Email Route (email-only)
 *
 * The invitation ROW is created on the client via the canonical `inv_create`
 * RPC (`invitationsService.create`, client → Supabase per repo doctrine). This
 * route accepts only an invitation id. `inv_get_managed` proves caller access
 * and derives the stored recipient, token, project, and expiry.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
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
      invitation.target_type !== "project"
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

    // Fetch project + org details for the email body (read-only, RLS-scoped).
    // `projects` lives in `workspace`, `organizations` in `public` — PostgREST
    // resource embedding is single-schema, so the org name is fetched in a
    // separate `public` query and merged in JS.
    const { data: projectData } = await workspaceDb(supabase)
      .from("projects")
      .select("name, organization_id")
      .eq("id", invitation.target_id)
      .single();

    if (!projectData) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    let orgName = "your organization";
    if (projectData.organization_id) {
      const { data: orgData } = await supabase
        .schema("iam")
        .from("organizations")
        .select("name")
        .eq("id", projectData.organization_id)
        .maybeSingle();
      if (orgData?.name) orgName = orgData.name;
    }

    const inviterName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email ??
      "Someone";
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aimatrx.com";
    const invitationUrl = `${siteUrl}/invitations/project/accept/${invitationToken}`;
    const expiry = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const emailTemplate = emailTemplates.projectInvitation(
      projectData.name,
      orgName,
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
      console.warn(
        "Failed to send project invitation email:",
        emailResult.error,
      );
    }

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to send invitation email";
    console.error("Error in POST /api/projects/invite:", error);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.stack
            : undefined,
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
