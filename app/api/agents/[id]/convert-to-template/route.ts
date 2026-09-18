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

    const organizationId = request.headers.get("X-Organization-Id")?.trim() ?? "";
    if (organizationId.length === 0) {
      return NextResponse.json(
        {
          error:
            "No organization was named for this template, so nothing was created. Choose the organization you are working in and try again.",
          code: "organization_context_required",
        },
        { status: 400 },
      );
    }

    // Fetch the source agent — RLS ensures user can only read agents they own or have access to
    const { data: agent, error: fetchError } = await supabase
      .schema("agent")
      .from("definition")
      .select("*")
      .is("deleted_at", null)
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
      .is("deleted_at", null)
      .eq("name", agent.name)
      .eq("created_by", user.id)
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
        context_policies: agent.context_policies ?? [],
        mcp_servers: agent.mcp_servers ?? [],
        // visibility intentionally omitted → DB default 'internal' (non-public,
        // same posture as the retired is_public=false)
        is_featured: false,
        use_count: 0,
        created_by: user.id,
        // 🚨 THE TEMPLATE IS FILED IN THE ORGANIZATION THE CALLER IS ACTING
        // IN. It used to resolve the caller's PERSONAL organization, which is
        // why all 11 live `agent.template` rows sit in their creator's private
        // workspace — a template nobody they work with can reach. The caller
        // states the organization on `X-Organization-Id`; the insert runs on
        // their own RLS-scoped client, so a header naming an organization they
        // are not in fails the policy.
        // common-docs/policies/context-is-carried-never-rebuilt.md rule 4.
        organization_id: organizationId,
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
