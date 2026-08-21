// Super-Admin-only per-user AI usage & cost rollup.
//
// GET /api/admin/users/usage?from=<iso>&to=<iso>
//   → chat.admin_user_usage_rollup(from, to): one row per user with total
//     requests, tokens, stored cost, distinct models, last activity, and a
//     per-origin-class breakdown of that spend (by_origin — the witnessed trust
//     axis, chat.user_request.origin_class).
//
// The RPC is SECURITY DEFINER + service-role only (joins auth.users for email);
// gated here by requireSuperAdmin().

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type { AdminUserUsageRow } from "@/features/admin/users/types";
import { normalizeUsageOrigins } from "@/features/admin/users/lib/usageOrigins";

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

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("chat")
    .rpc("admin_user_usage_rollup", {
      p_from: from ?? undefined,
      p_to: to ?? undefined,
    });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: AdminUserUsageRow[] = ((data ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      ...(r as unknown as AdminUserUsageRow),
      by_origin: normalizeUsageOrigins(r.by_origin),
    }),
  );

  return NextResponse.json({ rows });
}
