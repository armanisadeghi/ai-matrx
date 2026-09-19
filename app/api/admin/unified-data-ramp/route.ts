// app/api/admin/unified-data-ramp/route.ts
//
// THE SWITCH SCREEN'S ONE ROUTE. Three verbs, one file:
//
//   GET  ?organizationId=…                      → the ramp, consumer by consumer
//   POST { action: "gate",  consumerId, organizationId }  → run Test 1 now
//   POST { action: "set",   consumerId, organizationId, on, userId?, note? }
//                                               → THE SWITCH
//
// WHY AN API ROUTE AT ALL, when this repo's law is that reads and writes go
// straight to Supabase. The three ramp doors are SECURITY DEFINER functions
// whose `platform.client_callable_door` rows declare them SERVER-ONLY, so the
// DDL guard has revoked EXECUTE from `anon` and `authenticated` — deliberately.
// They read every principal's grants in an organization and they switch a whole
// organization onto a different data store; that is an administrative surface,
// not a user one. The route is the repo's named exception: an admin-only
// operation holding the service key, which it may use ONLY after establishing
// from the caller's OWN session that they are a super admin. The identity check
// lives here because inside the function `auth.uid()` is null.
//
// THE REFUSAL IS THE DATABASE'S, NOT THIS ROUTE'S. `platform.unified_data_ramp_set`
// runs the consumer's Test 1 gate itself and raises when it is not green. This
// route does not re-implement that judgement, it just carries the sentence back
// to the screen — so the switch cannot be talked past by a second client.

import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";

export const dynamic = "force-dynamic";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

function fail(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : fallbackStatus;
  return NextResponse.json({ error: message }, { status, headers: NO_CACHE });
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        {
          error:
            "The ramp is per organization — name the organization whose ramp you want with " +
            "?organizationId=… . There is no platform-wide view of a switch that is set per " +
            "organization.",
        },
        { status: 400, headers: NO_CACHE },
      );
    }

    const admin = createAdminClient();
    // TWO RPCs, NOT A TABLE READ. campaign_watch is not in pgrst.db_schemas and
    // must not be — the dual-engine exit comes back through its own door, like
    // everything else here.
    const [{ data: consumers, error }, exit] = await Promise.all([
      admin.schema("platform").rpc("unified_data_ramp_state", {
        p_organization_id: organizationId,
      }),
      admin.schema("platform").rpc("unified_data_ramp_exit"),
    ]);
    if (error) throw new Error(error.message);
    if (exit.error) throw new Error(exit.error.message);

    return NextResponse.json(
      { organizationId, consumers: consumers ?? [], dualEngineExit: exit.data ?? [] },
      { headers: NO_CACHE },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actingUserId = await requireSuperAdmin();
    const body = (await request.json()) as {
      action?: string;
      consumerId?: string;
      organizationId?: string;
      on?: boolean;
      userId?: string | null;
      note?: string | null;
    };

    const { action, consumerId, organizationId } = body;
    if (!consumerId || !organizationId) {
      return NextResponse.json(
        { error: "Both consumerId and organizationId are required." },
        { status: 400, headers: NO_CACHE },
      );
    }

    const admin = createAdminClient();

    if (action === "gate") {
      const { data, error } = await admin
        .schema("platform")
        .rpc("unified_data_ramp_gate", {
          p_consumer: consumerId,
          p_organization_id: organizationId,
        });
      if (error) throw new Error(error.message);
      return NextResponse.json({ gate: data }, { headers: NO_CACHE });
    }

    if (action === "set") {
      if (typeof body.on !== "boolean") {
        return NextResponse.json(
          { error: 'The "set" action needs on: true or on: false.' },
          { status: 400, headers: NO_CACHE },
        );
      }
      const { data, error } = await admin
        .schema("platform")
        .rpc("unified_data_ramp_set", {
          p_consumer: consumerId,
          p_organization_id: organizationId,
          p_on: body.on,
          p_user_id: body.userId ?? undefined,
          p_note: body.note ?? undefined,
          // THE ACTING PERSON, carried into the database. The override is
          // stamped with THIS admin, and the door refuses without it: auth.uid()
          // is null on a service-key connection, and the knob writer answers a
          // silent `{"ok": false, "reason": "not_authenticated"}` rather than
          // raising — which is how the switch once ran its gate, reported green
          // and wrote nothing at all.
          p_acting_user_id: actingUserId,
        });
      if (error) {
        // THE GATE'S REFUSAL, carried through verbatim. It already says which
        // verdict stopped it and what to do; wrapping it in our own words would
        // lose the only sentence that names the cause.
        return NextResponse.json(
          { error: error.message, refusedByGate: true },
          { status: 409, headers: NO_CACHE },
        );
      }
      return NextResponse.json({ gate: data, on: body.on }, { headers: NO_CACHE });
    }

    return NextResponse.json(
      { error: `Unknown action "${action ?? ""}". It is "gate" or "set".` },
      { status: 400, headers: NO_CACHE },
    );
  } catch (error) {
    return fail(error);
  }
}
