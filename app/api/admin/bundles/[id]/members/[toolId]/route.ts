// app/api/admin/bundles/[id]/members/[toolId]/route.ts
//
// Admin-gated alias update + removal for tool_bundle_member
// (RLS read-only, no write policy).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireAdmin } from "@/utils/auth/adminUtils";

function authErrorResponse(error: unknown): NextResponse | null {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Unauthorized")) {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  if (message.startsWith("Forbidden")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> },
) {
  try {
    await requireAdmin();
    const { id: bundleId, toolId } = await params;
    const body = await request.json();

    if (typeof body.local_alias !== "string" || !body.local_alias) {
      return NextResponse.json(
        { error: "local_alias is required" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .schema("tool").from("bundle_member")
      .update({ local_alias: body.local_alias })
      .eq("bundle_id", bundleId)
      .eq("tool_id", toolId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update bundle member", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> },
) {
  try {
    await requireAdmin();
    const { id: bundleId, toolId } = await params;

    const supabase = createAdminClient();
    const { error } = await supabase
      .schema("tool").from("bundle_member")
      .delete()
      .eq("bundle_id", bundleId)
      .eq("tool_id", toolId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to remove bundle member", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
