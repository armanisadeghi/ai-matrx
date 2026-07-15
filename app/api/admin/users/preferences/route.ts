// Super-Admin-only: read an arbitrary user's actual preferences.
//
// GET /api/admin/users/preferences?userId=<id>
//   → the user's users.user_preferences row (the 27-module JSONB blob) +
//     updated_at. Read via the service-role admin client (the FE slice fetch is
//     self-scoped and can't read another user). Gated by requireSuperAdmin().

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("users")
    .from("user_preferences")
    .select("user_id, organization_id, preferences, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ exists: false, preferences: null });

  return NextResponse.json({
    exists: true,
    preferences: data.preferences,
    organization_id: data.organization_id,
    updated_at: data.updated_at,
  });
}
