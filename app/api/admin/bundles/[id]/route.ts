// app/api/admin/bundles/[id]/route.ts
//
// Admin-gated writes for tool_bundle. The table is RLS-protected with a
// read-only (SELECT) policy and no write policy, so mutations must run through
// the admin client after an admin gate. Reads stay client-side (public SELECT).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireAdmin } from "@/utils/auth/adminUtils";
import type { TablesUpdate } from "@/types/database.types";

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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();

    const allowed = [
      "name",
      "description",
      "is_active",
      "metadata",
      "lister_tool_id",
    ] as const satisfies readonly (keyof TablesUpdate<
      { schema: "tool" },
      "bundle"
    >)[];
    const patch: TablesUpdate<{ schema: "tool" }, "bundle"> = {};
    for (const key of allowed) {
      if (body[key] !== undefined)
        (patch as Record<string, unknown>)[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .schema("tool")
      .from("bundle")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Bundle not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Failed to update bundle", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ bundle: data });
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
