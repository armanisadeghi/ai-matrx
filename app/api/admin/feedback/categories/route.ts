/**
 * Feedback Categories CRUD API
 *
 * GET /api/admin/feedback/categories - List all categories (sorted by sort_order)
 * POST /api/admin/feedback/categories - Create a new category
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireAdmin } from "@/utils/auth/adminUtils";

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

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: categories, error } = await supabase
      .schema("platform")
      .from("categories")
      .select("id, name, slug, description:metadata->>description, color, sort_order:position, is_active:metadata->>is_active, created_at, updated_at")
      .eq("dimension", "feedback")
      .order("position", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Failed to fetch categories:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    // platform.categories (feedback dimension) is managed via admin client — is_system rows need service_role.
    const supabase = createAdminClient();

    const body = await request.json();
    const { name, slug, description, color = "gray", sort_order = 0 } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 },
      );
    }

    const { data: category, error } = await supabase
      .schema("platform")
      .from("categories")
      .insert({
        dimension: "feedback",
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        position: sort_order,
        color,
        is_system: true,
        metadata: { description: description || null, is_active: true },
      })
      .select("id, name, slug, description:metadata->>description, color, sort_order:position, is_active:metadata->>is_active, created_at, updated_at")
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

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    console.error("Failed to create category:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
