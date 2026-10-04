/**
 * Organization invitation reminder notice.
 *
 * The invitation row is refreshed (new expiry + fresh token) on the client via
 * the canonical `inv_resend` RPC (`invitationsService.resend`). This route
 * accepts only an invitation id; `inv_get_managed` derives the fresh token,
 * recipient, and organization after proving the caller is a manager.
 *
 * The reminder goes through the notification spine
 * (`invitation.organization_reminder`): email, plus the paired DM when the
 * address already has an account.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
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

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const acceptPath = `/invitations/organization/accept/${invitationToken}`;
    const expiresAt = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const admin = createAdminClient();
    const recipientUserId =
      invitation.invited_user_id ?? (await userIdForEmail(admin, recipientEmail));

    const result = await notifyFromSql(admin, {
      organizationId: invitation.organization_id,
      eventKey: "invitation.organization_reminder",
      recipientUserId,
      toAddress: recipientEmail,
      recipientLabel: recipientEmail,
      payload: {
        invite: {
          inviter: actorName(user, "Someone"),
          organization: orgData?.name || "the organization",
          token: invitationToken,
          expires: noticeDate(expiresAt),
        },
      },
      deepLink: acceptPath,
      targetKind: "invitation",
      targetId: invitation.id,
      // `inv_resend` mints a fresh token, so each real resend is its own notice.
      dedupeKey: `invitation.organization_reminder:${invitation.id}:${invitationToken}`,
      dm: { sender_user_id: user.id },
    });

    return NextResponse.json(
      invitationOutcome(result, `${siteUrl}${acceptPath}`),
    );
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
