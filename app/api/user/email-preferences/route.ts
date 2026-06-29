import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";

/**
 * GET /api/user/email-preferences
 * Get current user's email preferences
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get or create user email preferences
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "get_user_email_preferences",
      { p_user_id: user.id }
    );

    if (error) {
      console.error("Error fetching email preferences:", error);
      return NextResponse.json(
        { success: false, msg: "Failed to fetch preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in GET /api/user/email-preferences:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/email-preferences
 * Update current user's email preferences
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      sharing_notifications,
      organization_invitations,
      resource_updates,
      marketing_emails,
      weekly_digest,
      task_notifications,
      comment_notifications,
      message_notifications,
      message_digest,
    } = body;

    // Validate boolean values
    const preferences: Record<string, boolean> = {};
    
    if (typeof sharing_notifications === "boolean") {
      preferences.sharing_notifications = sharing_notifications;
    }
    if (typeof organization_invitations === "boolean") {
      preferences.organization_invitations = organization_invitations;
    }
    if (typeof resource_updates === "boolean") {
      preferences.resource_updates = resource_updates;
    }
    if (typeof marketing_emails === "boolean") {
      preferences.marketing_emails = marketing_emails;
    }
    if (typeof weekly_digest === "boolean") {
      preferences.weekly_digest = weekly_digest;
    }
    if (typeof task_notifications === "boolean") {
      preferences.task_notifications = task_notifications;
    }
    if (typeof comment_notifications === "boolean") {
      preferences.comment_notifications = comment_notifications;
    }
    if (typeof message_notifications === "boolean") {
      preferences.message_notifications = message_notifications;
    }
    if (typeof message_digest === "boolean") {
      preferences.message_digest = message_digest;
    }

    if (Object.keys(preferences).length === 0) {
      return NextResponse.json(
        { success: false, msg: "No valid preferences provided" },
        { status: 400 }
      );
    }

    // Check if preferences exist
    const { data: existing } = await supabase
      .schema("users").from("user_email_preferences")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Update existing preferences
      const { error } = await supabase
        .schema("users").from("user_email_preferences")
        .update(preferences)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating email preferences:", error);
        return NextResponse.json(
          { success: false, msg: "Failed to update preferences" },
          { status: 500 }
        );
      }
    } else {
      // Create new preferences (scoped to the user's personal org)
      const organizationId = await ensureOrgIdServer(supabase, undefined);
      const { error } = await supabase
        .schema("users").from("user_email_preferences")
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          ...preferences,
        });

      if (error) {
        console.error("Error creating email preferences:", error);
        return NextResponse.json(
          { success: false, msg: "Failed to create preferences" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      msg: "Preferences updated successfully",
    });
  } catch (error) {
    console.error("Error in PATCH /api/user/email-preferences:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
