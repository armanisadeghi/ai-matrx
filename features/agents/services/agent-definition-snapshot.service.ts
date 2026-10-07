import { dbRowToAgentDefinition } from "@ai-matrx/chat/agents/redux/agent-definition/converters";
import type { AgentDefinition } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { supabase } from "@ai-matrx/chat/host/db";
import { recordUnavailable } from "@ai-matrx/chat/host/diagnostics";
import { operationFailed } from "@ai-matrx/kit/errors";

/**
 * Read the currently saved agent definition without hydrating Redux.
 *
 * Comparison and review surfaces must use this instead of `fetchFullAgent`:
 * that builder thunk intentionally marks its Redux record clean and clears
 * undo history, which would destroy unrelated unsaved edits in another view.
 *
 * Failures never carry database text to a person (features/access-gate THE
 * LAW): zero rows throws `recordUnavailable` with the `agent` token, so a
 * surface can render `<AccessGate token id/>` and ASK which of deleted /
 * missing / no access / signed out it really is; a real fault throws
 * `operationFailed` with the raw response as `cause` for the inspector.
 */
export async function fetchSavedAgentDefinition(
  agentId: string,
): Promise<AgentDefinition> {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();

  if (error) throw operationFailed("load this agent", error);
  if (!data)
    throw recordUnavailable({
      entity: "agent",
      reason: "unknown",
      recordId: agentId,
      token: "agent",
      relation: "agent.definition",
    });
  return dbRowToAgentDefinition(data);
}
