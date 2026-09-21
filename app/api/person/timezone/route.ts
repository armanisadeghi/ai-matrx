/**
 * POST /api/person/timezone
 *
 * THE ONE DOOR THROUGH WHICH THE BROWSER TELLS US WHAT TIME IT IS WHERE THE
 * PERSON IS.
 *
 * 749 of 766 people on the platform have no timezone recorded anywhere, so the
 * SMS send gate judges their quiet hours in UTC — a text meant for 2pm local is
 * held back in the middle of their afternoon. The browser has known the answer
 * the whole time (`Intl.DateTimeFormat().resolvedOptions().timeZone`); nothing
 * ever carried it to the server.
 *
 * 🚨 THE DECISION TO WRITE IS THE DATABASE'S, NOT THIS ROUTE'S.
 * `communication.record_person_timezone` (aidream migration 1015, SECURITY
 * DEFINER, server-only) writes only when nothing the person THEMSELVES has
 * declared already answers the question. So this route does not pre-check, does
 * not compare, and does not retry: it hands over the three facts it is allowed
 * to know and reports the verdict back verbatim.
 *
 *   outcome ∈ 'stored' | 'already_known' | 'invalid_timezone'
 *           | 'refused_missing_identity'
 *
 * WHAT IS TRUSTED AND WHAT IS NOT:
 *   • the user id comes from the VERIFIED server-side session and NEVER from
 *     the body — a body-supplied `user_id` is ignored outright (there is a test
 *     that sends one and proves it is ignored);
 *   • the organization comes from the `X-Organization-Id` header, through
 *     `ensureOrgIdServer`, and a request that names none is REFUSED with the
 *     caller's memberships attached — the same hold-ask-resume contract
 *     `app/api/sms/preferences` uses (Arman, 2026-09-19: the server never picks
 *     a tenant nobody chose);
 *   • the timezone string is DATA from a browser and is never trusted here. It
 *     goes straight to the RPC, which validates it against `pg_timezone_names`
 *     and answers `invalid_timezone` rather than storing junk.
 *
 * Nothing fails silently: an RPC error is returned as a 500 carrying the
 * message, never swallowed into a cheerful success.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from "@/lib/organizations/organizationRequiredResponse";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/** One row of `communication.record_person_timezone`'s return table. */
type RecordPersonTimezoneRow = {
  outcome: string;
  timezone: string | null;
  timezone_source: string | null;
};

type RecordPersonTimezoneArgs = {
  p_user_id: string;
  p_organization_id: string;
  p_timezone: string;
  p_source: string;
  p_channel: string;
};

/**
 * 🚨 A DECLARED GAP, NOT A HATCH. `communication.record_person_timezone` landed
 * in the database in aidream migration 1015 and is not yet in
 * `types/database.types.ts` — that file is regenerated wholesale by
 * `pnpm db-types` and is shared by every lane in this checkout, so this lane
 * does not rewrite it. Until it is regenerated, the ONE call this route makes
 * is described here, by name and by argument, so the shape is still checked at
 * every use instead of being cast away at the call site. When the generated
 * types carry the function, delete this and call `.rpc()` directly — the
 * argument names below are already the ones the function declares.
 */
type CommunicationRpc = {
  rpc(
    fn: "record_person_timezone",
    args: RecordPersonTimezoneArgs,
  ): PromiseLike<{
    data: RecordPersonTimezoneRow[] | RecordPersonTimezoneRow | null;
    error: { message: string } | null;
  }>;
};

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

    const body = (await request.json().catch(() => ({}))) as {
      timezone?: unknown;
      source?: unknown;
    };

    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
    if (!timezone) {
      return NextResponse.json(
        { success: false, msg: "A timezone is required" },
        { status: 400 },
      );
    }
    const source = typeof body.source === "string" && body.source.trim()
      ? body.source.trim()
      : "browser";

    // The organization the caller is ACTING in. Named by the header every
    // Matrx client carries; with none, the request is HELD rather than filed
    // in a tenant the server picked.
    const actingOrganizationId =
      request.headers.get("X-Organization-Id")?.trim() || undefined;
    const organizationId = await ensureOrgIdServer(supabase, actingOrganizationId);

    const communication = createAdminClient().schema(
      "communication",
    ) as unknown as CommunicationRpc;

    const { data, error } = await communication.rpc("record_person_timezone", {
      // FROM THE SESSION. Never `body.user_id` — see the header.
      p_user_id: user.id,
      p_organization_id: organizationId,
      p_timezone: timezone,
      p_source: source,
      p_channel: "sms",
    });

    if (error) {
      console.error("record_person_timezone failed:", error.message);
      return NextResponse.json(
        {
          success: false,
          msg: "Failed to record the timezone",
          error: error.message,
        },
        { status: 500 },
      );
    }

    const row = (Array.isArray(data) ? data[0] : data) ?? null;

    return NextResponse.json({
      success: true,
      outcome: row?.outcome ?? null,
      timezone_source: row?.timezone_source ?? null,
    });
  } catch (err) {
    // The organization refusal is an ANSWER, not a failure: it carries the
    // caller's own memberships so the client can hold, ask and replay.
    if (isOrganizationRequiredServerError(err)) {
      return organizationRequiredResponse(err);
    }
    console.error("Error in person/timezone POST:", err);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}
