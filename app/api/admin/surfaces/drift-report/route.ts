// GET /api/admin/surfaces/drift-report
//
// Returns the code-vs-DB drift for SurfaceValue declarations plus a list of
// broken `surface_value` mappings on agent/tool bindings.
//
// Super-admin only. Read-only — no DB writes.

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { computeDriftReport } from "@/features/surfaces/services/manifest-sync.service";
// ONE error→status mapping for this route family, and the only thing that
// describes a PostgREST failure (thrown as a plain object, never an Error).
import { errorResponse } from "@/app/api/admin/surfaces/error-response";

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
