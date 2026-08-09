import { dbRowToAgentDefinition } from "@/features/agents/redux/agent-definition/converters";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";

/**
 * Read the currently saved agent definition without hydrating Redux.
 *
 * Comparison and review surfaces must use this instead of `fetchFullAgent`:
 * that builder thunk intentionally marks its Redux record clean and clears
 * undo history, which would destroy unrelated unsaved edits in another view.
 */
export async function fetchSavedAgentDefinition(
  agentId: string,
): Promise<AgentDefinition> {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error) throw pgErrorToError(error);
  return dbRowToAgentDefinition(data);
}
