// GET /api/admin/surfaces/drift-report
//
// Returns the code-vs-DB drift for SurfaceValue declarations plus a list of
// broken `surface_value` mappings on agent/tool bindings.
//
// Super-admin only. Read-only — no DB writes.

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { computeDriftReport } from "@/features/tool-registry/surfaces/services/manifest-sync.service";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  try {
    const supabase = await createClient();
    const report = await computeDriftReport(supabase);
    return NextResponse.json({ report });
  } catch (e) {
    return errorResponse(e);
  }
}
