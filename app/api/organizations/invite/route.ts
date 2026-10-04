/**
 * Organization invitation notice.
 *
 * The invitation ROW is created on the client via the canonical `inv_create`
 * RPC (`invitationsService.create`, client → Supabase per repo doctrine). This
 * route accepts only an invitation id. The caller-scoped `inv_get_managed`
 * RPC proves manager access and supplies the stored recipient/token/target.
 *
 * The notice goes through the notification spine (`invitation.organization`):
 * email to the address, and — when that address already has an account — the
 * paired DM and in-app line. Words: aidream `services/notifications/declarations.py`.
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
      .single();

    if (!orgData) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";
    const acceptPath = `/invitations/organization/accept/${invitationToken}`;
    const expiry = invitation.expires_at
      ? new Date(invitation.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const admin = createAdminClient();
    const recipientUserId =
      invitation.invited_user_id ?? (await userIdForEmail(admin, recipientEmail));

    const result = await notifyFromSql(admin, {
      organizationId: invitation.organization_id,
      eventKey: "invitation.organization",
      recipientUserId,
      toAddress: recipientEmail,
      recipientLabel: recipientEmail,
      payload: {
        invite: {
          inviter: actorName(user, "Someone"),
          organization: orgData.name,
          token: invitationToken,
          expires: noticeDate(expiry),
        },
      },
      deepLink: acceptPath,
      targetKind: "invitation",
      targetId: invitation.id,
      // One notice per invitation token: a repeat POST queues nothing new.
      dedupeKey: `invitation.organization:${invitation.id}:${invitationToken}`,
      dm: { sender_user_id: user.id },
    });

    return NextResponse.json(
      invitationOutcome(result, `${siteUrl}${acceptPath}`),
    );
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
