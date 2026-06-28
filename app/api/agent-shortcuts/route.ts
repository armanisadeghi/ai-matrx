import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { applyScopeToInsertPayload } from "../_lib/apply-scope-to-insert";

const SHORTCUT_FIELDS = [
  "id",
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

function pickShortcutFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of SHORTCUT_FIELDS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const scopeId = searchParams.get("scopeId");
    const categoryId = searchParams.get("category_id");
    const placementType = searchParams.get("placement_type");
    const isActive = searchParams.get("is_active");

    let query = supabase.schema("agent").from("shortcut").select("*");

    if (scope === "global") {
      query = query
        .is("user_id", null)
        .is("organization_id", null)
        .is("project_id", null)
        .is("task_id", null);
    } else if (scope === "user") {
      query = query.eq("user_id", user.id);
    } else if (scope === "organization") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=organization" },
          { status: 400 },
        );
      }
      query = query.eq("organization_id", scopeId);
    } else if (scope === "project") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=project" },
          { status: 400 },
        );
      }
      query = query.eq("project_id", scopeId);
    } else if (scope === "task") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=task" },
          { status: 400 },
        );
      }
      query = query.eq("task_id", scopeId);
    } else if (scope) {
      return NextResponse.json(
        { error: `Unknown scope: ${scope}` },
        { status: 400 },
      );
    }

    if (categoryId) query = query.eq("category_id", categoryId);
    if (isActive !== null) query = query.eq("is_active", isActive === "true");

    query = query.order("sort_order", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching agent shortcuts:", error);
      return NextResponse.json(
        { error: "Failed to fetch agent shortcuts", details: error.message },
        { status: 500 },
      );
    }

    const filtered = placementType
      ? await filterByPlacementType(supabase, data ?? [], placementType)
      : (data ?? []);

    return NextResponse.json({ data: filtered });
  } catch (error) {
    console.error("Error in GET /api/agent-shortcuts:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    if (!body.category_id || !body.label) {
      return NextResponse.json(
        { error: "Missing required fields: category_id, label" },
        { status: 400 },
      );
    }

    const insertPayload = pickShortcutFields(body);
    const scoped = applyScopeToInsertPayload({
      body,
      payload: insertPayload,
      userId: user.id,
    });
    if (scoped instanceof NextResponse) return scoped;

    const { data, error } = await supabase
      .schema("agent")
      .from("shortcut")
      .insert(scoped as never)
      .select()
      .single();

    if (error) {
      console.error("Error creating agent shortcut:", error);
      const status =
        error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to create agent shortcut", details: error.message },
        { status },
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/agent-shortcuts:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

async function filterByPlacementType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{ category_id: string }>,
  placementType: string,
) {
  if (rows.length === 0) return rows;
  const categoryIds = Array.from(new Set(rows.map((r) => r.category_id)));
  const { data: cats } = await supabase
    .schema("platform")
    .from("categories")
    .select("id, placement_type")
    .eq("dimension", "shortcut")
    .in("id", categoryIds)
    .eq("placement_type", placementType);
  const allowed = new Set((cats ?? []).map((c) => c.id));
  return rows.filter((r) => allowed.has(r.category_id));
}
