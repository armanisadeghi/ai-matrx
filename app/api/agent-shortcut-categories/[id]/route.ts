import { createClient } from "@/utils/supabase/server";
import { catWriteArgs, categoryRow } from "@/lib/db/category-door";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { toGlobalOwnershipWire } from "@/lib/organizations/globalOwnership";
import {
  coerceLegacyCategoryIsActive,
  platformCategoryToLegacyRow,
  PLATFORM_CATEGORY_SELECT,
  type PlatformCategorySelectRow,
} from "../_lib/categoryRow";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

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
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .schema("platform")
      .from("categories")
      .select(PLATFORM_CATEGORY_SELECT)
      .is("deleted_at", null)
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
      // A system-org row IS global — see lib/organizations/globalOwnership.ts.
      data: toGlobalOwnershipWire(
        coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(categoryRow<PlatformCategorySelectRow>(data)!)),
        await resolveSystemOrgId(supabase),
      ),
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
    } = await getClaimsUser(supabase);

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

    // THE DOOR, and it deletes the read-modify-write above with it: `cat_write` MERGES
    // the metadata patch inside the database, so the round trip that read the column in
    // order not to wipe it is gone — and with it the window where a sibling key written
    // between the read and the write was lost. The door also resolves the row by
    // (id, dimension) TOGETHER, which is what the hand-written `.eq("dimension", …)`
    // beside every one of these filters was standing in for.
    const { data, error } = await supabase.rpc(
      "cat_write",
      catWriteArgs(
        "shortcut",
        {
          name: topLevel.name,
          icon: topLevel.icon,
          color: topLevel.color,
          placementType: topLevel.placement_type,
          position: topLevel.position,
          parentId: topLevel.parent_id,
          ...(Object.keys(metadataUpdates).length === 0
            ? {}
            : { metadata: metadataUpdates }),
        },
        { id },
      ),
    );

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
      // A system-org row IS global — see lib/organizations/globalOwnership.ts.
      data: toGlobalOwnershipWire(
        coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(categoryRow<PlatformCategorySelectRow>(data)!)),
        await resolveSystemOrgId(supabase),
      ),
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
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🚨 SOFT, NOW. This was a HARD `.delete()` on a table more than thirty tables carry
    // a foreign key to — `agent.shortcut.category_id` among them, ON DELETE CASCADE — so
    // removing a category took every shortcut filed under it with it. `cat_archive`
    // soft-deletes, like `cat_delete` and every sibling writer already did.
    const { data: archived, error } = await supabase.rpc("cat_archive", {
      p_dimension: "shortcut",
      p_category_id: id,
    });
    const count = archived ? 1 : 0;

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
