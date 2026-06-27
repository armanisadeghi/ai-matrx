import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { collectMustacheVariableNamesFromMessagesJson } from "@/features/prompts/utils/collect-template-variables-from-messages-json";
import { getFunctionalityById } from "@/lib/services/functionality-helpers";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

/**
 * Convert a prompt to a system prompt
 *
 * POST /api/prompts/[id]/convert-to-system-prompt
 *
 * Body (optional):
 * {
 *   system_prompt_id?: string,  // Custom ID, defaults to kebab-case of name
 *   name?: string,              // Override name
 *   category?: string,          // Override category
 *   display_config?: {...},     // Custom display config
 *   placement_config?: {...}    // Custom placement config
 * }
 */
export async function POST(
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

    // Parse request body (optional overrides)
    const body = await request.json().catch(() => ({}));

    // Fetch the original prompt
    const { data: originalPrompt, error: fetchError } = await graveyardDb(supabase)
      .from("prompts")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !originalPrompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // Generate system_prompt_id (kebab-case from name or use provided)
    const generateSystemPromptId = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    const systemPromptId =
      body.system_prompt_id || generateSystemPromptId(originalPrompt.name);

    // Check if a system prompt with this ID already exists
    const { data: existingSystemPrompt } = await supabase
      .from("system_prompts")
      .select("id, system_prompt_id")
      .eq("system_prompt_id", systemPromptId)
      .single();

    if (existingSystemPrompt) {
      return NextResponse.json(
        {
          error: "System prompt with this ID already exists",
          details: `A system prompt with ID "${systemPromptId}" already exists. Please choose a different name or ID.`,
          existing_id: existingSystemPrompt.id,
        },
        { status: 409 },
      );
    }

    const variables = collectMustacheVariableNamesFromMessagesJson(
      originalPrompt.messages,
    );

    // Category is now just a string for organization, no old-style validation needed

    // Build prompt snapshot
    const promptSnapshot = {
      name: originalPrompt.name,
      description: originalPrompt.description || "",
      messages: originalPrompt.messages || [],
      settings: originalPrompt.settings || {},
      variableDefaults: originalPrompt.variable_defaults || [],
      variables,
    };

    // Default display config
    const defaultDisplayConfig = {
      icon: "MousePointerClick",
      label: originalPrompt.name,
      tooltip: originalPrompt.description || `Execute ${originalPrompt.name}`,
    };

    // Validate functionality_id - fetch from database
    if (!body.functionality_id) {
      console.error("Missing functionality_id");
      return NextResponse.json(
        { error: "functionality_id is required" },
        { status: 400 },
      );
    }

    const functionality = await getFunctionalityById(body.functionality_id);

    if (!functionality) {
      console.error("Invalid functionality_id:", body.functionality_id);
      return NextResponse.json(
        { error: "Invalid functionality_id provided - not found in database" },
        { status: 400 },
      );
    }

    // Validate variables
    const promptVars = new Set(promptSnapshot.variables);
    const requiredVars: string[] = functionality.required_variables ?? [];
    const optionalVars: string[] = functionality.optional_variables ?? [];
    const missing = requiredVars.filter((v) => !promptVars.has(v));
    const valid = missing.length === 0;
    const allowed = [...requiredVars, ...optionalVars];
    const extra = promptSnapshot.variables.filter(
      (v: string) => !allowed.includes(v),
    );

    if (!valid) {
      console.error("Validation failed:", { missing, extra });
      return NextResponse.json(
        {
          error: "Prompt missing required variables",
          details: `Missing required variables: ${missing.join(", ")}. Note: Extra variables are allowed (may have defaults).`,
          validation: {
            valid,
            missing,
            extra,
            note: "Extra variables are allowed as long as all required variables are present",
          },
        },
        { status: 400 },
      );
    }

    // Create the system prompt with NEW structure
    console.log("Inserting system prompt:", {
      system_prompt_id: systemPromptId,
      name: body.name || originalPrompt.name,
      placement_type: body.placement_type,
      functionality_id: body.functionality_id,
      category: body.category,
    });

    // system_prompts is RLS-protected with no write policy — use the admin client.
    const admin = createAdminClient();
    const { data: newSystemPrompt, error: insertError } = await admin
      .from("system_prompts")
      .insert({
        system_prompt_id: systemPromptId,
        name: body.name || originalPrompt.name,
        description:
          body.description ||
          originalPrompt.description ||
          `System prompt created from: ${originalPrompt.name}`,
        source_prompt_id: id,
        version: 1,
        prompt_snapshot: promptSnapshot,
        display_config: body.display_config || defaultDisplayConfig,

        // NEW STRUCTURE FIELDS
        placement_type: body.placement_type || "card",
        functionality_id: body.functionality_id,
        category: body.category || "general",
        subcategory: body.subcategory || null,
        placement_settings: body.placement_settings || {},

        tags: body.tags || [],
        sort_order: body.sort_order || 0,
        is_active: false, // Start as inactive - admin must enable
        is_featured: false,
        status: "draft", // Start as draft
        metadata: {
          created_from_prompt_id: id,
          created_from_prompt_name: originalPrompt.name,
        },
        published_by: user.id,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json(
        {
          error: "Failed to create system prompt",
          details: insertError.message || "Database error",
          code: insertError.code,
          hint: insertError.hint,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      system_prompt: newSystemPrompt,
      message: `Successfully converted "${originalPrompt.name}" to system prompt`,
      note: "System prompt created as draft. Enable and configure it in the admin interface.",
    });
  } catch (error: any) {
    console.error("Convert to system prompt error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error?.message || "Unknown error",
        stack:
          process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
      { status: 500 },
    );
  }
}
