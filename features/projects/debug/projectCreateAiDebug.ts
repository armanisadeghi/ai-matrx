/**
 * Temporary diagnostics for the /projects → New Project → Use AI flow.
 * Filter the browser console with: ProjectCreate·AI
 *
 * Remove once the RLS / agent-load regression is fixed.
 */

import type { SourceFeature } from "@/features/agents/types/instance.types";

/** Agent that powers project creation (see ProjectCreatePanel). */
export const PROJECT_CREATE_AGENT_ID = "917074a0-fc06-4ff4-9805-4a517e04d08b";

export const PROJECT_CREATE_SOURCE_FEATURE: SourceFeature = "project-create";

const LOG_PREFIX = "[ProjectCreate·AI]";

export function isProjectCreateFlow(
  sourceFeature: SourceFeature | undefined,
  agentId?: string | null,
): boolean {
  return (
    sourceFeature === PROJECT_CREATE_SOURCE_FEATURE ||
    agentId === PROJECT_CREATE_AGENT_ID
  );
}

function formatDetail(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Stage marker — one line, easy to scan in console order. */
export function logProjectCreateAiStage(
  stage: string,
  details?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!details || Object.keys(details).length === 0) {
    console.log(`${LOG_PREFIX} ${stage}`);
    return;
  }
  const parts = Object.entries(details).map(
    ([key, value]) => `${key}=${formatDetail(value)}`,
  );
  console.log(`${LOG_PREFIX} ${stage} — ${parts.join(" | ")}`);
}

/** Loud failure — RLS / RPC / launch errors. */
export function warnProjectCreateAi(
  stage: string,
  details?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  console.warn(`${LOG_PREFIX} ${stage}`, details ?? {});
}

/** Expanded snapshot — open the group when variables fail to render. */
export function logProjectCreateAiSnapshot(
  title: string,
  snapshot: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  console.groupCollapsed(`${LOG_PREFIX} snapshot: ${title}`);
  for (const [key, value] of Object.entries(snapshot)) {
    console.log(`${key}:`, value);
  }
  console.groupEnd();
}
