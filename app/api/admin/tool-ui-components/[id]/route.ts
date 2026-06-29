import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .schema("tool").from("ui")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Component not found", details: error.message },
        { status: 404 },
      );
    }

    return NextResponse.json({ component: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    // tool_ui is RLS-protected with no write policy — writes must use the admin client.
    const supabase = createAdminClient();
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      "tool_id",
      "tool_name",
      "surface_name",
      "display_name",
      "results_label",
      "inline_code",
      "overlay_code",
      "utility_code",
      "header_extras_code",
      "header_subtitle_code",
      "keep_expanded_on_stream",
      "allowed_imports",
      "language",
      "is_active",
      "version",
      "notes",
      "contract_version",
    ] as const satisfies readonly (keyof TablesUpdate<{ schema: "tool" }, "ui">)[];

    const updateData: TablesUpdate<{ schema: "tool" }, "ui"> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        (updateData as Record<string, unknown>)[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .schema("tool").from("ui")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update component", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Component updated successfully",
      component: data,
    });
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase.schema("tool").from("ui").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete component", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ message: "Component deleted successfully" });
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
