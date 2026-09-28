// Super-Admin-only: read the admin audit log.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { extractErrorMessage } from "@/utils/errors";

function errorResponse(error: unknown) {
  const message = extractErrorMessage(error, "Unknown error");
  const status = message.startsWith("Unauthorized") ? 401
    : message.startsWith("Forbidden") ? 403
    : 400;
  return NextResponse.json({ error: message }, { status });
}

// GET /api/admin/admins/audit?limit=100&offset=0
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_audit", {
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
