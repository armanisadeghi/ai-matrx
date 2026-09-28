// Super-Admin-only: look up an auth user by email so the UI can resolve
// "promote bob@example.com" to a user_id before calling /api/admin/admins.

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

// GET /api/admin/admins/lookup?email=bob@example.com
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_find_user_by_email", {
    p_email: email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // RPC returns a row set (zero or one row).
  return NextResponse.json({ user: data?.[0] ?? null });
}
