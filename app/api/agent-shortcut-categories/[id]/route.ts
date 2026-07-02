import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";
import {
  coerceLegacyCategoryIsActive,
  platformCategoryToLegacyRow,
  PLATFORM_CATEGORY_SELECT,
} from "../_lib/categoryRow";

type CategoryUpdate = Database["platform"]["Tables"]["categories"]["Update"];

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
      .select(PLATFORM_CATEGORY_SELECT)
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

    return NextResponse.json({
      data: coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(data)),
    });
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

    const topLevel: CategoryUpdate = {};
    const metadataUpdates: Record<string, unknown> = {};
    let hasUpdates = false;
    const typeErrors: string[] = [];

    if ("label" in body) {
      if (typeof body.label === "string") { topLevel.name = body.label; hasUpdates = true; }
      else typeErrors.push("label must be a string");
    }
    if ("icon_name" in body) {
      if (typeof body.icon_name === "string" || body.icon_name === null) { topLevel.icon = body.icon_name; hasUpdates = true; }
      else typeErrors.push("icon_name must be a string or null");
    }
    if ("color" in body) {
      if (typeof body.color === "string" || body.color === null) { topLevel.color = body.color; hasUpdates = true; }
      else typeErrors.push("color must be a string or null");
    }
    if ("placement_type" in body) {
      if (typeof body.placement_type === "string" || body.placement_type === null) { topLevel.placement_type = body.placement_type; hasUpdates = true; }
      else typeErrors.push("placement_type must be a string or null");
    }
    if ("parent_category_id" in body) {
      if (typeof body.parent_category_id === "string" || body.parent_category_id === null) { topLevel.parent_id = body.parent_category_id; hasUpdates = true; }
      else typeErrors.push("parent_category_id must be a string or null");
    }
    if ("sort_order" in body) {
      if (typeof body.sort_order === "number" || body.sort_order === null) { topLevel.position = body.sort_order; hasUpdates = true; }
      else typeErrors.push("sort_order must be a number or null");
    }
    if ("organization_id" in body) {
      if (typeof body.organization_id === "string") { topLevel.organization_id = body.organization_id; hasUpdates = true; }
      else typeErrors.push("organization_id must be a string");
    }

    if (typeErrors.length > 0) {
      return NextResponse.json(
        { error: "Invalid field types", details: typeErrors },
        { status: 400 },
      );
    }

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

    if (Object.keys(metadataUpdates).length > 0) {
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

    const { data, error } = await supabase
      .schema("platform")
      .from("categories")
      .update(topLevel)
      .eq("dimension", "shortcut")
      .eq("id", id)
      .select(PLATFORM_CATEGORY_SELECT)
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

    return NextResponse.json({
      data: coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(data)),
    });
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
