// features/mandates/go/resolveIntelligenceId.ts — ONE ID, WHATEVER IT IS.
//
// A caller holding an id from the Intelligence world (a mandate holder, a
// binding, a run row) usually cannot know what it is: an agent, an agent
// VERSION, a workflow, or a workflow VERSION — the platform stores version ids
// in holder-shaped columns. This answers that in one parallel read and hands
// back the address facts; `intelligenceGoPath` turns them into a route.
//
// New holder kinds join HERE (one more read in the Promise.all, one more arm
// in the union), so `/intelligence/go/<id>` keeps working for every kind.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentAddress } from "@ai-matrx/chat/agents/addressing/agentAddress";

export type IntelligenceTarget =
  | { kind: "agent"; address: AgentAddress }
  | {
      kind: "workflow";
      definitionId: string;
      name: string | null;
      /** Set when the supplied id was a VERSION of this workflow. */
      versionNumber: number | null;
    };

export interface IntelligenceResolution {
  target: IntelligenceTarget | null;
  /** Every read that failed, by entity token — never swallowed. */
  failures: Array<{ token: "agent" | "workflow"; error: unknown }>;
}

interface AgentResolveRow {
  input_id: string;
  is_version: boolean;
  agent_id: string;
  agent_type: string | null;
  agent_name: string | null;
  version_number: number | null;
}

export async function resolveIntelligenceId(
  supabase: SupabaseClient,
  id: string,
): Promise<IntelligenceResolution> {
  const [agent, workflow, workflowVersion] = await Promise.all([
    supabase.rpc("agx_resolve_agent_address", { p_ids: [id] }),
    supabase
      .schema("workflow")
      .from("definition")
      .select("id, name")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .schema("workflow")
      .from("definition_version")
      .select("definition_id, version_number, name")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  const failures: IntelligenceResolution["failures"] = [];
  if (agent.error) failures.push({ token: "agent", error: agent.error });
  if (workflow.error) failures.push({ token: "workflow", error: workflow.error });
  if (workflowVersion.error)
    failures.push({ token: "workflow", error: workflowVersion.error });

  const agentRow = ((agent.data ?? []) as AgentResolveRow[])[0];
  if (agentRow) {
    return {
      failures,
      target: {
        kind: "agent",
        address: {
          agentId: agentRow.agent_id,
          agentType: agentRow.agent_type,
          agentName: agentRow.agent_name,
          isVersion: agentRow.is_version,
          versionNumber: agentRow.version_number,
        },
      },
    };
  }
  if (workflow.data) {
    return {
      failures,
      target: {
        kind: "workflow",
        definitionId: workflow.data.id,
        name: workflow.data.name ?? null,
        versionNumber: null,
      },
    };
  }
  if (workflowVersion.data) {
    return {
      failures,
      target: {
        kind: "workflow",
        definitionId: workflowVersion.data.definition_id,
        name: workflowVersion.data.name ?? null,
        versionNumber: workflowVersion.data.version_number,
      },
    };
  }
  return { failures, target: null };
}
