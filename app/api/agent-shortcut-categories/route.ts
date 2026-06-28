import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { applyScopeToInsertPayload } from "../_lib/apply-scope-to-insert";

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const scopeId = searchParams.get("scopeId");
    const placementType = searchParams.get("placement_type");
    const isActive = searchParams.get("is_active");

    let query = supabase
      .schema("platform")
      .from("categories")
      .select(CATEGORY_SELECT)
      .eq("dimension", "shortcut");

    if (scope === "global") {
      query = query
        .is("organization_id", null)
        .is("metadata->>user_id" as never, null)
        .is("metadata->>project_id" as never, null)
        .is("metadata->>task_id" as never, null);
    } else if (scope === "user") {
      query = query.eq("metadata->>user_id" as never, user.id);
    } else if (scope === "organization") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=organization" },
          { status: 400 },
        );
      }
      query = query.eq("organization_id", scopeId);
    } else if (scope === "project") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=project" },
          { status: 400 },
        );
      }
      query = query.eq("metadata->>project_id" as never, scopeId);
    } else if (scope === "task") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=task" },
          { status: 400 },
        );
      }
      query = query.eq("metadata->>task_id" as never, scopeId);
    } else if (scope) {
      return NextResponse.json(
        { error: `Unknown scope: ${scope}` },
        { status: 400 },
      );
    }

    if (placementType) query = query.eq("placement_type", placementType);
    if (isActive !== null)
      query = query.eq("metadata->>is_active" as never, isActive);

    query = query.order("position", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching shortcut categories:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch shortcut categories",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: (data ?? []).map(coerceCategoryRow) });
  } catch (error) {
    console.error("Error in GET /api/agent-shortcut-categories:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    if (!body.label || !body.placement_type) {
      return NextResponse.json(
        { error: "Missing required fields: label, placement_type" },
        { status: 400 },
      );
    }

    // Resolve scope FKs via the shared helper (sets user_id/org/project/task_id on payload).
    const scopePayload: Record<string, unknown> = {};
    const scoped = applyScopeToInsertPayload({
      body,
      payload: scopePayload,
      userId: user.id,
    });
    if (scoped instanceof NextResponse) return scoped;

    // Build new platform.categories row shape.
    const insertPayload = {
      dimension: "shortcut" as const,
      name: body.label,
      icon: body.icon_name ?? null,
      color: body.color ?? null,
      placement_type: body.placement_type,
      position: body.sort_order ?? null,
      parent_id: body.parent_category_id ?? null,
      organization_id: scoped.organization_id ?? null,
      created_by: user.id,
      metadata: {
        description: body.description ?? null,
        is_active: body.is_active !== undefined ? body.is_active : true,
        enabled_features: body.enabled_features ?? null,
        user_id: scoped.user_id ?? null,
        project_id: scoped.project_id ?? null,
        task_id: scoped.task_id ?? null,
        legacy_table: "shortcut_categories",
      },
    };

    const { data, error } = await supabase
      .schema("platform")
      .from("categories")
      .insert(insertPayload as never)
      .select(CATEGORY_SELECT)
      .single();

    if (error) {
      console.error("Error creating shortcut category:", error);
      const status =
        error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        {
          error: "Failed to create shortcut category",
          details: error.message,
        },
        { status },
      );
    }

    return NextResponse.json({ data: coerceCategoryRow(data) }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/agent-shortcut-categories:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
