// app/api/admin/bundles/[id]/members/route.ts
//
// Admin-gated insert for tool_bundle_member (RLS read-only, no write policy).

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

    const supabase = createAdminClient();
    const { error } = await supabase.schema("tool").from("bundle_member").insert({
      bundle_id: bundleId,
      tool_id,
      local_alias,
      sort_order: typeof sort_order === "number" ? sort_order : 100,
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
