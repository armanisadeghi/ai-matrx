// app/api/admin/bundles/[id]/members/[toolId]/route.ts
//
// Admin-gated alias update + removal of one bundle member. The legacy tool↔bundle
// junction collapsed into `platform.associations` (a tool → tool_bundle edge,
// role='member'); the alias lives in the edge's metadata.local_alias. The
// service-role admin client is required — authenticated has no direct grant on
// platform.associations, and this route has no user JWT for the assoc_* RPCs.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
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

    const supabase = createAdminClient();

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

    const { error } = await supabase
      .schema("platform").from("associations")
      .update({ metadata: { ...prevMeta, local_alias: body.local_alias } })
      .eq("source_type", "tool")
      .eq("source_id", toolId)
      .eq("target_type", "tool_bundle")
      .eq("target_id", bundleId)
      .eq("role", "member");

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
      .schema("platform").from("associations")
      .delete()
      .eq("source_type", "tool")
      .eq("source_id", toolId)
      .eq("target_type", "tool_bundle")
      .eq("target_id", bundleId)
      .eq("role", "member");

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
