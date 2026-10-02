/**
 * Canonical JSON shape for a single tool call — used by Raw "All", Copy for AI,
 * and the window-panel "copy every tool" action. One object, no repetition:
 *   { tool, input, result, error? }
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

export interface ToolEntryToolMeta {
  toolName: string;
  displayName: string;
  callId: string;
  status: ToolLifecycleEntry["status"];
  startedAt: string;
  completedAt: string | null;
  isDelegated: boolean;
  errorType: string | null;
}

export interface ToolEntryErrorDetail {
  errorType: string | null;
  errorMessage: string | null;
  events: ToolLifecycleEntry["events"];
}

export interface ToolEntryBundle {
  tool: ToolEntryToolMeta;
  input: Record<string, unknown>;
  result: unknown;
  /** Present only when the call failed or carries an error message. */
  error?: ToolEntryErrorDetail;
}

export function entryHasError(entry: ToolLifecycleEntry): boolean {
  return entry.status === "error" || Boolean(entry.errorMessage);
}

export function buildToolEntryBundle(entry: ToolLifecycleEntry): ToolEntryBundle {
  const tool: ToolEntryToolMeta = {
    toolName: entry.toolName,
    displayName: entry.displayName,
    callId: entry.callId,
    status: entry.status,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    isDelegated: entry.isDelegated,
    errorType: entry.errorType,
  };

  const bundle: ToolEntryBundle = {
    tool,
    input: entry.arguments ?? {},
    result: entry.result ?? null,
  };

  if (entryHasError(entry)) {
    bundle.error = {
      errorType: entry.errorType,
      errorMessage: entry.errorMessage,
      events: entry.events,
    };
  }

  return bundle;
}

/** Human-readable dump of one entry (for Copy). */
export function toolEntryBundleToHuman(entry: ToolLifecycleEntry): string {
  return JSON.stringify(buildToolEntryBundle(entry), null, 2);
}

/** Multi-entry summary for "copy all tools in this list". */
export function buildToolEntriesSummary(entries: ToolLifecycleEntry[]): {
  count: number;
  tools: ToolEntryBundle[];
} {
  return {
    count: entries.length,
    tools: entries.map(buildToolEntryBundle),
  };
}

export function toolEntriesSummaryToHuman(entries: ToolLifecycleEntry[]): string {
  const summary = buildToolEntriesSummary(entries);
  const lines = summary.tools.map((b, i) => {
    const status = b.tool.status;
    const err = b.error?.errorMessage
      ? ` — ${b.error.errorMessage.split("\n")[0]}`
      : "";
    return `${i + 1}. ${b.tool.displayName || b.tool.toolName} [${status}]${err}`;
  });
  return [
    `${summary.count} tool call${summary.count === 1 ? "" : "s"}`,
    "",
    ...lines,
    "",
    "---",
    "",
    JSON.stringify(summary, null, 2),
  ].join("\n");
}
