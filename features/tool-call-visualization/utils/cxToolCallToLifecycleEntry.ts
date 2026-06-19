/**
 * Converts a persisted `CxToolCallRecord` (from the observability slice /
 * `cx_tool_call` table) into the canonical `ToolLifecycleEntry` shape that
 * every tool renderer consumes.
 *
 * This is the authoritative bridge between the two Redux slices:
 *   observability.toolCalls  →  ToolLifecycleEntry  →  ToolCallVisualization
 *
 * It is intentionally stateless — no Redux access — so it can be called from
 * selectors, hooks, or utility pipelines without pulling in store context.
 */

import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

function parseOutput(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseEvents(raw: unknown): ToolEventPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw as ToolEventPayload[];
}

function deriveStatus(record: CxToolCallRecord): ToolLifecycleEntry["status"] {
  if (record.isError || record.status === "failed") return "error";
  if (record.status === "completed") return "completed";
  if (record.status === "running") return "progress";
  return "started";
}

function isPopulatedObject(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v as Record<string, unknown>).length > 0
  );
}

export function cxToolCallToLifecycleEntry(
  record: CxToolCallRecord,
): ToolLifecycleEntry {
  const now = new Date().toISOString();

  const result = parseOutput(record.output);
  const events = parseEvents(record.executionEvents);

  const entry: ToolLifecycleEntry = {
    callId: record.callId,
    toolName: record.toolName,
    displayName: record.toolNameAsCalled ?? record.toolName,
    status: deriveStatus(record),
    arguments:
      record.arguments &&
      typeof record.arguments === "object" &&
      !Array.isArray(record.arguments)
        ? (record.arguments as Record<string, unknown>)
        : {},
    startedAt: record.startedAt ?? now,
    completedAt: record.completedAt ?? null,
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: record.errorType,
    errorMessage: record.errorMessage,
    isDelegated: false,
    events,
  };

  return entry;
}

/**
 * Build the canonical `ToolLifecycleEntry` for a PERSISTED (reloaded) tool
 * call. This is the single place that reconciles the two possible sources,
 * EITHER of which may be authoritative:
 *
 *   - the `cx_tool_call` row — full `output` + the `execution_events` log +
 *     real `started/completed` timestamps + `tool_name_as_called`, and
 *   - the `cx_message` tool_call stub — sometimes carries args the row lacks
 *     (and is the only source when no row exists yet).
 *
 * Because both the live and reloaded paths now produce an identical entry
 * (same `events`, same timestamps, same display name), a tool renders the
 * same on reload as it did live — killing the old `events: []` divergence.
 */
export function persistedToolEntry(input: {
  callId: string;
  record: CxToolCallRecord | null;
  stubName?: string | null;
  stubArguments?: Record<string, unknown> | null;
}): ToolLifecycleEntry {
  const { callId, record, stubName, stubArguments } = input;

  if (record) {
    const base = cxToolCallToLifecycleEntry(record);
    return {
      ...base,
      callId,
      // An empty `{}` seed (e.g. a pre-`tool_started` reservation) must not
      // shadow real args from the message stub — prefer whichever is populated.
      arguments: isPopulatedObject(base.arguments)
        ? base.arguments
        : isPopulatedObject(stubArguments)
          ? stubArguments
          : base.arguments,
      // Full `output` (set by the converter) wins; `output_preview` is the
      // slim-row fallback when the full output wasn't persisted.
      result: base.result ?? record.outputPreview ?? null,
    };
  }

  // No `cx_tool_call` row — render from the message stub alone.
  return {
    callId,
    toolName: stubName ?? "unknown_tool",
    displayName: stubName ?? "unknown_tool",
    status: "completed",
    arguments: stubArguments ?? {},
    startedAt: "",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}
