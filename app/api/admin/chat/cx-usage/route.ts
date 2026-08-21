// Super-Admin-only CX usage & cost aggregate.
//
// GET /api/admin/chat/cx-usage?start=<iso>&end=<iso>
//   → chat.cx_usage_analytics(p_start, p_end): jsonb aggregate over
//     chat.request (by_model / by_day / by_provider / total_requests).
//
// The RPC is SECURITY DEFINER with EXECUTE granted ONLY to service_role, so it
// must run on the admin client — the user client is refused by design. Gated
// here by requireSuperAdmin(), the same pattern as
// app/api/admin/users/usage/route.ts. The shared server helper
// fetchCxUsageAnalyticsRange (features/cx-dashboard/service.ts) owns the gate,
// the RPC call, and the jsonb→typed coercion; the usage tab's server component
// calls it directly without this HTTP round trip.

import { NextRequest, NextResponse } from "next/server";
import { fetchCxUsageAnalyticsRange } from "@/features/cx-dashboard/service";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  try {
    const analytics = await fetchCxUsageAnalyticsRange(start, end);
    return NextResponse.json({ analytics });
  } catch (e) {
    return errorResponse(e);
  }
}
