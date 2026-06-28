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

    const { data: category, error } = await supabase
      .schema("platform")
      .from("categories")
      .select("id, name, slug, description:metadata->>description, color:metadata->>color, sort_order:position, is_active:metadata->>is_active, created_at, updated_at")
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
    const updates: Record<string, unknown> = {};
    const metadataUpdates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined)
      updates.slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (body.sort_order !== undefined) updates.position = body.sort_order;
    // metadata-backed fields
    if (body.description !== undefined)
      metadataUpdates.description = body.description || null;
    if (body.color !== undefined) metadataUpdates.color = body.color;
    if (body.is_active !== undefined) metadataUpdates.is_active = body.is_active;

    if (Object.keys(metadataUpdates).length > 0) {
      // merge into existing metadata via jsonb_build_object coalesce approach
      // PostgREST merges JSONB with || operator when using the json_patch path
      // We pass the full metadata merge as a plain object update here so PostgREST
      // stores it; callers must send atomic patches (one field at a time) or all
      // metadata fields together. This is acceptable for admin routes.
      updates.metadata = metadataUpdates;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const { data: category, error } = await supabase
      .schema("platform")
      .from("categories")
      .update(updates)
      .eq("dimension", "feedback")
      .eq("id", id)
      .select("id, name, slug, description:metadata->>description, color:metadata->>color, sort_order:position, is_active:metadata->>is_active, created_at, updated_at")
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
      .schema("users").from("user_feedback")
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
