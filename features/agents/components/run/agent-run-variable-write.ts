import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";

interface AgentRunVariableWriteDeps {
  readDefinitions: () => readonly VariableDefinition[];
  applyValues: (values: Record<string, unknown>) => void;
}

/**
 * Build the permanent handler for the manifest's permanent `variable_values`
 * target. Definition availability is checked when the write lands; the
 * handler itself must never disappear during a conversation lifecycle change.
 */
export function createAgentRunVariableValuesHandler({
  readDefinitions,
  applyValues,
}: AgentRunVariableWriteDeps): (value: unknown) => void {
  return (value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(
        'variable_values expects an object of { "<variable name>": <value> }.',
      );
    const patch = value as Record<string, unknown>;
    const keys = Object.keys(patch);
    if (!keys.length)
      throw new Error(
        "variable_values expects at least one variable to set; an empty object would change nothing.",
      );

    const declared = readDefinitions().map((definition) => definition.name);
    if (!declared.length)
      refuseSurfaceWrite(
        "variable_values refused — this run currently declares no variables. Nothing was applied.",
      );

    const unknownNames = keys.filter((name) => !declared.includes(name));
    if (unknownNames.length)
      refuseSurfaceWrite(
        `variable_values refused — ${unknownNames.map((name) => `"${name}"`).join(", ")} ${unknownNames.length === 1 ? "is not a variable" : "are not variables"} this agent declares. Declared variables: ${declared.map((name) => `"${name}"`).join(", ")}. Nothing was applied.`,
      );

    applyValues(patch);
  };
}
