import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

/**
 * Classifies an agent-to-agent call from its declared input contract.
 *
 * Image agents currently declare an `image_description` variable. Detecting
 * that variable is stable across agent replacements and avoids coupling the UI
 * to a particular agent UUID. Unknown agent contracts deliberately remain
 * generic instead of being guessed from prompt text.
 */
export function isImageGenerationAgentCall(
  entry: Pick<ToolLifecycleEntry, "toolName" | "arguments">,
): boolean {
  if (entry.toolName !== "agent_call") return false;

  const variables = entry.arguments?.variables;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    return false;
  }

  return typeof (variables as Record<string, unknown>).image_description === "string";
}
