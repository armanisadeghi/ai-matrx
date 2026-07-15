/**
 * Sharing notification email (Resend API). Server-only: RESEND_API_KEY + EMAIL_FROM.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/email/client";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ResourceDetails {
  title: string;
  url: string;
}

/**
 * Get resource details for email
 */
async function getResourceDetails(
  supabase: SupabaseServerClient,
  resourceType: string,
  resourceId: string,
): Promise<ResourceDetails | null> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";

  try {
    switch (resourceType) {
      case "prompt": {
        // TODO(prompt-to-agent-sweep): public.prompts is graveyarded.
        // Re-wire to agent.definition (same UUIDs) when the migration completes.
        console.warn(
          "[sharing/notify] prompt sharing notification skipped — public.prompts graveyarded",
        );
        return null;
      }

      case "canvas": {
        // BUG FOUND: this previously queried `public.canvases`, a table that
        // does not exist anywhere in the schema (canvas content lives in
        // `canvas.canvas_items`). Every canvas share notification silently
        // failed (caught below, returned null -> caller 404s "Resource
        // details not found"). Repointed to the real table.
        const { data } = await supabase
          .schema("canvas")
          .from("canvas_items")
          .select("title")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.title || "Untitled Canvas",
              url: `${siteUrl}/canvases/${resourceId}`,
            }
          : null;
      }

      case "collection": {
        // BUG FOUND: `public.collections` does not exist anywhere in the
        // schema — this resource type has no backing table today. Every
        // "collection" share notification silently failed the same way as
        // the canvas case above. No replacement table identified; leaving
        // this branch returning null (existing observable behavior) rather
        // than guessing at a destination table.
        console.warn(
          "[sharing/notify] collection sharing notification skipped — no backing table in current schema",
        );
        return null;
      }

      case "note": {
        const { data } = await supabase
          .schema("workbench")
          .from("notes")
          .select("label")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.label || "Untitled Note",
              url: `${siteUrl}/notes/${resourceId}`,
            }
          : null;
      }

      default:
        return {
          title: `Shared ${resourceType}`,
          url: `${siteUrl}/${resourceType}s/${resourceId}`,
        };
    }
  } catch (error) {
    console.error("Error fetching resource details:", error);
    return null;
  }
}

/**
 * Check if user has email notifications enabled for sharing
 */
async function checkEmailPreferences(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .schema("users")
      .from("user_email_preferences")
      .select("sharing_notifications")
      .eq("user_id", userId)
      .single();

    // Default to true if no preferences found
    return data?.sharing_notifications !== false;
  } catch (error) {
    console.error("Error checking email preferences:", error);
    return true; // Default to sending if error
  }
}

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
    const { recipientUserId, resourceType, resourceId, message } = body;

    // Validate input
    const isUuid = (value: unknown): value is string =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      );
    if (
      !isUuid(recipientUserId) ||
      !isUuid(resourceId) ||
      typeof resourceType !== "string" ||
      !/^[a-z][a-z0-9_]{0,63}$/i.test(resourceType)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: recipientUserId, resourceType, resourceId",
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

    // Check if user wants email notifications only after the grant is proven.
    const shouldSendEmail = await checkEmailPreferences(admin, recipientUserId);
    if (!shouldSendEmail) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "User has disabled sharing notifications",
      });
    }

    const { data: recipient, error: recipientError } =
      await admin.auth.admin.getUserById(recipientUserId);
    const recipientEmail = recipient.user?.email;

    if (recipientError || !recipientEmail) {
      console.warn("No email found for user:", recipientUserId);
      return NextResponse.json(
        { success: false, error: "User email not found" },
        { status: 404 },
      );
    }

    // Get resource details
    const resourceDetails = await getResourceDetails(
      supabase,
      resourceType,
      resourceId,
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

    // Prepare email template
    const emailTemplate = emailTemplates.resourceShared(
      user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        "Someone",
      resourceType,
      resourceDetails.title,
      resourceDetails.url,
      message,
    );

    // Send email
    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      console.error("Failed to send sharing notification:", emailResult.error);
      return NextResponse.json(
        { success: false, error: "Failed to send email" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      emailSent: true,
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
