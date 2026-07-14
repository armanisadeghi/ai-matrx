// Super-Admin-only preferences-drift report + heal.
//
// GET  → per-user legacy preferences drift (users.user_preferences_drift_report).
// POST → run the healer (users.heal_user_preferences_drift), returns count.
//
// Both DB functions are SECURITY DEFINER and revoked from `authenticated`; this
// route reaches them through the service-role admin client (RLS/grant bypass),
// gated by requireSuperAdmin(). The healer is the same function the weekly
// pg_cron job runs — this is the manual "heal now" path.

import { NextResponse } from "next/server";
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

// GET /api/admin/users/preferences-drift — per-user drift + totals.
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const admin = createAdminClient();

  const [{ data: rows, error: rowsErr }, { count, error: countErr }] =
    await Promise.all([
      admin.schema("users").rpc("user_preferences_drift_report"),
      admin
        .schema("users")
        .from("user_preferences")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null),
    ]);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  if (countErr)
    return NextResponse.json({ error: countErr.message }, { status: 500 });

  const drifted = rows ?? [];
  return NextResponse.json({
    total: count ?? 0,
    drifted: drifted.length,
    rows: drifted,
  });
}

// POST /api/admin/users/preferences-drift — heal every drifted row now.
export async function POST() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("users")
    .rpc("heal_user_preferences_drift");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ healed: data ?? 0 });
}
