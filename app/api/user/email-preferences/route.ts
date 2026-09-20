import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from "@/lib/organizations/organizationRequiredResponse";
import type { TablesUpdate } from "@/types/database.types";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * GET /api/user/email-preferences
 * Get current user's email preferences
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    // Get or create user email preferences
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "get_user_email_preferences",
      { p_user_id: user.id },
    );

    if (error) {
      console.error("Error fetching email preferences:", error);
      return NextResponse.json(
        { success: false, msg: "Failed to fetch preferences" },
        { status: 500 },
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
      { status: 500 },
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
    } = await getClaimsUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
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
    const preferences: TablesUpdate<
      { schema: "users" },
      "user_email_preferences"
    > = {};

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
        { status: 400 },
      );
    }

    // Check if preferences exist
    const { data: existing } = await supabase
      .schema("users")
      .from("user_email_preferences")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Update existing preferences
      const { error } = await supabase
        .schema("users")
        .from("user_email_preferences")
        .update(preferences)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating email preferences:", error);
        return NextResponse.json(
          { success: false, msg: "Failed to update preferences" },
          { status: 500 },
        );
      }
    } else {
      // 🚨 THE FIRST PREFERENCE ROW IS FILED IN THE ORGANIZATION THE CALLER
      // IS ACTING IN. Until 2026-09-19 this read
      // `ensureOrgIdServer(supabase, undefined)`, which ended in the
      // `current_personal_org_id()` RPC — the server choosing the person's
      // personal workspace because the request named none. The old comment
      // called that deliberate ("one row per user_id"), but the uniqueness of
      // the row is not what `organization_id` means: it is a tenant, and a
      // tenant nobody chose is the substitution the 2026-09-19 ruling forbids.
      // The caller states the organization on `X-Organization-Id` — the header
      // every Matrx client carries and every other org-scoped route under
      // app/api/** already reads (app/api/_lib/apply-scope-to-insert.ts).
      //
      // Only this INSERT branch asks: updating an existing row never restates
      // the tenant, so a person whose preferences already exist is never held
      // for a question that would not change anything.
      const actingOrganizationId =
        request.headers.get("X-Organization-Id")?.trim() || undefined;
      const organizationId = await ensureOrgIdServer(
        supabase,
        actingOrganizationId,
      );
      const { error } = await supabase
        .schema("users")
        .from("user_email_preferences")
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          ...preferences,
        });

      if (error) {
        console.error("Error creating email preferences:", error);
        return NextResponse.json(
          { success: false, msg: "Failed to create preferences" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      msg: "Preferences updated successfully",
    });
  } catch (error) {
    // The organization refusal is an ANSWER, not a failure: it carries the
    // caller's own memberships so the client can hold the save, show the
    // picker and retry. Collapsing it into the generic 500 below would turn
    // the one question the person can answer into a dead end.
    if (isOrganizationRequiredServerError(error)) {
      return organizationRequiredResponse(error);
    }
    console.error("Error in PATCH /api/user/email-preferences:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to update preferences" },
      { status: 500 },
    );
  }
}
