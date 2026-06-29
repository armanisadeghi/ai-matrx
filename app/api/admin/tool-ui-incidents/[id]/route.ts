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

/**
 * PUT - Resolve or update an incident.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const updateData: TablesUpdate<{ schema: "tool" }, "ui_incident"> = {};

    if (body.resolved !== undefined) {
      updateData.resolved = body.resolved;
      if (body.resolved) {
        updateData.resolved_at = new Date().toISOString();
      } else {
        updateData.resolved_at = null;
        updateData.resolved_by = null;
      }
    }
    if (body.resolved_by !== undefined) {
      updateData.resolved_by = body.resolved_by;
    }
    if (body.resolution_notes !== undefined) {
      updateData.resolution_notes = body.resolution_notes;
    }

    const { data, error } = await supabase
      .schema("tool")
      .from("ui_incident")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update incident", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ message: "Incident updated", incident: data });
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

/**
 * DELETE - Remove an incident.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .schema("tool")
      .from("ui_incident")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete incident", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ message: "Incident deleted" });
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
