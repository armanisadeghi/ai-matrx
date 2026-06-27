import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const SHORTCUT_UPDATE_FIELDS = [
  "category_id",
  "label",
  "description",
  "icon_name",
  "keyboard_shortcut",
  "sort_order",
  "scope_mappings",
  "context_mappings",
  "enabled_features",
  "agent_id",
  "agent_version_id",
  "use_latest",
  "is_active",
  "user_id",
  "organization_id",
  "project_id",
  "task_id",
  // AgentExecutionConfig bundle
  "display_mode",
  "show_variable_panel",
  "variables_panel_style",
  "auto_run",
  "allow_chat",
  "show_definition_messages",
  "show_definition_message_content",
  "hide_reasoning",
  "hide_tool_results",
  "show_pre_execution_gate",
  "pre_execution_message",
  "bypass_gate_seconds",
  "default_user_input",
  "default_variables",
  "context_overrides",
  "llm_overrides",
] as const;

function pickUpdateFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of SHORTCUT_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

export async function GET(
  _request: NextRequest,
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

    const { data, error } = await supabase
      .schema("agent")
      .from("shortcut")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching agent shortcut:", error);
      return NextResponse.json(
        { error: "Failed to fetch agent shortcut", details: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Agent shortcut not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in GET /api/agent-shortcuts/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const updatePayload = pickUpdateFields(body);

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .schema("agent")
      .from("shortcut")
      .update(updatePayload as never)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Error updating agent shortcut:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to update agent shortcut", details: error.message },
        { status },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Agent shortcut not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in PATCH /api/agent-shortcuts/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
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

    const { error, count } = await supabase
      .schema("agent")
      .from("shortcut")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      console.error("Error deleting agent shortcut:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to delete agent shortcut", details: error.message },
        { status },
      );
    }

    if (!count) {
      return NextResponse.json(
        { error: "Agent shortcut not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error in DELETE /api/agent-shortcuts/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
