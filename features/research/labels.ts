/** Human-readable labels for raw DB/agent values shown in the research UI. */

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

/** "page_summary" → "Page Summary". Never show raw snake_case to users. */
export function humanizeAgentType(
  agentType: string | null | undefined,
): string {
  if (!agentType) return "Analysis";
  return humanizeIdentifier(agentType) || "Analysis";
}
