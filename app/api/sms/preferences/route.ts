/**
 * GET /api/sms/preferences
 * PUT /api/sms/preferences
 *
 * User SMS notification preferences.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from "@/lib/organizations/organizationRequiredResponse";
import { normalizePhoneNumber } from "@/lib/sms/phoneUtils";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * GET /api/sms/preferences
 * Get the current user's SMS notification preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    const adminSupabase = createAdminClient();

    const { data, error } = await adminSupabase
      .schema("communication")
      .from("sms_notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      // No preferences yet — return defaults
      return NextResponse.json({
        success: true,
        msg: "Default preferences (not yet configured)",
        data: {
          user_id: user.id,
          phone_number: null,
          sms_enabled: false,
          dm_notifications: false,
          task_notifications: false,
          job_completion_notifications: false,
          system_alerts: false,
          marketing_messages: false,
          ai_agent_messages: true,
          quiet_hours_enabled: true,
          quiet_hours_start: "21:00",
          quiet_hours_end: "08:00",
          // 1020: nobody has declared a clock, and saying "New York" here is
          // the API inventing one. The pane shows "not set" and asks.
          timezone: null,
          max_messages_per_hour: 10,
          max_messages_per_day: 50,
          sms_consent_status: null,
        },
      });
    }

    if (error) {
      return NextResponse.json(
        {
          success: false,
          msg: "Failed to fetch preferences",
          error: error.message,
        },
        { status: 500 },
      );
    }

    const { data: consent } = data.phone_number
      ? await adminSupabase
          .schema("communication")
          .from("sms_consent")
          .select("status")
          .eq("user_id", user.id)
          .eq("phone_number", data.phone_number)
          .eq("consent_type", "notifications")
          .maybeSingle()
      : { data: null };

    return NextResponse.json({
      success: true,
      msg: "Preferences fetched",
      data: { ...data, sms_consent_status: consent?.status ?? null },
    });
  } catch (err) {
    console.error("Error in preferences GET:", err);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/sms/preferences
 * Update the current user's SMS notification preferences.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const adminSupabase = createAdminClient();

    const { data: existingPreferences, error: existingError } =
      await adminSupabase
        .schema("communication")
        .from("sms_notification_preferences")
        .select("phone_number, sms_enabled, metadata")
        .eq("user_id", user.id)
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          success: false,
          msg: "Failed to inspect current SMS preferences",
          error: existingError.message,
        },
        { status: 500 },
      );
    }

    // Allowlisted fields
    const allowedFields = [
      "phone_number",
      "sms_enabled",
      "dm_notifications",
      "task_notifications",
      "job_completion_notifications",
      "system_alerts",
      "marketing_messages",
      "ai_agent_messages",
      "quiet_hours_enabled",
      "quiet_hours_start",
      "quiet_hours_end",
      "timezone",
      "max_messages_per_hour",
      "max_messages_per_day",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // 🚨 THE ROW MUST SAY WHAT THE PERSON WAS ACTUALLY ASKED (aidream 1023).
    // Every column on this row is NOT NULL with a default — timezone was
    // 'America/New_York', the caps are 10/50, the night is 21:00-08:00 — so the
    // row cannot say "nobody chose this" unless a writer records what it chose.
    // communication.person_notification_caps now counts this enrolment's caps
    // ONLY when metadata->'declared' contains 'volume_caps', which means a
    // person who sets their caps here and is not stamped has them SILENTLY
    // IGNORED. This is that stamp. It is additive: it never removes a field
    // somebody declared earlier.
    const declaredNow = new Set<string>();
    if (body.timezone !== undefined) declaredNow.add("timezone");
    if (
      body.quiet_hours_enabled !== undefined ||
      body.quiet_hours_start !== undefined ||
      body.quiet_hours_end !== undefined
    ) {
      declaredNow.add("quiet_hours");
    }
    if (
      body.max_messages_per_hour !== undefined ||
      body.max_messages_per_day !== undefined
    ) {
      declaredNow.add("volume_caps");
    }

    // Normalize phone number if provided
    if (
      updateData.phone_number &&
      typeof updateData.phone_number === "string"
    ) {
      updateData.phone_number = normalizePhoneNumber(updateData.phone_number);
    }

    const effectivePhone =
      typeof updateData.phone_number === "string"
        ? updateData.phone_number
        : existingPreferences?.phone_number;
    const effectiveEnabled =
      typeof updateData.sms_enabled === "boolean"
        ? updateData.sms_enabled
        : (existingPreferences?.sms_enabled ?? false);

    if (effectiveEnabled) {
      if (!effectivePhone) {
        return NextResponse.json(
          {
            success: false,
            msg: "Verify a mobile number before enabling SMS notifications",
          },
          { status: 400 },
        );
      }

      const { data: consent, error: consentError } = await adminSupabase
        .schema("communication")
        .from("sms_consent")
        .select("id")
        .eq("user_id", user.id)
        .eq("phone_number", effectivePhone)
        .eq("consent_type", "notifications")
        .eq("status", "opted_in")
        .maybeSingle();

      if (consentError) {
        return NextResponse.json(
          {
            success: false,
            msg: "Failed to validate SMS consent",
            error: consentError.message,
          },
          { status: 500 },
        );
      }

      if (!consent) {
        return NextResponse.json(
          {
            success: false,
            msg: "Verify this mobile number and accept the SMS terms before enabling notifications",
          },
          { status: 400 },
        );
      }
    }

    // 🚨 THE PREFERENCE ROW IS FILED IN THE ORGANIZATION THE CALLER IS ACTING
    // IN. Until 2026-09-19 this read `ensureOrgIdServer(supabase, undefined)`,
    // which ended in the `current_personal_org_id()` RPC: the server picking
    // the person's personal workspace because the request named none. The
    // old comment here called that deliberate — "a per-person singleton, one
    // row that follows the person across organizations" — but `upsert on
    // user_id` is what makes the row a singleton; `organization_id` is still a
    // tenant, and stamping it from the personal workspace is the server
    // choosing a tenant nobody chose. Arman, 2026-09-19: "one missed org check
    // that should have just failed turns into 50 in a month and 5,000 in a
    // year". The caller states the organization on `X-Organization-Id` — the
    // header every Matrx client carries and every other org-scoped route under
    // app/api/** already reads (app/api/_lib/apply-scope-to-insert.ts) — and
    // with none the request is REFUSED, before a single row is written, with
    // the caller's memberships attached so the person can choose and retry.
    const actingOrganizationId =
      request.headers.get("X-Organization-Id")?.trim() || undefined;
    const organizationId = await ensureOrgIdServer(supabase, actingOrganizationId);
    const { data, error } = await adminSupabase
      .schema("communication")
      .from("sms_notification_preferences")
      .upsert(
        {
          user_id: user.id,
          organization_id: organizationId,
          ...updateData,
          ...(declaredNow.size
            ? {
                metadata: {
                  ...((existingPreferences?.metadata as Record<
                    string,
                    unknown
                  > | null) ?? {}),
                  declared: Array.from(
                    new Set([
                      ...(Array.isArray(
                        (
                          existingPreferences?.metadata as {
                            declared?: unknown;
                          } | null
                        )?.declared,
                      )
                        ? ((
                            existingPreferences!.metadata as {
                              declared: string[];
                            }
                          ).declared)
                        : []),
                      ...declaredNow,
                    ]),
                  ),
                },
              }
            : {}),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          msg: "Failed to update preferences",
          error: error.message,
        },
        { status: 500 },
      );
    }

    if (updateData.sms_enabled === false && effectivePhone) {
      const { error: optOutError } = await adminSupabase
        .schema("communication")
        .from("sms_consent")
        .update({
          status: "opted_out",
          opted_out_at: new Date().toISOString(),
          opt_out_method: "web_form",
        })
        .eq("user_id", user.id)
        .eq("phone_number", effectivePhone)
        .in("consent_type", ["transactional", "notifications"]);

      if (optOutError) {
        console.error("Failed to record SMS web-form opt-out:", optOutError);
        return NextResponse.json(
          {
            success: false,
            msg: "SMS was disabled, but the opt-out record could not be updated",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      msg: "Preferences updated",
      data,
    });
  } catch (err) {
    // The organization refusal is an ANSWER, not a failure: it carries the
    // caller's own memberships so the client can hold the action, show the
    // picker and retry. Collapsing it into the generic 500 below would turn
    // the one question the person can answer into a dead end.
    if (isOrganizationRequiredServerError(err)) {
      return organizationRequiredResponse(err);
    }
    console.error("Error in preferences PUT:", err);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}
