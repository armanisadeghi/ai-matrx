/**
 * "Somebody shared something with you" — the ONE notice for a user-to-user share.
 *
 * Goes through the notification spine (`share.resource_shared`): email to the
 * recipient's account address plus the paired DM, sent as the sharer and carrying
 * the resource card. The share dialog calls this once after the grant lands; it
 * no longer sends its own DM.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { getResourceDetails } from "@/features/sharing/service/sharedResourceDetails";
import { getResourceTypeLabel } from "@/utils/permissions/registry";
import {
  accountEmail,
  actorName,
  legacyEmailOptOut,
  notifyFromSql,
} from "@/lib/notifications/notifyFromSql";

/** The same-app path of a link `getResourceDetails` built (it carries `?org=` already). */
function samePath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
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

    // Parse request body
    const body = await request.json();
    const {
      recipientUserId,
      resourceType,
      resourceId,
      organizationId,
      permissionLevel,
      message,
    } = body;

    // Validate input
    if (
      !isRfc4122Uuid(recipientUserId) ||
      !isRfc4122Uuid(resourceId) ||
      !isRfc4122Uuid(organizationId) ||
      typeof resourceType !== "string" ||
      !/^[a-z][a-z0-9_]{0,63}$/i.test(resourceType)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: recipientUserId, resourceType, resourceId, organizationId",
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: registryEntry } = await admin
      .schema("platform")
      .from("shareable_resource_registry")
      .select("resource_type, table_name")
      .or(`resource_type.eq.${resourceType},table_name.eq.${resourceType}`)
      .eq("is_active", true)
      .maybeSingle();
    const permissionResourceTypes = Array.from(
      new Set(
        [
          resourceType,
          registryEntry?.resource_type,
          registryEntry?.table_name,
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    // The notification is valid only for an active grant the caller created.
    const { data: permission } = await admin
      .schema("iam")
      .from("permissions")
      .select("id, status")
      .in("resource_type", permissionResourceTypes)
      .eq("resource_id", resourceId)
      .eq("granted_to_user_id", recipientUserId)
      .eq("created_by", user.id)
      .maybeSingle();

    if (!permission || permission.status === "rejected") {
      return NextResponse.json(
        { success: false, error: "Matching share grant not found" },
        { status: 403 },
      );
    }

    // Read AS THE SHARER, so the title and link are what they can see. The address can depend on
    // the recipient: a table row shared with a person outside its organization opens at its own
    // page (access ladder T-40).
    const resourceDetails = await getResourceDetails(
      supabase,
      resourceType,
      resourceId,
      {
        isMemberOf: async (organizationId) => {
          const { data, error } = await admin.rpc("auth_is_org_member", {
            user_id: recipientUserId,
            org_id: organizationId,
          });
          if (error) throw new Error(`auth_is_org_member: ${error.message}`);
          return data === true;
        },
      },
    );
    if (!resourceDetails) {
      console.warn("Could not fetch resource details:", {
        resourceType,
        resourceId,
      });
      return NextResponse.json(
        { success: false, error: "Resource details not found" },
        { status: 404 },
      );
    }
    // The in-app card and the DM open the same place the email names.
    const path = resourceDetails.path ?? null;

    const sharerName = actorName(user, "Someone");
    const resourceLabel = getResourceTypeLabel(resourceType);
    const note = typeof message === "string" ? message.trim() : "";

    const result = await notifyFromSql(admin, {
      organizationId,
      eventKey: "share.resource_shared",
      recipientUserId,
      toAddress: await accountEmail(admin, recipientUserId),
      payload: {
        share: {
          sharer: sharerName,
          resource_type: resourceLabel,
          title: resourceDetails.title,
          note_line: note ? `"${note}"` : "No note was added.",
        },
      },
      deepLink: path ?? samePath(resourceDetails.url),
      targetKind: resourceType,
      targetId: resourceId,
      // One notice per grant: re-saving the same share tells nobody twice.
      dedupeKey: `share.resource_shared:${permission.id}`,
      dm: {
        sender_user_id: user.id,
        action_data: {
          kind: "resource_shared",
          version: 1,
          payload: {
            resource_type: resourceType,
            resource_id: resourceId,
            resource_title: resourceDetails.title,
            resource_label: resourceLabel,
            permission_level:
              typeof permissionLevel === "string" ? permissionLevel : "viewer",
            sharer_name: sharerName,
            ...(path ? { resource_href: path } : {}),
          },
        },
      },
      optedOut: await legacyEmailOptOut(
        admin,
        recipientUserId,
        "sharing_notifications",
      ),
    });

    return NextResponse.json({
      success: true,
      emailSent: result.queued.includes("email"),
      queued: result.queued,
      skipped: result.skipped,
      say: result.say,
      path,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/sharing/notify:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to send sharing notification";
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
