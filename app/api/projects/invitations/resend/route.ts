/**
 * Project invitation reminder notice.
 *
 * The invitation row is refreshed (new expiry + fresh token) on the client via
 * the canonical `inv_resend` RPC (`invitationsService.resend`). This route
 * accepts only an invitation id. `inv_get_managed` derives the fresh stored
 * recipient/token/project after proving manager access.
 *
 * The notice goes through the notification spine (`invitation.project_reminder`): email, plus the
 * paired DM when the address already has an account.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  actorName,
  invitationOutcome,
  noticeDate,
  notifyFromSql,
  userIdForEmail,
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
    const body = await request.json();
    const { invitationId } = body;

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

    const { data: projectData } = await projectsDb(supabase)
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

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aimatrx.com";
    const acceptPath = `/invitations/project/accept/${invitationToken}`;
    const expiresAt = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const admin = createAdminClient();
    const recipientUserId =
      invitation.invited_user_id ?? (await userIdForEmail(admin, recipientEmail));

    const result = await notifyFromSql(admin, {
      organizationId: invitation.organization_id,
      eventKey: "invitation.project_reminder",
      recipientUserId,
      toAddress: recipientEmail,
      recipientLabel: recipientEmail,
      payload: {
        invite: {
          inviter: actorName(user, "Someone"),
          project: projectData.name,
          organization: orgName,
          token: invitationToken,
          expires: noticeDate(expiresAt),
        },
      },
      deepLink: acceptPath,
      targetKind: "invitation",
      targetId: invitation.id,
      // `inv_resend` mints a fresh token, so each real resend is its own notice.
      dedupeKey: `invitation.project_reminder:${invitation.id}:${invitationToken}`,
      dm: { sender_user_id: user.id },
    });

    return NextResponse.json(
      invitationOutcome(result, `${siteUrl}${acceptPath}`),
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to resend invitation";
    console.error("Error in POST /api/projects/invitations/resend:", error);
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
