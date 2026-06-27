import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    // Fetch the source agent — RLS ensures user can only read agents they own or have access to
    const { data: agent, error: fetchError } = await supabase
      .schema("agent")
      .from("definition")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !agent) {
      console.error("Error fetching agent:", fetchError);
      return NextResponse.json(
        { error: "Agent not found or access denied" },
        { status: 404 },
      );
    }

    // Check for a name collision and append date if needed
    const { data: existing } = await supabase
      .schema("agent")
      .from("template")
      .select("id")
      .eq("name", agent.name)
      .eq("user_id", user.id)
      .single();

    const templateName = existing
      ? `${agent.name} (${new Date().toISOString().split("T")[0]})`
      : agent.name;

    const { data: newTemplate, error: insertError } = await supabase
      .schema("agent")
      .from("template")
      .insert({
        name: templateName,
        description:
          agent.description ?? `Template created from agent: ${agent.name}`,
        category: agent.category ?? "custom",
        tags: agent.tags ?? [],
        messages: agent.messages ?? [],
        variable_definitions: agent.variable_definitions ?? null,
        model_id: agent.model_id ?? null,
        model_tiers: agent.model_tiers ?? null,
        settings: agent.settings ?? {},
        output_schema: agent.output_schema ?? null,
        tools: agent.tools ?? [],
        custom_tools: agent.custom_tools ?? [],
        // Pass the canonical tool_config through so the new template row
        // doesn't lose the consolidated shape if backend ever stops syncing
        // legacy columns. Backend keeps the legacy + tool_config columns
        // in sync today; we send both for symmetry.
        tool_config: agent.tool_config ?? null,
        context_slots: agent.context_slots ?? [],
        mcp_servers: agent.mcp_servers ?? [],
        is_public: false,
        is_featured: false,
        use_count: 0,
        user_id: user.id,
        source_agent_id: id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating template:", insertError);
      return NextResponse.json(
        {
          error: "Failed to create template from agent",
          details: insertError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      template: newTemplate,
      message: `Successfully saved "${agent.name}" as a template`,
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
