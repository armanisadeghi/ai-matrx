import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Aliased select that restores the old column names for callers.
// platform.categories renames: label→name, icon_name→icon, sort_order→position,
// parent_category_id→parent_id. Metadata-backed fields surfaced via json path.
const CATEGORY_SELECT = [
  "id",
  "label:name",
  "icon_name:icon",
  "color",
  "placement_type",
  "parent_category_id:parent_id",
  "sort_order:position",
  "organization_id",
  "created_at",
  "updated_at",
  "metadata",
  "description:metadata->>description",
  "is_active:metadata->>is_active",
  "enabled_features:metadata->enabled_features",
  "user_id:metadata->>user_id",
  "project_id:metadata->>project_id",
  "task_id:metadata->>task_id",
].join(",");

/**
 * `metadata->>field` extracts JSONB values as text, so boolean fields come back
 * as the strings "true" / "false". Coerce them back to real booleans so
 * downstream consumers (categoryRowToDef) receive the correct type.
 */
function coerceCategoryRow<T extends { is_active?: unknown }>(row: T): T {
  if (typeof row.is_active === "string") {
    return { ...row, is_active: row.is_active === "true" };
  }
  return row;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .schema("platform")
      .from("categories")
      .select(CATEGORY_SELECT)
      .eq("dimension", "shortcut")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching shortcut category:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch shortcut category",
          details: error.message,
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Shortcut category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: coerceCategoryRow(data) });
  } catch (error) {
    console.error("Error in GET /api/agent-shortcut-categories/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    // Map old column names to new platform.categories schema.
    const topLevel: Record<string, unknown> = {};
    const metadataUpdates: Record<string, unknown> = {};
    let hasUpdates = false;

    if ("label" in body) { topLevel.name = body.label; hasUpdates = true; }
    if ("icon_name" in body) { topLevel.icon = body.icon_name; hasUpdates = true; }
    if ("color" in body) { topLevel.color = body.color; hasUpdates = true; }
    if ("placement_type" in body) { topLevel.placement_type = body.placement_type; hasUpdates = true; }
    if ("parent_category_id" in body) { topLevel.parent_id = body.parent_category_id; hasUpdates = true; }
    if ("sort_order" in body) { topLevel.position = body.sort_order; hasUpdates = true; }
    if ("organization_id" in body) { topLevel.organization_id = body.organization_id; hasUpdates = true; }

    if ("description" in body) { metadataUpdates.description = body.description; hasUpdates = true; }
    if ("is_active" in body) { metadataUpdates.is_active = body.is_active; hasUpdates = true; }
    if ("enabled_features" in body) { metadataUpdates.enabled_features = body.enabled_features; hasUpdates = true; }
    if ("user_id" in body) { metadataUpdates.user_id = body.user_id; hasUpdates = true; }
    if ("project_id" in body) { metadataUpdates.project_id = body.project_id; hasUpdates = true; }
    if ("task_id" in body) { metadataUpdates.task_id = body.task_id; hasUpdates = true; }

    if (!hasUpdates) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    // Merge metadata patch if needed (use jsonb concat via the update payload).
    if (Object.keys(metadataUpdates).length > 0) {
      // PostgREST doesn't support partial jsonb merge via update directly;
      // pass metadata as a plain object that replaces only the specified sub-keys
      // by fetching existing metadata first and merging server-side.
      const { data: existing } = await supabase
        .schema("platform")
        .from("categories")
        .select("metadata")
        .eq("dimension", "shortcut")
        .eq("id", id)
        .maybeSingle();

      topLevel.metadata = {
        ...(existing?.metadata as Record<string, unknown> | null ?? {}),
        ...metadataUpdates,
      };
    }

    const updatePayload = { ...topLevel };

    const { data, error } = await supabase
      .schema("platform")
      .from("categories")
      .update(updatePayload as never)
      .eq("dimension", "shortcut")
      .eq("id", id)
      .select(CATEGORY_SELECT)
      .maybeSingle();

    if (error) {
      console.error("Error updating shortcut category:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        {
          error: "Failed to update shortcut category",
          details: error.message,
        },
        { status },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Shortcut category not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: coerceCategoryRow(data) });
  } catch (error) {
    console.error("Error in PATCH /api/agent-shortcut-categories/[id]:", error);
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
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error, count } = await supabase
      .schema("platform")
      .from("categories")
      .delete({ count: "exact" })
      .eq("dimension", "shortcut")
      .eq("id", id);

    if (error) {
      console.error("Error deleting shortcut category:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        {
          error: "Failed to delete shortcut category",
          details: error.message,
        },
        { status },
      );
    }

    if (!count) {
      return NextResponse.json(
        { error: "Shortcut category not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error in DELETE /api/agent-shortcut-categories/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
