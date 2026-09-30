import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * Agent tool ids are stored as Postgres uuid[]. Invalid UUID syntax is rejected
 * while PostgREST casts the request, before the database row trigger can repair
 * it. Keep this small shape guard at the shared frontend conversion boundary;
 * the database trigger remains authoritative for UUIDs that are well-formed but
 * no longer identify an available tool.
 */


export function sanitizeAgentToolIds(
  toolIds: readonly string[] | null | undefined,
  context: string,
): string[] {
  if (!toolIds?.length) return [];

  const accepted: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const toolId of toolIds) {
    const normalized = toolId.toLowerCase();
    if (!isUuidShape(toolId) || seen.has(normalized)) {
      rejected.push(toolId);
      continue;
    }
    seen.add(normalized);
    accepted.push(toolId);
  }

  if (rejected.length > 0) {
    console.error("[agent-tool-sanitizer] Removed malformed or duplicate tool ids", {
      context,
      rejectedToolIds: rejected,
    });
  }

  return accepted;
}
