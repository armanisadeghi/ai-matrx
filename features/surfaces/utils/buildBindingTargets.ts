import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";

/**
 * Build the list of agent variables + context slots that a surface binding
 * form can map. Shared by the agent-first BindingColumn and the surface-first
 * SurfaceAgentBindPanel.
 */
export function buildBindingTargets(
  agent: Pick<AgentDefinition, "variableDefinitions" | "contextSlots">,
): BindingTarget[] {
  const targets: BindingTarget[] = [];
  const seen = new Set<string>();
  for (const v of agent.variableDefinitions ?? []) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    targets.push({
      name: v.name,
      description: v.helpText,
      required: v.required ?? false,
      defaultValue: v.defaultValue,
    });
  }
  for (const slot of agent.contextSlots ?? []) {
    if (seen.has(slot.key)) continue;
    seen.add(slot.key);
    targets.push({
      name: slot.key,
      label: slot.label,
      description: slot.description,
    });
  }
  return targets;
}
