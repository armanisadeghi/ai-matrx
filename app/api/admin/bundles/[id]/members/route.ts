// app/api/admin/bundles/[id]/members/route.ts
//
// Admin-gated add of a bundle member. The legacy tool↔bundle junction collapsed
// into `platform.associations` (a tool → tool_bundle edge, role='member').
// Writes go through the signed-in admin's OWN client, never the service-role
// admin client: `platform._stamp_actor_tier` refuses a service-role write to
// platform.associations (tier `code`, no actor_system → 23514), and RLS's
// `platform_admin_all` already lets a platform admin write every edge. The
// admin clicking is the author; their session stamps `human` + their id.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id: bundleId } = await params;
    const body = await request.json();

    const { tool_id, local_alias, sort_order } = body;
    if (!tool_id || !local_alias) {
      return NextResponse.json(
        { error: "Missing required fields: tool_id, local_alias" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // The bundle owns the org the membership edge belongs to (mirrors the collapse).
    const bundleRes = await supabase
      .schema("tool").from("bundle")
      .select("organization_id")
      .is("deleted_at", null)
      .eq("id", bundleId)
      .single();
    if (bundleRes.error) {
      return NextResponse.json(
        { error: "Bundle not found", details: bundleRes.error.message },
        { status: 404 },
      );
    }

    // One tool → tool_bundle 'member' edge: position = sort_order, alias in metadata.
    const { error } = await supabase
      .schema("platform").from("associations")
      .insert({
        source_type: "tool",
        source_id: tool_id,
        target_type: "tool_bundle",
        target_id: bundleId,
        organization_id: bundleRes.data.organization_id,
        role: "member",
        position: typeof sort_order === "number" ? sort_order : 100,
        metadata: { local_alias },
      });

    if (error) {
      return NextResponse.json(
        { error: "Failed to add bundle member", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
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
