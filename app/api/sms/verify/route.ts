/**
 * POST /api/sms/verify
 *
 * Phone number verification via Twilio Verify.
 * Used to verify a user's notification phone number
 * (separate from Supabase auth phone login).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from "@/lib/organizations/organizationRequiredResponse";
import { sendVerification, checkVerification } from "@/lib/sms/verify";
import { normalizePhoneNumber, isValidE164 } from "@/lib/sms/phoneUtils";
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_CONSENT_VERSION,
  SMS_OPT_IN_PATH,
  SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE,
  SMS_PERSONAL_STAFF_CONSENT_VERSION,
  SMS_PERSONAL_STAFF_OPT_IN_PATH,
  SMS_PRIVACY_PATH,
  SMS_TERMS_PATH,
} from "@/features/sms/compliance";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as Partial<{
      action: string;
      phoneNumber: string;
      code: string;
      consents: Partial<{ notifications: boolean; personalStaff: boolean }>;
      source: string;
    }>;
    let { action, phoneNumber } = body;
    const { code, source } = body;
    // One affirmative box per program — never one box for two (see compliance.ts).
    const notificationsConsent = body.consents?.notifications === true;
    const personalStaffConsent = body.consents?.personalStaff === true;

    if (!action || !phoneNumber) {
      return NextResponse.json(
        { success: false, msg: "Missing required fields: action, phoneNumber" },
        { status: 400 },
      );
    }

    // Normalize phone number to E.164 format
    phoneNumber = normalizePhoneNumber(phoneNumber);

    // Validate E.164 format
    if (!isValidE164(phoneNumber)) {
      return NextResponse.json(
        {
          success: false,
          msg: "Invalid phone number format. Use 10 digits (2125551234) or +1 format (+12125551234)",
        },
        { status: 400 },
      );
    }

    // Normalize action names (support both 'start'/'send' and 'verify'/'check')
    if (action === "start") action = "send";
    if (action === "verify") action = "check";

    if (
      (action === "send" || action === "check") &&
      !notificationsConsent &&
      !personalStaffConsent
    ) {
      return NextResponse.json(
        {
          success: false,
          msg: "Check the consent box for at least one text message program before verification",
        },
        { status: 400 },
      );
    }

    switch (action) {
      case "send": {
        const result = await sendVerification(phoneNumber);

        if (!result.success) {
          return NextResponse.json(
            {
              success: false,
              msg: "Failed to send verification",
              error: result.error,
            },
            { status: 500 },
          );
        }

        return NextResponse.json({
          success: true,
          msg: "Verification code sent",
          data: { status: result.status },
        });
      }

      case "check": {
        if (!code) {
          return NextResponse.json(
            { success: false, msg: "Missing verification code" },
            { status: 400 },
          );
        }

        // 🚨 THE ORGANIZATION IS SETTLED BEFORE THE CODE IS SPENT.
        // Until 2026-09-19 this was resolved further down, AFTER Twilio had
        // already checked the code, and it resolved by calling
        // `ensureOrgIdServer(supabase, undefined)` — the server stamping the
        // consent and preference rows with the person's personal workspace
        // because the request named no organization. Both halves were wrong.
        // The ruling (Arman, 2026-09-19) is that nothing below the boundary
        // may PICK an organization; and a refusal that arrives after
        // `checkVerification` has burned a single-use code is not honest —
        // the person would have to request a new code to answer a question
        // that could have been asked first. So the organization is admitted
        // here, from `X-Organization-Id` (the header every Matrx client
        // carries), and a request that names none is refused with the
        // caller's memberships before anything is spent or written.
        const actingOrganizationId =
          request.headers.get("X-Organization-Id")?.trim() || undefined;
        const organizationId = await ensureOrgIdServer(
          supabase,
          actingOrganizationId,
        );

        const result = await checkVerification(phoneNumber, code);

        if (!result.success) {
          return NextResponse.json(
            { success: false, msg: "Verification failed", error: result.error },
            { status: 400 },
          );
        }

        // Phone verified — persist the exact web-form consent contract before
        // enabling notification delivery.
        const adminSupabase = createAdminClient();
        const forwardedFor = request.headers.get("x-forwarded-for");
        const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;

        const consentRecordedAt = new Date().toISOString();
        const consentSource = source === "sms-demo" ? "sms-demo" : "settings";
        const consentRow = (
          consentType: string,
          metadata: Record<string, string>,
        ) => ({
          phone_number: phoneNumber,
          user_id: user.id,
          organization_id: organizationId,
          consent_type: consentType,
          status: "opted_in",
          opted_in_at: consentRecordedAt,
          opted_out_at: null,
          opt_in_method: "web_form",
          ip_address: ipAddress,
          metadata,
        });

        // 🚨 ONE ROW PER PROGRAM, EACH WITH ITS OWN DISCLOSURE. Carriers reject a
        // campaign whose consent is bundled with another program's (Twilio 30913,
        // 2026-09-26), so a box the person did not check writes nothing.
        //
        // Program 1 — account + workplace notifications: the `transactional` and
        // `notifications` purpose rows (the second keeps legacy account consent
        // from silently authorizing workforce notifications).
        // Program 2 — Personal Staff: the `ai_agent` row. The enrollment door
        // below binds a Personal Staff text destination only when it exists.
        const consentRows = [
          ...(notificationsConsent
            ? ["transactional", "notifications"].map((consentType) =>
                consentRow(consentType, {
                  program: "ai_matrx_notifications",
                  consent_version: SMS_CONSENT_VERSION,
                  disclosure: SMS_CONSENT_DISCLOSURE,
                  opt_in_path: SMS_OPT_IN_PATH,
                  privacy_path: SMS_PRIVACY_PATH,
                  terms_path: SMS_TERMS_PATH,
                  source: consentSource,
                  verification_channel: "sms",
                }),
              )
            : []),
          ...(personalStaffConsent
            ? [
                consentRow("ai_agent", {
                  program: "ai_matrx_personal_staff",
                  consent_version: SMS_PERSONAL_STAFF_CONSENT_VERSION,
                  disclosure: SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE,
                  opt_in_path: SMS_PERSONAL_STAFF_OPT_IN_PATH,
                  privacy_path: SMS_PRIVACY_PATH,
                  terms_path: SMS_TERMS_PATH,
                  source: consentSource,
                  verification_channel: "sms",
                }),
              ]
            : []),
        ];

        const { error: consentError } = await adminSupabase
          .schema("communication")
          .from("sms_consent")
          .upsert(consentRows, { onConflict: "phone_number,consent_type" });

        if (consentError) {
          console.error("Failed to record verified SMS consent:", consentError);
          return NextResponse.json(
            {
              success: false,
              msg: "Phone verified, but consent could not be recorded",
            },
            { status: 500 },
          );
        }

        // 🚨 ONE DOOR, BECAUSE REACHABILITY IS ONE FACT.
        //
        // Until 2026-09-22 this route wrote two of the three rows a verified
        // phone needs and stopped. It called
        // `communication.record_verified_sms_phone` (the account + HR contact
        // graph) and then upserted `{user_id, organization_id, phone_number,
        // sms_enabled}` by hand. Both halves of reachability were missing:
        //
        //   TEXT  — `lib/sms/receive.ts` matches an inbound message on
        //           `assistant_destination_id` + `assistant_program_key`, and
        //           nothing here ever wrote them. The person's first text
        //           produced no message row, no ops.system_error row and no
        //           reply. NOBODY WHO VERIFIED SINCE THE AUGUST BACKFILL
        //           (`communications_p0_shared_assistant_binding`) WAS
        //           REACHABLE — measured live: test@test.com, 2026-09-21.
        //
        //   VOICE — `communication.resolve_voice_owner_call_context` needs a
        //           claimed `crm.party` plus a verified phone medium and
        //           contact point IN THE ORGANIZATION THIS ENROLLMENT NAMES.
        //           `record_verified_sms_phone`'s party step is
        //           `crm.ensure_user_party`, which was hardcoded to the AI
        //           Matrx tenant, so the enrollment's own organization was
        //           never among the parties it touched.
        //
        // They are not two features. Binding the text half alone is what made
        // a peer's voice test go red on 2026-09-22: a text-bound number with
        // no CRM caller context is a person who can be texted and cannot be
        // called. `communication.enroll_verified_phone_for_assistant` writes
        // all three together, idempotently, and is the ONLY writer of the
        // binding — this route does not get a second copy of it.
        const { data: enrollment, error: enrollmentError } = await adminSupabase
          .schema("communication")
          .rpc("enroll_verified_phone_for_assistant", {
            p_user_id: user.id,
            p_organization_id: organizationId,
            p_phone_number: phoneNumber,
            p_verified_at: consentRecordedAt,
            p_source: "twilio_verify",
          });

        if (enrollmentError) {
          console.error(
            "Failed to enroll the verified phone for the assistant:",
            enrollmentError,
          );
          return NextResponse.json(
            {
              success: false,
              msg: "Phone verified, but the enrollment could not be completed",
            },
            { status: 500 },
          );
        }

        // 🚨 NOTHING FAILS SILENTLY. The door can succeed and still leave the
        // person unreachable by text — when the platform has no active
        // assistant number, or more than one, it refuses to guess and says so
        // by name. That is an operator gap, not this person's problem, so the
        // verification stands and the gap is announced rather than swallowed.
        const outcome = enrollment as {
          assistant_binding?: string;
          text_reachable?: boolean;
          voice_reachable?: boolean;
        } | null;
        // A person who did not opt in to Personal Staff is correctly not bound
        // to it — that is their choice, not an operator gap.
        if (
          outcome &&
          outcome.text_reachable !== true &&
          outcome.assistant_binding !== "personal_staff_consent_missing"
        ) {
          console.error(
            `[sms-enrollment] ${user.id} verified ${phoneNumber} but is NOT reachable by text: ` +
              `${outcome.assistant_binding ?? "unknown"}. Remedy: exactly one row in ` +
              `communication.sms_phone_numbers must be is_active AND assistant_enabled with a ` +
              `provider_account_id (Administration → SMS → Numbers).`,
          );
        }

        return NextResponse.json({
          success: true,
          msg: `Phone number verified. ${[
            notificationsConsent ? "AI Matrx notifications" : null,
            personalStaffConsent ? "Personal Staff" : null,
          ]
            .filter(Boolean)
            .join(" and ")} text messages are on.`,
          data: {
            status: result.status,
            phoneNumber,
            assistantBinding: outcome?.assistant_binding ?? null,
            textReachable: outcome?.text_reachable ?? false,
            voiceReachable: outcome?.voice_reachable ?? false,
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, msg: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    // The organization refusal is an ANSWER, not a failure: it carries the
    // caller's own memberships so the client can hold the action, show the
    // picker and retry. Collapsing it into the generic 500 below would turn
    // the one question the person can answer into a dead end.
    if (isOrganizationRequiredServerError(err)) {
      return organizationRequiredResponse(err);
    }
    console.error("Error in verify route:", err);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}
