/**
 * Sharing notification email (Resend API). Server-only: RESEND_API_KEY + EMAIL_FROM.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { sendEmail, emailTemplates } from "@/lib/email/client";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { getResourceDetails, type SupabaseServerClient } from "@/features/sharing/service/sharedResourceDetails";

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
    } = await getClaimsUser(supabase);

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
    if (
      !isRfc4122Uuid(recipientUserId) ||
      !isRfc4122Uuid(resourceId) ||
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
