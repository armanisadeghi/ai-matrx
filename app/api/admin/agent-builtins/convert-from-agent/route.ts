import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * POST /api/admin/agent-builtins/convert-from-agent
 *
 * Converts a user's agent to a system ("builtin") agent or updates an existing
 * system agent. Mirrors the prompt `convert-from-prompt` endpoint but operates
 * on `agent.definition` (there's no separate `agent_builtins` table — system agents
 * live in the same table with `agent_type = 'builtin'`).
 *
 * Every read and write here goes through the SIGNED-IN admin's own client, never
 * the service-role admin client. Two reasons, both real:
 *   1. Provenance. `platform._stamp_actor_tier` refuses (23514) any write that
 *      resolves to tier `code` with no `app.actor_system` — which is exactly what
 *      a service-role write is (no auth.uid(), no GUC). The person clicking
 *      "Create system agent" IS the author, and their own session stamps
 *      `human` + their id. That is the correct provenance, not a workaround.
 *   2. RLS already lets a platform admin insert/update/select every
 *      agent.definition row (`platform_admin_all`), so the bypass bought nothing.
 * This was the "Failed to create system agent" defect of 2026-09-20.
 *
 * Body:
 *   - `agent_id` (required): the source user agent to copy from
 *   - `system_agent_id` (optional): if provided, updates the existing system
 *     agent with that ID. If omitted, creates a new system agent.
 *   - `agent_data` (optional): live editor data that overrides the DB snapshot,
 *     used when the user has unsaved edits.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await checkIsSuperAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { agent_id, system_agent_id, agent_data } = body as {
      agent_id?: string;
      system_agent_id?: string | null;
      agent_data?: Record<string, unknown> | null;
    };

    if (!agent_id) {
      return NextResponse.json(
        { error: "agent_id is required" },
        { status: 400 },
      );
    }

    // Resolve the snapshot we're copying from. If the client passed live editor
    // data, trust it; otherwise read the DB.
    let src: Record<string, unknown>;
    if (agent_data) {
      src = agent_data;
    } else {
      const { data: agent, error: fetchError } = await supabase
        .schema("agent")
        .from("definition")
        .select("*")
        .is("deleted_at", null)
        .eq("id", agent_id)
        .single();

      if (fetchError || !agent) {
        return NextResponse.json(
          { error: "Source agent not found", details: fetchError?.message },
          { status: 404 },
        );
      }
      src = agent;
    }

    // Fields that carry over to the system agent. `id`, timestamps, and owner
    // columns are intentionally excluded — the system agent has its own identity.
    const snapshot = {
      name: src.name as string,
      description: (src.description as string | null) ?? null,
      category: (src.category as string | null) ?? null,
      tags: (src.tags as string[] | null) ?? [],
      messages: src.messages ?? [],
      variable_definitions: src.variable_definitions ?? null,
      model_id: (src.model_id as string | null) ?? null,
      model_tiers: src.model_tiers ?? null,
      settings: src.settings ?? {},
      output_schema: src.output_schema ?? null,
      tools: (src.tools as string[] | null) ?? [],
      custom_tools: src.custom_tools ?? [],
      // Pass the canonical tool_config through so the system agent row
      // carries the consolidated shape if backend stops syncing legacy
      // columns. Backend keeps both in sync today.
      tool_config: src.tool_config ?? null,
      context_policies: src.context_policies ?? [],
      mcp_servers: (src.mcp_servers as string[] | null) ?? [],
    };

    let finalSystemAgentId: string;
    let isUpdate = false;

    if (system_agent_id) {
      // UPDATE existing system agent
      isUpdate = true;

      // Verify the target is actually a builtin AND was originally derived from
      // the source agent. Prevents admins from accidentally (or intentionally)
      // clobbering an unrelated system agent via a stale/forged id.
      const { data: target, error: targetError } = await supabase
        .schema("agent")
        .from("definition")
        .select("id, agent_type, source_agent_id")
        .is("deleted_at", null)
        .eq("id", system_agent_id)
        .single();

      if (targetError || !target) {
        return NextResponse.json(
          { error: "Target system agent not found" },
          { status: 404 },
        );
      }

      if (target.agent_type !== "builtin") {
        return NextResponse.json(
          { error: "Target is not a system agent" },
          { status: 400 },
        );
      }

      if (target.source_agent_id && target.source_agent_id !== agent_id) {
        return NextResponse.json(
          {
            error:
              "Target system agent was derived from a different source agent",
          },
          { status: 400 },
        );
      }

      const { error: updateError } = await supabase
        .schema("agent")
        .from("definition")
        .update({
          ...snapshot,
          source_agent_id: agent_id,
          source_snapshot_at: new Date().toISOString(),
        })
        .eq("id", system_agent_id);

      if (updateError) {
        console.error("[convert-from-agent] update failed:", updateError);
        return NextResponse.json(
          {
            error: "Failed to update system agent",
            details: updateError.message,
            code: updateError.code,
          },
          { status: 500 },
        );
      }

      finalSystemAgentId = system_agent_id;
    } else {
      // CREATE new system agent
      const { data: created, error: insertError } = await supabase
        .schema("agent")
        .from("definition")
        .insert({
          ...snapshot,
          agent_type: "builtin",
          is_active: true,
          is_archived: false,
          is_favorite: false,
          // Builtin rows home to the Matrx System org so they're globally visible
          // via has_access's platform-global tier. The DB guard
          // (agent._enforce_builtin_system_org) enforces this regardless; we set it
          // explicitly because the regenerated types now require organization_id.
          // org-fallback-deliberate: a builtin agent is platform-shipped content with
          //   no tenant, and agent._enforce_builtin_system_org forces this org in the
          //   database anyway; the route is behind checkIsSuperAdmin
          organization_id: await resolveSystemOrgId(supabase),
          created_by: user.id,
          task_id: null,
          source_agent_id: agent_id,
          source_snapshot_at: new Date().toISOString(),
          version: 1,
        })
        .select("id")
        .single();

      if (insertError || !created) {
        console.error("[convert-from-agent] insert failed:", insertError);
        return NextResponse.json(
          {
            error: "Failed to create system agent",
            details: insertError?.message,
            code: insertError?.code,
          },
          { status: 500 },
        );
      }

      finalSystemAgentId = created.id;
    }

    return NextResponse.json({
      system_agent_id: finalSystemAgentId,
      is_update: isUpdate,
      message: isUpdate
        ? "System agent updated successfully"
        : "System agent created successfully",
    });
  } catch (error) {
    console.error("[convert-from-agent] unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 },
    );
  }
}
