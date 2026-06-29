/**
 * Feedback Category by ID API
 *
 * GET /api/admin/feedback/categories/[id] - Get a single category
 * PATCH /api/admin/feedback/categories/[id] - Update a category
 * DELETE /api/admin/feedback/categories/[id] - Delete a category (only if no items assigned)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireAdmin } from "@/utils/auth/adminUtils";
import type { TablesUpdate } from "@/types/database.types";
import { metadataAsObject } from "@/utils/json/metadataObject";
import {
  FEEDBACK_CATEGORY_SELECT,
  platformCategoryToFeedbackRow,
} from "../_lib/categoryRow";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_request: NextRequest, context: RouteContext) {
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

    const { data: row, error } = await supabase
      .schema("platform")
      .from("categories")
      .select(FEEDBACK_CATEGORY_SELECT)
      .eq("dimension", "feedback")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const category = platformCategoryToFeedbackRow(row);
    return NextResponse.json({ category });
  } catch (err) {
    console.error("Failed to fetch category:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    // platform.categories (feedback dimension) is managed via admin client — is_system rows need service_role.
    const supabase = createAdminClient();

    const body = await request.json();
    const updates: TablesUpdate<{ schema: "platform" }, "categories"> = {};
    const metadataUpdates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined)
      updates.slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (body.sort_order !== undefined) updates.position = body.sort_order;
    // color is a real top-level column
    if (body.color !== undefined) updates.color = body.color;
    // metadata-backed fields
    if (body.description !== undefined)
      metadataUpdates.description = body.description || null;
    if (body.is_active !== undefined)
      metadataUpdates.is_active = body.is_active;

    if (Object.keys(metadataUpdates).length > 0) {
      // Merge metadata atomically: fetch the current value, then shallow-merge
      // only the changed keys so existing fields (legacy_id, legacy_table, etc.)
      // are not wiped. A plain .update({ metadata: {...} }) would overwrite the
      // whole JSONB column with only the subset we know about.
      const { data: current } = await supabase
        .schema("platform")
        .from("categories")
        .select("metadata")
        .eq("id", id)
        .eq("dimension", "feedback")
        .single();
      updates.metadata = {
        ...metadataAsObject(current?.metadata),
        ...metadataUpdates,
      };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const { data: row, error } = await supabase
      .schema("platform")
      .from("categories")
      .update(updates)
      .eq("dimension", "feedback")
      .eq("id", id)
      .select(FEEDBACK_CATEGORY_SELECT)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A category with this name or slug already exists" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const category = platformCategoryToFeedbackRow(row);
    return NextResponse.json({ category });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    console.error("Failed to update category:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const supabase = createAdminClient();

    // Check if any feedback items are assigned to this category
    const { count, error: countError } = await supabase
      .schema("users")
      .from("user_feedback")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);

    if (countError) {
      return NextResponse.json(
        { error: "Failed to check category usage" },
        { status: 500 },
      );
    }

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${count} feedback item(s) are assigned to this category. Reassign them first.`,
        },
        { status: 409 },
      );
    }

    const { error } = await supabase
      .schema("platform")
      .from("categories")
      .delete()
      .eq("dimension", "feedback")
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    console.error("Failed to delete category:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
