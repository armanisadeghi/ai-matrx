import { createClient } from "@/utils/supabase/server";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { collectMustacheVariableNamesFromMessagesJson } from "@/features/prompts/utils/collect-template-variables-from-messages-json";
import { getFunctionalityById } from "@/lib/services/functionality-helpers";

/**
 * GET /api/system-prompts/[id]/compatible-prompts
 *
 * Fetch all AI prompts that are compatible with this system prompt's functionality.
 * A prompt is compatible if its variables match the functionality's requirements.
 *
 * Query params:
 *   - include_all: 'true' to include incompatible prompts with validation info
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

    // Check if user is a system admin
    const isAdmin = await checkIsSuperAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const includeAll = searchParams.get("include_all") === "true";

    // Fetch the system prompt
    const { data: systemPrompt, error: systemPromptError } = await graveyardDb(
      supabase,
    )
      .from("system_prompts")
      .select("*")
      .eq("id", id)
      .single();

    if (systemPromptError || !systemPrompt) {
      return NextResponse.json(
        {
          error: "System prompt not found",
          details: systemPromptError?.message,
        },
        { status: 404 },
      );
    }

    // Fetch functionality config from database
    if (!systemPrompt.functionality_id) {
      return NextResponse.json(
        {
          error: "No functionality defined for this system prompt",
          details: "System prompt has no functionality_id",
          system_prompt: {
            id: systemPrompt.id,
            system_prompt_id: systemPrompt.system_prompt_id,
            functionality_id: null,
          },
        },
        { status: 400 },
      );
    }

    const functionality = await getFunctionalityById(
      systemPrompt.functionality_id,
    );

    if (!functionality) {
      return NextResponse.json(
        {
          error: "Functionality not found",
          details: `Functionality "${systemPrompt.functionality_id}" not found in database`,
          system_prompt: {
            id: systemPrompt.id,
            system_prompt_id: systemPrompt.system_prompt_id,
            functionality_id: systemPrompt.functionality_id,
          },
        },
        { status: 404 },
      );
    }

    const requiredVars: string[] = functionality.required_variables ?? [];
    const optionalVars: string[] = functionality.optional_variables ?? [];

    // Fetch all user agents (prompts migrated 1:1 to agent.definition, agent_type='user', same UUIDs)
    // agent.definition uses `variable_definitions` instead of `variable_defaults`
    const { data: allAgents, error: promptsError } = await supabase
      .schema("agent")
      .from("definition")
      .select(
        "id, name, description, messages, settings, variable_definitions, updated_at, user_id",
      )
      .eq("agent_type", "user")
      .order("updated_at", { ascending: false });

    if (promptsError) {
      return NextResponse.json(
        {
          error: "Failed to fetch prompts",
          details: promptsError.message,
        },
        { status: 500 },
      );
    }

    // Normalize to the shape the rest of this handler expects
    const allPrompts = (allAgents ?? []).map((a) => ({
      ...a,
      variable_defaults: a.variable_definitions,
    }));

    // Extract variables and validate each prompt
    const compatible: any[] = [];
    const incompatible: any[] = [];

    (allPrompts || []).forEach((prompt) => {
      const variables = new Set(
        collectMustacheVariableNamesFromMessagesJson(prompt.messages),
      );

      // Build minimal prompt snapshot for validation
      const promptSnapshot = {
        name: prompt.name,
        description: prompt.description || "",
        messages: prompt.messages || [],
        settings: prompt.settings || {},
        variableDefaults: prompt.variable_defaults || [],
        variables: Array.from(variables),
      };

      // Validate against functionality
      const missing = requiredVars.filter((v) => !variables.has(v));
      const allowed = [...requiredVars, ...optionalVars];
      const extra = Array.from(variables).filter((v) => !allowed.includes(v));

      const validation = {
        valid: missing.length === 0,
        missing,
        extra,
      };

      const promptInfo = {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        variables: Array.from(variables),
        updated_at: prompt.updated_at,
        is_current: prompt.id === systemPrompt.source_prompt_id,
        validation: {
          valid: validation.valid,
          missing: validation.missing,
          extra: validation.extra,
        },
      };

      if (validation.valid) {
        compatible.push(promptInfo);
      } else {
        incompatible.push(promptInfo);
      }
    });

    // Sort compatible prompts: current first, then by updated_at
    compatible.sort((a, b) => {
      if (a.is_current && !b.is_current) return -1;
      if (!a.is_current && b.is_current) return 1;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

    const response: any = {
      system_prompt: {
        id: systemPrompt.id,
        system_prompt_id: systemPrompt.system_prompt_id,
        name: systemPrompt.name,
        functionality_id: systemPrompt.functionality_id,
        source_prompt_id: systemPrompt.source_prompt_id,
        current_version: systemPrompt.version,
      },
      functionality: {
        id: functionality.id,
        name: functionality.label,
        description: functionality.description,
        required_variables: requiredVars,
        optional_variables: optionalVars,
        placement_types: functionality.placement_types ?? [],
      },
      compatible: compatible,
      total_compatible: compatible.length,
      total_prompts: allPrompts?.length || 0,
    };

    if (includeAll) {
      response.incompatible = incompatible;
      response.total_incompatible = incompatible.length;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error in compatible-prompts endpoint:", error);
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
