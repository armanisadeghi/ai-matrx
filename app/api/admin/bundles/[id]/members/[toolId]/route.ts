// app/api/admin/bundles/[id]/members/[toolId]/route.ts
//
// Admin-gated alias update + removal of one bundle member. The legacy tool↔bundle
// junction collapsed into `platform.associations` (a tool → tool_bundle edge,
// role='member'); the alias lives in the edge's metadata.local_alias.
// Writes go through the signed-in admin's OWN client, never the service-role
// admin client: `platform._stamp_actor_tier` refuses a service-role write to
// platform.associations (tier `code`, no actor_system → 23514), and RLS's
// `platform_admin_all` already lets a platform admin write every edge. The
// admin clicking is the author; their session stamps `human` + their id.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/auth/adminUtils";
import { isJsonObject } from "@/types/json";

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

    const supabase = await createClient();

    // The alias lives in the edge's metadata; merge to preserve other keys
    // (e.g. the legacy_table / legacy_id provenance from the collapse).
    const existing = await supabase
      .schema("platform").from("associations")
      .select("metadata")
      .eq("source_type", "tool")
      .eq("source_id", toolId)
      .eq("target_type", "tool_bundle")
      .eq("target_id", bundleId)
      .eq("role", "member")
      // Tombstoned edges (an endpoint entity was trashed) are not members — D135.
      .is("deleted_at", null)
      .maybeSingle();
    if (existing.error) {
      return NextResponse.json(
        { error: "Failed to load bundle member", details: existing.error.message },
        { status: 500 },
      );
    }
    if (!existing.data) {
      return NextResponse.json(
        { error: "Bundle member not found" },
        { status: 404 },
      );
    }
    const prevMeta = isJsonObject(existing.data.metadata)
      ? existing.data.metadata
      : {};

    // DOORS-ONLY: `platform` is not a client-writable schema. `assoc_add` is the
    // canonical association door and upserts on
    // (source_type, source_id, target_type, target_id, role) — with the edge
    // already present this IS the update, and the door decides through the one
    // ladder instead of this table's RLS. `metadata` is replaced wholesale by
    // the door, which is why the previous value is merged here first, exactly as
    // the direct UPDATE did. `p_position` and `p_label` are left out on purpose:
    // the door coalesces them, so the member keeps its sort order and label.
    const { error } = await supabase.rpc("assoc_add", {
      p_source_type: "tool",
      p_source_id: toolId,
      p_target_type: "tool_bundle",
      p_target_id: bundleId,
      p_role: "member",
      p_metadata: { ...prevMeta, local_alias: body.local_alias },
    } as never);

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

    const supabase = await createClient();
    // DOORS-ONLY: `platform` is not a client-writable schema. `assoc_remove` is
    // the canonical door for taking an edge down, and it decides through the one
    // ladder rather than this table's RLS.
    const { error } = await supabase.rpc("assoc_remove", {
      p_source_type: "tool",
      p_source_id: toolId,
      p_target_type: "tool_bundle",
      p_target_id: bundleId,
      p_role: "member",
    } as never);

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
