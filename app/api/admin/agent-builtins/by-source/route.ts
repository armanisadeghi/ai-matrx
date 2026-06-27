import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

/**
 * GET /api/admin/agent-builtins/by-source?source_agent_id=<id>
 *
 * Returns every system ("builtin") agent that was converted from the given
 * source agent. Used by the "Convert to System Agent" flow to detect whether
 * an existing builtin already tracks this agent, so the admin can choose to
 * update in place instead of creating a duplicate.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await checkIsSuperAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sourceAgentId = searchParams.get("source_agent_id");
    if (!sourceAgentId) {
      return NextResponse.json(
        { error: "source_agent_id is required" },
        { status: 400 },
      );
    }

    const { data, error } = await adminClient
      .schema("agent")
      .from("definition")
      .select(
        "id, name, description, category, tags, version, source_agent_id, source_snapshot_at, created_at, updated_at, variable_definitions",
      )
      .eq("agent_type", "builtin")
      .eq("source_agent_id", sourceAgentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[agent-builtins/by-source] query failed:", error);
      return NextResponse.json(
        { error: "Failed to fetch system agents", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ system_agents: data ?? [] });
  } catch (error) {
    console.error("[agent-builtins/by-source] unexpected:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 },
    );
  }
}
