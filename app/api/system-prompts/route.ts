import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { buildSearchOr } from "@/utils/supabase-search";

/**
 * GET /api/system-prompts
 * Fetch all system prompts with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const is_active = searchParams.get("is_active");
    const search = searchParams.get("search");

    // Build query
    let query = graveyardDb(supabase).from("system_prompts").select("*");

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (is_active !== null) {
      query = query.eq("is_active", is_active === "true");
    }

    if (search) {
      query = query.or(
        buildSearchOr(search, ["name", "description", "system_prompt_id"]),
      );
    }

    // Order by sort_order, then by name
    query = query.order("sort_order", { ascending: true });
    query = query.order("name", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching system prompts:", error);
      return NextResponse.json(
        { error: "Failed to fetch system prompts" },
        { status: 500 },
      );
    }

    return NextResponse.json({ system_prompts: data });
  } catch (error) {
    console.error("Error in GET handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/system-prompts
 * Create a new system prompt (admin only)
 */
export async function POST(request: NextRequest) {
  try {
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

    // Validate required fields
    if (!body.system_prompt_id || !body.name || !body.prompt_snapshot) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: system_prompt_id, name, prompt_snapshot",
        },
        { status: 400 },
      );
    }

    // Check if system_prompt_id already exists
    const { data: existing } = await graveyardDb(supabase)
      .from("system_prompts")
      .select("id")
      .eq("system_prompt_id", body.system_prompt_id)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          error: `System prompt with ID "${body.system_prompt_id}" already exists`,
        },
        { status: 409 },
      );
    }

    // system_prompts is RLS-protected with no write policy — use the admin
    // client for the write (super-admin already verified above).
    const admin = createAdminClient();
    const { data, error } = await graveyardDb(admin)
      .from("system_prompts")
      .insert({
        system_prompt_id: body.system_prompt_id,
        name: body.name,
        description: body.description || null,
        source_prompt_id: body.source_prompt_id || null,
        prompt_snapshot: body.prompt_snapshot,
        display_config: body.display_config || {},
        placement_config: body.placement_config || {},
        category: body.category || "general",
        subcategory: body.subcategory || null,
        tags: body.tags || [],
        sort_order: body.sort_order || 0,
        required_variables: body.required_variables || [],
        optional_variables: body.optional_variables || [],
        variable_mappings: body.variable_mappings || {},
        is_active: body.is_active !== undefined ? body.is_active : false,
        is_featured: body.is_featured || false,
        status: body.status || "draft",
        metadata: body.metadata || {},
        published_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating system prompt:", error);
      return NextResponse.json(
        { error: "Failed to create system prompt", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, system_prompt: data },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
