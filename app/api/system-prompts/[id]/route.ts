import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

/**
 * GET /api/system-prompts/[id]
 * Fetch a single system prompt by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("system_prompts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "System prompt not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ system_prompt: data });
  } catch (error) {
    console.error("Error in GET handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/system-prompts/[id]
 * Update a system prompt (admin only)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a system admin
    const isAdmin = await checkIsSuperAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Build update object (only include provided fields)
    const updateData: any = {
      last_updated_by: user.id,
      last_updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.display_config !== undefined)
      updateData.display_config = body.display_config;
    if (body.placement_config !== undefined)
      updateData.placement_config = body.placement_config;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.subcategory !== undefined)
      updateData.subcategory = body.subcategory;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
    if (body.required_variables !== undefined)
      updateData.required_variables = body.required_variables;
    if (body.optional_variables !== undefined)
      updateData.optional_variables = body.optional_variables;
    if (body.variable_mappings !== undefined)
      updateData.variable_mappings = body.variable_mappings;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.is_featured !== undefined)
      updateData.is_featured = body.is_featured;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.update_notes !== undefined)
      updateData.update_notes = body.update_notes;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    // system_prompts is RLS-protected with no write policy — use the admin client.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_prompts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating system prompt:", error);
      return NextResponse.json(
        { error: "Failed to update system prompt", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, system_prompt: data });
  } catch (error) {
    console.error("Error in PATCH handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/system-prompts/[id]
 * Delete a system prompt (admin only)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a system admin
    const isAdmin = await checkIsSuperAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("system_prompts").delete().eq("id", id);

    if (error) {
      console.error("Error deleting system prompt:", error);
      return NextResponse.json(
        { error: "Failed to delete system prompt", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "System prompt deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/system-prompts/[id]/publish-update
 * Publish a prompt update (updates prompt_snapshot, increments version)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; action?: string }> },
) {
  try {
    const { id } = await context.params;

    // Check if this is a publish-update action
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/publish-update")) {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 404 });
    }

    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a system admin
    const isAdmin = await checkIsSuperAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();

    if (!body.prompt_snapshot) {
      return NextResponse.json(
        { error: "Missing required field: prompt_snapshot" },
        { status: 400 },
      );
    }

    // Update with new snapshot (version will auto-increment via trigger)
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_prompts")
      .update({
        prompt_snapshot: body.prompt_snapshot,
        update_notes: body.update_notes || "Prompt updated",
        last_updated_by: user.id,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error publishing update:", error);
      return NextResponse.json(
        { error: "Failed to publish update", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      system_prompt: data,
      message: "Update published successfully",
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
