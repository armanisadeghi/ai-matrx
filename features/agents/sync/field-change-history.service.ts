import { readAllRows } from "@/lib/supabase/readAllRows";
import { supabase } from "@/utils/supabase/client";
import {
  toAgentVersionFieldSnapshot,
  type AgentDefinitionVersionRow,
  type AgentVersionFieldSnapshot,
} from "./field-change-history";

/**
 * Read the complete, ordered version history for one agent. Field provenance
 * is a diff decision, so a PostgREST-truncated history would be worse than no
 * answer; `readAllRows` proves completeness or throws.
 */
export async function fetchAgentVersionFieldSnapshots(
  agentId: string,
): Promise<AgentVersionFieldSnapshot[]> {
  const rows = await readAllRows<AgentDefinitionVersionRow>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("definition_version")
        .select("*", { count: "exact" })
        .eq("agent_id", agentId)
        .is("deleted_at", null)
        .order("version_number", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: `agent.definition_version:${agentId}` },
  );

  return rows.map(toAgentVersionFieldSnapshot);
}
