import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import {
  collectMustacheVariableNamesFromMessagesJson,
  promptSnapshotHasPlaceholder,
} from "@/features/prompts/utils/collect-template-variables-from-messages-json";
import { getFunctionalityById } from "@/lib/services/functionality-helpers";

/**
 * POST /api/system-prompts/[id]/link-prompt
 *
 * Link or update a system prompt with a new source AI prompt.
 * Validates that the prompt's variables match the system prompt's functionality requirements.
 *
 * Body:
 * {
 *   prompt_id: string,           // The AI prompt ID to link
 *   update_notes?: string        // Optional notes about the update
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

    const body = await request.json();

    if (!body.prompt_id) {
      return NextResponse.json(
        { error: "Missing required field: prompt_id" },
        { status: 400 },
      );
    }

    // Fetch the system prompt
    const { data: systemPrompt, error: systemPromptError } = await supabase
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

    // Fetch the source AI prompt — prompts migrated 1:1 to agent.definition (same UUIDs)
    // agent.definition uses `variable_definitions` instead of `variable_defaults`
    const { data: sourceAgent, error: sourcePromptError } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, name, description, messages, settings, variable_definitions")
      .eq("id", body.prompt_id)
      .single();

    if (sourcePromptError || !sourceAgent) {
      return NextResponse.json(
        {
          error: "Source prompt not found",
          details: sourcePromptError?.message,
        },
        { status: 404 },
      );
    }

    // Normalize to match the existing shape expected below
    const sourcePrompt = {
      ...sourceAgent,
      variable_defaults: sourceAgent.variable_definitions,
    };

    const variables = new Set(
      collectMustacheVariableNamesFromMessagesJson(sourcePrompt.messages),
    );

    // Build the new prompt snapshot
    const newPromptSnapshot = {
      name: sourcePrompt.name,
      description: sourcePrompt.description || "",
      messages: sourcePrompt.messages || [],
      settings: sourcePrompt.settings || {},
      variableDefaults: sourcePrompt.variable_defaults || [],
      variables: Array.from(variables),
      placeholder: false,
    };

    // Validate against functionality requirements if functionality_id exists
    if (systemPrompt.functionality_id) {
      const functionality = await getFunctionalityById(
        systemPrompt.functionality_id,
      );

      if (!functionality) {
        return NextResponse.json(
          {
            error: "Invalid functionality_id on system prompt",
            details: `functionality_id "${systemPrompt.functionality_id}" not found in database`,
            system_prompt: {
              id: systemPrompt.id,
              functionality_id: systemPrompt.functionality_id,
            },
          },
          { status: 500 },
        );
      }

      // Validate variables
      const requiredVars: string[] = functionality.required_variables ?? [];
      const optionalVars: string[] = functionality.optional_variables ?? [];
      const missing = requiredVars.filter((v) => !variables.has(v));
      const valid = missing.length === 0;
      const allowed = [...requiredVars, ...optionalVars];
      const extra = Array.from(variables).filter((v) => !allowed.includes(v));

      if (!valid) {
        return NextResponse.json(
          {
            error: "Prompt missing required variables",
            details: `The selected AI prompt is missing required variables: ${missing.join(", ")}. Extra variables are allowed.`,
            validation: {
              functionality_id: systemPrompt.functionality_id,
              functionality_name: functionality.label,
              required_variables: requiredVars,
              optional_variables: optionalVars,
              prompt_variables: Array.from(variables),
              missing_variables: missing,
              extra_variables: extra,
              extra_variables_note:
                "Extra variables are allowed (may have defaults)",
              valid,
            },
            system_prompt: {
              id: systemPrompt.id,
              system_prompt_id: systemPrompt.system_prompt_id,
              name: systemPrompt.name,
              functionality_id: systemPrompt.functionality_id,
            },
            source_prompt: {
              id: sourcePrompt.id,
              name: sourcePrompt.name,
              variables: Array.from(variables),
            },
          },
          { status: 400 },
        );
      }
    }

    // Get old version for comparison
    const oldVersion = systemPrompt.version;
    const wasPlaceholder = promptSnapshotHasPlaceholder(
      systemPrompt.prompt_snapshot,
    );

    // Update the system prompt with the new link.
    // system_prompts is RLS-protected with no write policy — use the admin client.
    const admin = createAdminClient();
    const { data: updatedSystemPrompt, error: updateError } = await admin
      .from("system_prompts")
      .update({
        source_prompt_id: body.prompt_id,
        prompt_snapshot: newPromptSnapshot,
        version: oldVersion + 1, // Increment version
        update_notes:
          body.update_notes ||
          (wasPlaceholder ? "Initial prompt linked" : "Prompt updated"),
        last_updated_by: user.id,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating system prompt:", updateError);
      return NextResponse.json(
        {
          error: "Failed to update system prompt",
          details: updateError.message,
          code: updateError.code,
          hint: updateError.hint,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: wasPlaceholder
        ? `Successfully linked prompt "${sourcePrompt.name}" to system prompt`
        : `Successfully updated system prompt to use "${sourcePrompt.name}"`,
      system_prompt: updatedSystemPrompt,
      changes: {
        old_version: oldVersion,
        new_version: updatedSystemPrompt.version,
        old_source_prompt_id: systemPrompt.source_prompt_id,
        new_source_prompt_id: body.prompt_id,
        was_placeholder: wasPlaceholder,
      },
    });
  } catch (error: any) {
    console.error("Error in link-prompt endpoint:", error);
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
