// app/api/admin/tools/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/auth/adminUtils";
import { parseSemver } from "@/features/admin/applications/version";
import type { Database } from "@/types/database.types";

const EDITABLE_FIELDS = [
  "description",
  "parameters",
  "output_schema",
  "annotations",
  "category",
  "tags",
  "icon",
  "semver",
  "version",
  "is_active",
] as const;

type ToolUpdate = Database["tool"]["Tables"]["definition"]["Update"];

export function editableToolPatch(body: Record<string, unknown>): ToolUpdate {
  return Object.fromEntries(
    EDITABLE_FIELDS.filter((field) => Object.hasOwn(body, field)).map(
      (field) => [field, body[field]],
    ),
  ) as ToolUpdate;
}

// Map requireAdmin() throws to the right HTTP status; returns null otherwise.
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
      .schema("tool").from("definition")
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 });
      }
      console.error("Error fetching tool:", error);
      return NextResponse.json(
        { error: "Failed to fetch tool", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ tool: data });
  } catch (error) {
    console.error("API error:", error);
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
    const supabase = await createClient();
    const body = (await request.json()) as Record<string, unknown>;
    const updateData = editableToolPatch(body);

    // Validate JSON fields if provided
    if (updateData.parameters && typeof updateData.parameters !== "object") {
      return NextResponse.json(
        { error: "Parameters must be a valid JSON object" },
        { status: 400 },
      );
    }

    if (
      updateData.output_schema &&
      typeof updateData.output_schema !== "object"
    ) {
      return NextResponse.json(
        { error: "Output schema must be a valid JSON object" },
        { status: 400 },
      );
    }

    if (updateData.annotations && !Array.isArray(updateData.annotations)) {
      return NextResponse.json(
        { error: "Annotations must be an array" },
        { status: 400 },
      );
    }

    if (
      updateData.version !== undefined &&
      (!Number.isInteger(updateData.version) || updateData.version < 1)
    ) {
      return NextResponse.json(
        { error: "Version must be a positive integer" },
        { status: 400 },
      );
    }

    if (
      updateData.semver !== undefined &&
      (typeof updateData.semver !== "string" ||
        !parseSemver(updateData.semver))
    ) {
      return NextResponse.json(
        { error: "Semantic version must use major.minor.patch format" },
        { status: 400 },
      );
    }
    if (typeof updateData.semver === "string") {
      updateData.semver = updateData.semver.trim();
    }

    // Convert empty strings to null for nullable fields
    if (updateData.category === "") updateData.category = null;
    if (updateData.icon === "") updateData.icon = null;

    const { data, error } = await supabase
      .schema("tool").from("definition")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 });
      }
      console.error("Error updating tool:", error);
      return NextResponse.json(
        { error: "Failed to update tool", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Tool updated successfully",
      tool: data,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("API error:", error);
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
    const supabase = await createClient();

    const { error } = await supabase
      .schema("tool")
      .from("definition")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();

    if (error) {
      // Missing and RLS-hidden rows intentionally share one response so this
      // admin endpoint does not become an existence oracle.
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 });
      }
      console.error("Error deleting tool:", error);
      return NextResponse.json(
        { error: "Failed to delete tool", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Tool deleted successfully",
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
