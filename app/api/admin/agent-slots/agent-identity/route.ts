import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

/**
 * GET /api/admin/agent-slots/agent-identity?agent_id=<id>
 * GET /api/admin/agent-slots/agent-identity?agent_version_id=<id>
 *
 * Super-admin-only identity lookup for a slot's pinned agent when the pin
 * points at a row the admin's RLS scope cannot read (another user's personal
 * agent). The slots console (/administration/agents/slots) must never render
 * a bare unresolvable id — this returns just enough identity to open, judge,
 * and repair the pin: name, type, archived/deleted state, owner email, the
 * pinned version number, and the builtin system twin when one exists.
 *
 * No RPC exposes this today (agx_get_execution_minimal and the aidream
 * /agent-service read model are both ownership-scoped by design), so this
 * follows the sanctioned admin-route exception — session super-admin gate +
 * createAdminClient — exactly like ./../agent-builtins/by-source.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

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
    const agentIdParam = searchParams.get("agent_id");
    const versionIdParam = searchParams.get("agent_version_id");
    if (!agentIdParam && !versionIdParam) {
      return NextResponse.json(
        { error: "agent_id or agent_version_id is required" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    let agentId = agentIdParam;
    let pinnedVersionNumber: number | null = null;

    if (!agentId && versionIdParam) {
      const { data: version, error: versionError } = await adminClient
        .schema("agent")
        .from("definition_version")
        .select("agent_id, version_number")
        .eq("id", versionIdParam)
        .maybeSingle();
      if (versionError) {
        console.error(
          "[agent-slots/agent-identity] version lookup failed:",
          versionError,
        );
        return NextResponse.json(
          { error: "Failed to resolve the pinned version" },
          { status: 500 },
        );
      }
      agentId = version?.agent_id ?? null;
      pinnedVersionNumber = version?.version_number ?? null;
    }

    if (!agentId) {
      return NextResponse.json({
        agent: null,
        pinned_version_number: pinnedVersionNumber,
        system_twin: null,
      });
    }

    const { data: agent, error: agentError } = await adminClient
      .schema("agent")
      .from("definition")
      .select(
        "id, name, agent_type, is_archived, version, created_by, deleted_at, source_agent_id",
      )
      .eq("id", agentId)
      .maybeSingle();
    if (agentError) {
      console.error("[agent-slots/agent-identity] agent lookup failed:", agentError);
      return NextResponse.json(
        { error: "Failed to resolve the pinned agent" },
        { status: 500 },
      );
    }

    if (!agent) {
      return NextResponse.json({
        agent: null,
        pinned_version_number: pinnedVersionNumber,
        system_twin: null,
      });
    }

    // Owner email is display-only context ("whose personal agent is this?") —
    // best effort, never fatal.
    let ownerEmail: string | null = null;
    if (agent.created_by) {
      try {
        const { data: ownerData } = await adminClient.auth.admin.getUserById(
          agent.created_by,
        );
        ownerEmail = ownerData.user?.email ?? null;
      } catch (ownerError) {
        console.error(
          "[agent-slots/agent-identity] owner lookup failed:",
          ownerError,
        );
      }
    }

    // System twin: a builtin copied FROM this agent, else the builtin this
    // agent was copied from. Mirrors selectAgentLineageIndex, but on the
    // admin connection so out-of-scope rows still resolve.
    let systemTwin: { id: string; name: string } | null = null;
    if (agent.agent_type !== "builtin") {
      const { data: derivedTwin, error: derivedError } = await adminClient
        .schema("agent")
        .from("definition")
        .select("id, name")
        .eq("agent_type", "builtin")
        .eq("source_agent_id", agent.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (derivedError) {
        console.error(
          "[agent-slots/agent-identity] twin lookup failed:",
          derivedError,
        );
      }
      if (derivedTwin) {
        systemTwin = { id: derivedTwin.id, name: derivedTwin.name ?? derivedTwin.id };
      } else if (agent.source_agent_id) {
        const { data: sourceTwin, error: sourceError } = await adminClient
          .schema("agent")
          .from("definition")
          .select("id, name")
          .eq("id", agent.source_agent_id)
          .eq("agent_type", "builtin")
          .is("deleted_at", null)
          .maybeSingle();
        if (sourceError) {
          console.error(
            "[agent-slots/agent-identity] source twin lookup failed:",
            sourceError,
          );
        }
        if (sourceTwin) {
          systemTwin = { id: sourceTwin.id, name: sourceTwin.name ?? sourceTwin.id };
        }
      }
    }

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name ?? agent.id,
        agent_type: agent.agent_type,
        is_archived: Boolean(agent.is_archived),
        version: agent.version,
        deleted_at: agent.deleted_at,
        owner_email: ownerEmail,
      },
      pinned_version_number: pinnedVersionNumber,
      system_twin: systemTwin,
    });
  } catch (error) {
    console.error("[agent-slots/agent-identity] unexpected failure:", error);
    return NextResponse.json(
      { error: "Failed to resolve the pinned agent" },
      { status: 500 },
    );
  }
}
