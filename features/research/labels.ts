/** Human-readable labels for raw DB/agent values shown in the research UI. */

/** "page_summary" → "Page Summary". Never show raw snake_case to users. */
export function humanizeAgentType(
  agentType: string | null | undefined,
): string {
  if (!agentType) return "Analysis";
  return agentType
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
