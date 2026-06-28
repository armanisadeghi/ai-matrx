import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { RecipeInfo } from "@/features/recipes/types";
import type { AppletSourceConfig, NeededBroker } from "@/types/customAppTypes";
import type { AgentListRow } from "@/features/agents/types/agent-definition.types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

function variableToNeededBroker(variable: VariableDefinition): NeededBroker {
  return {
    id: variable.name,
    name: variable.name,
    required: variable.required ?? false,
    dataType: typeof variable.defaultValue === "number" ? "number" : "str",
    defaultValue:
      variable.defaultValue != null ? String(variable.defaultValue) : "",
  };
}

function agentRowToRecipeInfo(row: AgentListRow): RecipeInfo {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    version: 1,
    status: row.is_active ? "active" : "inactive",
    tags: { tags: row.tags ?? [] },
  };
}

/** Agents available as applet intelligence sources (same UUIDs as legacy recipes). */
export async function listAppletSourceAgents(): Promise<RecipeInfo[]> {
  const { data, error } = await supabase.rpc("agx_get_list_full");
  if (error) throw pgErrorToError(error);

  const rows = (data ?? []) as AgentListRow[];
  return rows
    .filter((row) => row.is_active && !row.is_archived)
    .map(agentRowToRecipeInfo);
}

/** Build applet source config from an agent id (no compiled-recipe hop). */
export async function buildAppletSourceConfigForAgent(
  agentId: string,
): Promise<AppletSourceConfig> {
  const { data, error } = await supabase.rpc("agx_get_execution_minimal", {
    p_agent_id: agentId,
  });
  if (error) throw pgErrorToError(error);

  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object") {
    throw new Error(`Agent "${agentId}" not found or has no execution payload`);
  }

  const row = raw as {
    id?: string;
    variable_definitions?: VariableDefinition[] | null;
  };

  const variables = row.variable_definitions ?? [];
  const neededBrokers = variables.map(variableToNeededBroker);

  return {
    // Keep `recipe` for persisted applet rows — agent ids are 1:1 with legacy recipe ids.
    sourceType: "recipe",
    config: {
      id: agentId,
      compiledId: agentId,
      version: 1,
      neededBrokers,
      promptId: agentId,
    },
  };
}
