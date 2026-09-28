// Super-Admin-only update / revoke on a specific admin row.
// Defense: requireSuperAdmin() + DB RPC is_super_admin() check.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import type { Database, Json } from "@/types/database.types";
import { extractErrorMessage } from "@/utils/errors";

type AdminLevel = Database["public"]["Enums"]["admin_level"];

function errorResponse(error: unknown) {
  const message = extractErrorMessage(error, "Unknown error");
  const status = message.startsWith("Unauthorized") ? 401
    : message.startsWith("Forbidden") || message.startsWith("Cannot") ? 403
    : 400;
  return NextResponse.json({ error: message }, { status });
}

// PATCH /api/admin/admins/[userId]
// Body: { level?, permissions?, metadata? } — null/undefined fields skipped
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as {
    level?: AdminLevel | null;
    permissions?: Json | null;
    metadata?: Json | null;
  } | null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update", {
    target_user_id: userId,
    target_level: body?.level ?? undefined,
    target_permissions: body?.permissions ?? undefined,
    target_metadata: body?.metadata ?? undefined,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23503" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ admin: data });
}

// DELETE /api/admin/admins/[userId] — revoke admin status
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const { userId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_revoke", {
    target_user_id: userId,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23503" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ admin: data });
}
